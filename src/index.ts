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
  ProlibuApiError,
  type ProlibuClientConfig,
} from './client/prolibuClient.js';
import { loadDomainEnv } from './config/envLoader.js';
import { runInteractivePrompt } from './cli/interactive.js';

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

// ── Interactive command (no flags needed) ──────────────────
program
  .command('run')
  .description('Interactive migration — prompts for domain, template ID, and options')
  .action(runInteractiveFlow);

// Default to interactive mode when no command is given
program.action(runInteractiveFlow);

async function runInteractiveFlow() {
  const answers = await runInteractivePrompt();
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

program.parseAsync().catch((err) => {
  console.error('❌ Unexpected error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
