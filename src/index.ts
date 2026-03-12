/**
 * Layout Migrator CLI — Entry point
 *
 * Usage:
 *   pnpm --filter @design-studio/layout-migrator start                          # interactive
 *   pnpm --filter @design-studio/layout-migrator migrate --domain redrenault --id <contentTemplateCode>
 *   pnpm --filter @design-studio/layout-migrator transfer --from redrenault --to honda --id <contentTemplateCode>
 */

import { Command } from 'commander';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { migrate } from './pipeline/migrationPipeline.js';
import {
  createContentTemplate,
  fetchExistingTemplates,
  buildTemplateCodeMap,
  upsertContentTemplate,
  hideTemplate,
  ProlibuApiError,
  type ProlibuClientConfig,
  type ContentTemplateListItem,
} from './client/prolibuClient.js';
import { loadDomainEnv } from './config/envLoader.js';
import { runInteractivePrompt } from './cli/interactive.js';
import { runSnippetReplacementPhase } from './pipeline/snippetReplacer.js';
import { handleUpdateProducts } from './commands/updateProducts.js';

const program = new Command();

program
  .name('layout-migrator')
  .description('Migrate Prolibu v1 content templates to Design Studio v2 format')
  .version('0.1.0');

program
  .command('migrate')
  .description('Migrate a content template by ID and upload it as a new template (same account)')
  .option('--id <code>', 'contentTemplateCode of the template', 'main-layout')
  .option('--domain <domain>', 'Load config from .<domain>.env file (e.g. --domain redrenault)')
  .option('--api-url <url>', 'Prolibu API base URL (overrides env file)')
  .option('--token <token>', 'Auth token (overrides env file)')
  .option('--name <name>', 'Name for the new template (default: original name + " [migrated]")')
  .option('--type <type>', 'Template type: layout | content | snippet', 'layout')
  .option('--save-json [path]', 'Also save JSON locally (optional path, default: ./output/)')
  .option('--json-only', 'Only save JSON locally, do NOT upload to Prolibu', false)
  .option('--dry-run', 'Validate only — no upload, no file write', false)
  .option('--no-sync-fonts', 'Disable automatic font synchronization (enabled by default)')
  .option('--verbose', 'Show warnings and stats', false)
  .action(handleMigrate);

// ── Transfer between accounts ──────────────────────────────
program
  .command('transfer')
  .description('Migrate a template from one Prolibu account to another')
  .option('--id <code>', 'contentTemplateCode from the source account', 'main-layout')
  .requiredOption('--from <domain>', 'Source domain (reads from .<domain>.env)')
  .requiredOption('--to <domain>', 'Destination domain (reads from .<domain>.env)')
  .option('--name <name>', 'Name for the new template (default: original name + " [migrated]")')
  .option('--type <type>', 'Template type: layout | content | snippet', 'layout')
  .option('--save-json [path]', 'Also save JSON locally')
  .option('--dry-run', 'Validate only — no upload, no file write', false)
  .option('--no-sync-fonts', 'Disable automatic font synchronization (enabled by default)')
  .option('--verbose', 'Show warnings and stats', false)
  .action(handleTransfer);

// ── Migrate ALL templates from one account to another ──────
program
  .command('migrate-all')
  .description('Migrate ALL templates from one Prolibu account to another (batch with upsert)')
  .requiredOption('--from <domain>', 'Source domain (reads from .<domain>.env)')
  .requiredOption('--to <domain>', 'Destination domain (reads from .<domain>.env)')
  .option('--type <type>', 'Filter by template type: layout | content | snippet | all', 'all')
  .option('--concurrency <n>', 'Number of parallel migrations (default: 5)', '5')
  .option('--dry-run', 'List what would be migrated, no actual changes', false)
  .option('--hide-old', 'Hide (disable) old templates in source after migration', false)
  .option('--verbose', 'Show detailed progress and warnings', false)
  .option(
    '--ids <codes>',
    'Comma-separated template codes/IDs to migrate (or use MIGRATION_IDS in .env)'
  )
  .option(
    '--keep-original-name',
    'Keep original template name and code (no -migrated suffix)',
    false
  )
  .option(
    '--update-products',
    'Update products that reference migrated snippets with new snippet IDs',
    false
  )
  .action(handleMigrateAll);

// ── Update products (standalone snippet→product replacement) ──
program
  .command('update-products')
  .description('Update products that reference old snippet IDs with their migrated counterparts')
  .requiredOption('--domain <domain>', 'Account domain (reads from .<domain>.env)')
  .option('--dry-run', 'Preview changes without applying them', false)
  .option('--verbose', 'Show detailed progress', false)
  .option('--ids <codes>', 'Comma-separated snippet codes to process (default: all)')
  .action(handleUpdateProducts);

// ── Interactive command (no flags needed) ──────────────────
program
  .command('run')
  .description('Interactive migration — prompts for domain, template ID, and options')
  .action(runInteractiveFlow);

// Default to interactive mode when no command is given
program.action(runInteractiveFlow);

async function runInteractiveFlow() {
  const answers = await runInteractivePrompt();

  // Update-products standalone mode
  if (answers.updateProductsOnly) {
    await handleUpdateProducts({
      domain: answers.domain,
      dryRun: answers.dryRun,
      verbose: answers.verbose,
      ids: answers.ids?.join(','),
    });
    return;
  }

  // Migrate-all mode (batch transfer)
  if (answers.migrateAll && answers.toDomain) {
    await handleMigrateAll({
      from: answers.domain,
      to: answers.toDomain,
      type: answers.templateType,
      concurrency: String(answers.concurrency ?? 5),
      dryRun: answers.dryRun,
      verbose: answers.verbose,
      hideOld: answers.hideOldTemplates ?? false,
      ids: answers.ids,
      keepOriginalName: answers.keepOriginalName,
      updateProducts: answers.updateProducts ?? false,
    });
    return;
  }

  if (answers.toDomain) {
    // Transfer mode
    await handleTransfer({
      id: answers.templateId,
      from: answers.domain,
      to: answers.toDomain,
      name: answers.name,
      type: answers.templateType,
      saveJson: answers.saveJson ? (answers.outputPath ?? true) : undefined,
      dryRun: answers.dryRun,
      syncFonts: true, // Always sync fonts in interactive mode
      verbose: answers.verbose,
    });
  } else {
    // Same-account migrate
    await handleMigrate({
      id: answers.templateId,
      domain: answers.domain,
      name: answers.name,
      type: answers.templateType,
      saveJson: answers.saveJson ? (answers.outputPath ?? true) : undefined,
      jsonOnly: false,
      dryRun: answers.dryRun,
      syncFonts: true, // Always sync fonts in interactive mode
      verbose: answers.verbose,
    });
  }
}

async function handleMigrate(opts: {
  id: string;
  domain?: string;
  apiUrl?: string;
  token?: string;
  name?: string;
  type?: string;
  saveJson?: string | boolean;
  jsonOnly: boolean;
  dryRun: boolean;
  syncFonts: boolean;
  verbose: boolean;
}) {
  const { id, domain, verbose } = opts;

  // Load env from domain file if specified
  let envApiUrl: string | undefined;
  let envToken: string | undefined;

  if (domain) {
    try {
      const env = await loadDomainEnv(domain);
      envApiUrl = env.PROLIBU_API_URL;
      envToken = env.PROLIBU_AUTH_TOKEN;
      console.log(`📂 Loaded config from .${domain}.env`);
    } catch (error) {
      console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }

  // Priority: CLI flags > domain .env file > process.env > defaults
  const apiUrl = opts.apiUrl ?? envApiUrl ?? process.env.PROLIBU_API_URL;

  if (!apiUrl) {
    console.error(
      '❌ API URL required. Use --domain <name>, --api-url <url>, or set PROLIBU_API_URL env var.'
    );
    process.exit(1);
  }
  const token = opts.token ?? envToken ?? process.env.PROLIBU_AUTH_TOKEN;

  if (!token) {
    console.error(
      '❌ Auth token required. Use --token, --domain <name>, or set PROLIBU_AUTH_TOKEN env var.'
    );
    process.exit(1);
  }

  const config: ProlibuClientConfig = {
    baseUrl: apiUrl,
    authToken: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
  };

  console.log(`🔄 Migrating contentTemplateCode: ${id}`);
  console.log(`   API: ${apiUrl}`);

  try {
    // Build fontApiConfig if font sync is enabled
    const fontApiConfig = opts.syncFonts
      ? {
          baseUrl: apiUrl,
          authToken: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
        }
      : undefined;

    const result = await migrate(id, { config, fontApiConfig });

    // Stats
    printStats(result.stats);
    printWarnings(result.warnings);
    printValidation(result.validation, verbose);

    // ── Dry run: stop here ─────────────────────────────────
    if (opts.dryRun) {
      console.log('\n🔍 Dry run — no upload, no file written');
      if (!result.validation.valid) process.exit(2);
      return;
    }

    // ── Save JSON locally (if --save-json or --json-only) ──
    if (opts.saveJson || opts.jsonOnly) {
      const jsonPath =
        typeof opts.saveJson === 'string'
          ? resolve(opts.saveJson)
          : resolve('output', `${sanitizeFilename(result.document.name)}.json`);

      await mkdir(dirname(jsonPath), { recursive: true });
      await writeFile(jsonPath, JSON.stringify(result.document, null, 2), 'utf-8');
      console.log(`\n📁 JSON saved to: ${jsonPath}`);
    }

    // ── Upload to Prolibu (default behavior) ───────────────
    if (!opts.jsonOnly) {
      console.log('\n📤 Uploading to Prolibu as new template...');

      const created = await createContentTemplate(result.document, config, {
        name: opts.name,
        templateType: opts.type,
        fontIds: result.fontSync?.fontIds,
      });

      console.log(
        `✅ Created: ${created.contentTemplateName ?? opts.name ?? result.document.name}`
      );
      console.log(`   ID: ${created._id}`);
      console.log(
        `   URL: ${apiUrl.replace('/api', '')}/ui/spa/suite/contentTemplates/edit/${created._id}`
      );
      console.log(`   Debug: http://localhost:3000/?id=${created._id}`);
    }

    // Exit code based on validation
    if (!result.validation.valid) {
      process.exit(2);
    }
  } catch (error) {
    console.error('\n❌ Migration failed:');
    if (error instanceof Error) {
      console.error(`   ${error.name}: ${error.message}`);
      if (verbose && error.stack) {
        console.error(error.stack);
      }
    } else {
      console.error(`   ${String(error)}`);
    }
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════
// TRANSFER (cross-account)
// ═══════════════════════════════════════════════════════════════

async function handleTransfer(opts: {
  id: string;
  from: string;
  to: string;
  name?: string;
  type?: string;
  saveJson?: string | boolean;
  dryRun: boolean;
  syncFonts: boolean;
  verbose: boolean;
}) {
  const { id, verbose } = opts;

  // Resolve source config
  const sourceConfig = await resolveConfigFromDomain(opts.from, 'Source');
  // Resolve destination config
  const destConfig = await resolveConfigFromDomain(opts.to, 'Destination');

  console.log(`🔄 Transferring contentTemplateCode: ${id}`);
  console.log(`   From: ${opts.from} (${sourceConfig.baseUrl})`);
  console.log(`   To:   ${opts.to} (${destConfig.baseUrl})`);

  try {
    // Build fontApiConfig pointing to DESTINATION account
    const fontApiConfig = opts.syncFonts
      ? {
          baseUrl: destConfig.baseUrl,
          authToken: destConfig.authToken,
        }
      : undefined;

    const result = await migrate(id, { config: sourceConfig, fontApiConfig });

    // Stats
    printStats(result.stats);
    printWarnings(result.warnings);
    printValidation(result.validation, verbose);

    // ── Dry run: stop here ─────────────────────────────────
    if (opts.dryRun) {
      console.log('\n🔍 Dry run — no upload, no file written');
      if (!result.validation.valid) process.exit(2);
      return;
    }

    // ── Save JSON locally (optional) ───────────────────────
    if (opts.saveJson) {
      const jsonPath =
        typeof opts.saveJson === 'string'
          ? resolve(opts.saveJson)
          : resolve('output', `${sanitizeFilename(result.document.name)}.json`);

      await mkdir(dirname(jsonPath), { recursive: true });
      await writeFile(jsonPath, JSON.stringify(result.document, null, 2), 'utf-8');
      console.log(`\n📁 JSON saved to: ${jsonPath}`);
    }

    // ── Upload to DESTINATION account ──────────────────────
    console.log(`\n📤 Uploading to ${opts.to} as new template...`);

    const created = await createContentTemplate(result.document, destConfig, {
      name: opts.name,
      templateType: opts.type,
      fontIds: result.fontSync?.fontIds,
    });

    console.log(
      `✅ Created on ${opts.to}: ${created.contentTemplateName ?? opts.name ?? result.document.name}`
    );
    console.log(`   ID: ${created._id}`);
    console.log(
      `   URL: ${destConfig.baseUrl.replace('/api', '')}/ui/spa/suite/contentTemplates/edit/${created._id}`
    );
    console.log(`   Debug: http://localhost:3000/?id=${created._id}`);

    if (!result.validation.valid) process.exit(2);
  } catch (error) {
    console.error('\n❌ Transfer failed:');
    if (error instanceof ProlibuApiError) {
      console.error(`   ${error.name}: ${error.message}`);
      if (error.responseBody) {
        console.error(`   Response body: ${error.responseBody}`);
      }
      if (verbose && error.stack) console.error(error.stack);
    } else if (error instanceof Error) {
      console.error(`   ${error.name}: ${error.message}`);
      if (verbose && error.stack) console.error(error.stack);
    } else {
      console.error(`   ${String(error)}`);
    }
    process.exit(1);
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

async function resolveConfigFromDomain(
  domain: string,
  label: string
): Promise<ProlibuClientConfig> {
  const env = await loadDomainEnv(domain);
  const apiUrl = env.PROLIBU_API_URL ?? `https://${domain}.prolibu.com/api`;
  const token = env.PROLIBU_AUTH_TOKEN;

  if (!token) {
    throw new Error(`${label}: No PROLIBU_AUTH_TOKEN found in .${domain}.env`);
  }

  console.log(`📂 ${label}: loaded .${domain}.env`);
  return {
    baseUrl: apiUrl,
    authToken: token.startsWith('Bearer ') ? token : `Bearer ${token}`,
  };
}

function printStats(stats: import('./transformers/nodeRouter.js').MigrationStats) {
  console.log('\n📊 Migration Stats:');
  console.log(`   Pages: ${stats.pages}`);
  console.log(`   Total source nodes: ${stats.totalSourceNodes}`);
  console.log(`   Migrated nodes: ${stats.migratedNodes}`);
  console.log(`   Skipped nodes: ${stats.skippedNodes}`);
  console.log(`   Text: ${stats.textNodes}`);
  console.log(`   Components: ${stats.componentNodes}`);
  console.log(`   Images: ${stats.imageNodes}`);
  console.log(`   Rectangles: ${stats.rectangleNodes}`);
  console.log(`   Lines: ${stats.lineNodes}`);
  console.log(`   Frames: ${stats.frameNodes}`);
}

function printWarnings(warnings: string[]) {
  if (warnings.length > 0) {
    console.log(`\n⚠️  Warnings (${warnings.length}):`);
    for (const w of warnings) {
      console.log(`   - ${w}`);
    }
  }
}

function printValidation(
  validation: import('@design-studio/schema').ValidationResult,
  verbose: boolean
) {
  if (validation.valid) {
    console.log('\n✅ Document validation: PASSED');
  } else {
    console.log('\n❌ Document validation: FAILED');
    for (const err of validation.errors) {
      console.log(`   Error: ${err.message} (${err.path}) [${err.code}]`);
    }
  }

  if (verbose && validation.warnings.length > 0) {
    console.log(`\n   Validation warnings (${validation.warnings.length}):`);
    for (const w of validation.warnings) {
      console.log(`   - ${w.message} (${w.path})`);
    }
  }
}

function sanitizeFilename(name: string): string {
  const cleaned = name
    .replace(/[^a-zA-Z0-9_\-\s]/g, '')
    .replace(/\s+/g, '-')
    .toLowerCase()
    .slice(0, 100);
  return cleaned || 'unnamed-template';
}

// ═══════════════════════════════════════════════════════════════
// MIGRATE ALL (batch transfer with upsert)
// ═══════════════════════════════════════════════════════════════

async function handleMigrateAll(opts: {
  from: string;
  to: string;
  type: string;
  concurrency: string;
  dryRun: boolean;
  verbose: boolean;
  hideOld: boolean;
  ids?: string | string[];
  keepOriginalName?: boolean;
  updateProducts?: boolean;
}) {
  const concurrency = parseInt(opts.concurrency, 10) || 5;
  const templateType =
    opts.type === 'all' ? undefined : (opts.type as 'layout' | 'content' | 'snippet');

  const sourceConfig = await resolveConfigFromDomain(opts.from, 'Source');
  const destConfig = await resolveConfigFromDomain(opts.to, 'Destination');

  // Resolve IDs: CLI --ids > MIGRATION_IDS from .env
  let resolvedIds = opts.ids;
  if (!resolvedIds) {
    try {
      const sourceEnv = await loadDomainEnv(opts.from);
      const envIds = sourceEnv.MIGRATION_IDS?.split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (envIds && envIds.length > 0) {
        resolvedIds = envIds;
        console.log(`   📋 Using ${envIds.length} IDs from MIGRATION_IDS in .${opts.from}.env`);
      }
    } catch {
      // Env already loaded for config, MIGRATION_IDS not present — continue without filter
    }
  }

  console.log(`\n🔄 Migrate All: ${opts.from} → ${opts.to}`);
  console.log(`   Type filter: ${opts.type}`);
  console.log(`   Concurrency: ${concurrency}`);
  if (opts.keepOriginalName) {
    console.log(`   Keep name:   Yes (no -migrated suffix)`);
  }
  if (opts.hideOld) {
    console.log(`   Hide old:    Yes (will hide source templates after migration)`);
  }
  if (opts.updateProducts) {
    console.log(`   Update products: Yes (will replace old snippet IDs in products)`);
  }

  // ⚠️ Warning: keepOriginalName + same account = will OVERWRITE originals
  if (opts.keepOriginalName && opts.from === opts.to) {
    console.log(
      `\n   ⚠️  WARNING: Same account + keep-original-name will OVERWRITE original templates!`
    );
  }

  // 1. Fetch ALL templates from source
  console.log(`\n📥 Fetching templates from source (${opts.from})...`);
  const sourceTemplates = await fetchExistingTemplates(sourceConfig, templateType);
  console.log(`   Found ${sourceTemplates.length} templates`);

  // 1b. Filter by specific IDs if provided (accepts _id or contentTemplateCode)
  let templatesToMigrate = sourceTemplates;
  const idsToFilter: string[] = resolvedIds
    ? typeof resolvedIds === 'string'
      ? resolvedIds.split(',').map((s) => s.trim())
      : resolvedIds
    : [];

  if (idsToFilter.length > 0) {
    const idSet = new Set(idsToFilter);
    templatesToMigrate = sourceTemplates.filter(
      (t) => idSet.has(t._id) || idSet.has(t.contentTemplateCode ?? '')
    );

    // Warning: IDs not found
    const foundIds = new Set(
      templatesToMigrate.flatMap((t) => [t._id, t.contentTemplateCode].filter(Boolean) as string[])
    );
    const notFound = idsToFilter.filter((id) => !foundIds.has(id));
    if (notFound.length > 0) {
      console.log(`   ⚠️  IDs no encontrados: ${notFound.join(', ')}`);
    }
    console.log(`   Filtered to ${templatesToMigrate.length} templates by IDs`);
  }

  if (templatesToMigrate.length === 0) {
    console.log('   Nothing to migrate.');
    return;
  }

  // 2. Fetch existing templates from destination for upsert logic
  console.log(`\n📥 Fetching existing templates from destination (${opts.to})...`);
  const destTemplates = await fetchExistingTemplates(destConfig, templateType);
  const destMap = buildTemplateCodeMap(destTemplates);
  console.log(`   Found ${destTemplates.length} existing templates in destination`);

  // 3. Dry run: just show what would happen
  if (opts.dryRun) {
    console.log('\n🔍 Dry run — showing what would be migrated:\n');
    let toCreate = 0;
    let toUpdate = 0;

    for (const t of templatesToMigrate) {
      const code = t.contentTemplateCode ?? t.contentTemplateName;
      // Check for the migrated code (with "-migrated" suffix unless keepOriginalName)
      const targetCode = opts.keepOriginalName ? code : `${code}-migrated`;
      const exists = destMap.has(targetCode);
      const action = exists ? 'UPDATE' : 'CREATE';

      if (exists) toUpdate++;
      else toCreate++;

      if (opts.verbose) {
        console.log(`   [${action}] ${t.contentTemplateName} → ${targetCode} (${t.templateType})`);
      }
    }

    console.log(`\n📊 Summary:`);
    console.log(`   Would CREATE: ${toCreate}`);
    console.log(`   Would UPDATE: ${toUpdate}`);
    console.log(`   Total: ${templatesToMigrate.length}`);

    // Dry-run snippet replacement preview (always show when there are snippets)
    const snippetTemplates = templatesToMigrate.filter((t) => t.templateType === 'snippet');
    if (snippetTemplates.length > 0) {
      if (!opts.updateProducts) {
        console.log(
          `\n   ℹ️  Found ${snippetTemplates.length} snippet templates. Use --update-products to replace snippet IDs in products.`
        );
      }
      // Build a temporary map using source _id as both old and new (just to query products)
      const dryRunMap = new Map<string, string>();
      for (const t of snippetTemplates) {
        dryRunMap.set(t._id, t._id); // placeholder — actual new ID unknown in dry run
      }
      await runSnippetReplacementPhase(dryRunMap, destConfig, true, opts.verbose);
    }

    return;
  }

  // 4. Process in batches with concurrency
  console.log(`\n📤 Starting migration with concurrency ${concurrency}...`);

  const results = {
    created: 0,
    updated: 0,
    failed: 0,
    errors: [] as Array<{ name: string; error: string }>,
    /** IDs of source templates that were successfully migrated (for hiding) */
    migratedSourceIds: [] as string[],
  };

  /** Map of old snippet ID → new snippet ID (built during migration) */
  const snippetIdMap = new Map<string, string>();

  const queue = [...templatesToMigrate];
  let completed = 0;
  const total = queue.length;

  const processTemplate = async (template: ContentTemplateListItem) => {
    const code = template.contentTemplateCode ?? template.contentTemplateName;
    const targetCode = opts.keepOriginalName ? code : `${code}-migrated`;

    try {
      // Build fontApiConfig pointing to destination
      const fontApiConfig = {
        baseUrl: destConfig.baseUrl,
        authToken: destConfig.authToken,
      };

      // Run migration pipeline
      const migrationResult = await migrate(template._id, {
        config: sourceConfig,
        fontApiConfig,
      });

      // Upsert to destination
      const upsertResult = await upsertContentTemplate(
        migrationResult.document,
        destConfig,
        destMap,
        {
          templateType: template.templateType,
          sourceCode: code,
          fontIds: migrationResult.fontSync?.fontIds,
          taxonomy: migrationResult.taxonomy,
          keepOriginalName: opts.keepOriginalName,
        }
      );

      if (upsertResult.action === 'created') {
        results.created++;
        // Add to map with target code so subsequent templates can detect it
        destMap.set(targetCode, upsertResult._id);
      } else {
        results.updated++;
      }

      // Track old → new snippet ID mapping for product replacement
      if (template.templateType === 'snippet') {
        snippetIdMap.set(template._id, upsertResult._id);
      }

      // Track successfully migrated source template ID (for hiding later)
      results.migratedSourceIds.push(template._id);

      completed++;
      const pct = Math.round((completed / total) * 100);
      console.log(
        `   [${pct}%] ${upsertResult.action.toUpperCase()}: ${template.contentTemplateName} → ${targetCode}`
      );
    } catch (error) {
      results.failed++;
      completed++;
      const errorMsg = error instanceof Error ? error.message : String(error);
      results.errors.push({ name: template.contentTemplateName, error: errorMsg });
      console.log(`   [ERR] FAILED: ${template.contentTemplateName} — ${errorMsg}`);
    }
  };

  // Process with concurrency limit
  const running: Promise<void>[] = [];

  while (queue.length > 0 || running.length > 0) {
    // Fill up to concurrency limit
    while (running.length < concurrency && queue.length > 0) {
      const template = queue.shift()!;
      const promise = processTemplate(template).then(() => {
        running.splice(running.indexOf(promise), 1);
      });
      running.push(promise);
    }

    // Wait for at least one to complete
    if (running.length > 0) {
      await Promise.race(running);
    }
  }

  // 5. Print summary
  console.log('\n' + '═'.repeat(50));
  console.log('📊 Migration Complete\n');
  console.log(`   ✅ Created: ${results.created}`);
  console.log(`   🔄 Updated: ${results.updated}`);
  console.log(`   ❌ Failed:  ${results.failed}`);
  console.log(`   ─────────────────`);
  console.log(`   Total:    ${total}`);

  if (results.errors.length > 0 && opts.verbose) {
    console.log('\n❌ Errors:');
    for (const e of results.errors) {
      console.log(`   - ${e.name}: ${e.error}`);
    }
  }

  // 6. Snippet → Product replacement phase
  if (opts.updateProducts && snippetIdMap.size > 0) {
    if (opts.from !== opts.to) {
      console.log(
        `\n⚠️  Warning: --update-products with cross-account migration (${opts.from} → ${opts.to}).`
      );
      console.log(`   Products in destination may not reference source snippet IDs.`);
      console.log(`   This is typically useful only for same-account migrations.`);
    }
    await runSnippetReplacementPhase(snippetIdMap, destConfig, false, opts.verbose);
  }

  // 7. Hide old templates if requested
  if (opts.hideOld && results.migratedSourceIds.length > 0) {
    console.log(`\n🙈 Hiding ${results.migratedSourceIds.length} old templates in source...`);

    let hidden = 0;
    let hideFailed = 0;

    for (const sourceId of results.migratedSourceIds) {
      try {
        await hideTemplate(sourceId, sourceConfig);
        hidden++;
      } catch (error) {
        hideFailed++;
        if (opts.verbose) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.log(`   [ERR] Failed to hide ${sourceId}: ${errorMsg}`);
        }
      }
    }

    console.log(`   ✅ Hidden: ${hidden}`);
    if (hideFailed > 0) {
      console.log(`   ❌ Failed to hide: ${hideFailed}`);
    }
  }

  if (results.failed > 0) {
    process.exit(1);
  }
}

program.parseAsync().catch((err) => {
  console.error('❌ Unexpected error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
