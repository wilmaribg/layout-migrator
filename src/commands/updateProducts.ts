/**
 * update-products command — Standalone command to update products that reference
 * old snippet template IDs with the new (migrated) IDs.
 *
 * This command does NOT run any migration pipeline. Instead it:
 *  1. Fetches ALL snippet templates from the account
 *  2. Builds a code→_id lookup map
 *  3. For each snippet with a matching `[code]-migrated` counterpart,
 *     maps oldId → newId
 *  4. Queries products referencing the old snippet IDs
 *  5. PATCHes products with the updated snippet IDs (unless --dry-run)
 *
 * Usage:
 *   pnpm start update-products --domain redrenault --dry-run
 *   pnpm start update-products --domain redrenault
 *   pnpm start update-products --domain redrenault --ids snippet1,snippet2
 */

import {
  fetchExistingTemplates,
  buildTemplateCodeMap,
  type ProlibuClientConfig,
  type ContentTemplateListItem,
} from '../client/prolibuClient.js';
import { loadDomainEnv } from '../config/envLoader.js';
import { runSnippetReplacementPhase } from '../pipeline/snippetReplacer.js';

// ═══════════════════════════════════════════════════════════════
// SNIPPET ID MAP BUILDER
// ═══════════════════════════════════════════════════════════════

/**
 * Build a Map<oldSnippetId, newSnippetId> from existing templates.
 *
 * For each snippet template with code `X`, if a template with code
 * `X-migrated` also exists, we create the mapping:
 *   idOf(X) → idOf(X-migrated)
 *
 * @param snippets - All snippet templates from the account
 * @param filterIds - Optional: only include snippets whose code is in this set
 */
function buildSnippetIdMap(
  snippets: ContentTemplateListItem[],
  filterIds?: Set<string>
): Map<string, string> {
  const codeMap = buildTemplateCodeMap(snippets); // code → _id
  const idMap = new Map<string, string>();

  for (const snippet of snippets) {
    const code = snippet.contentTemplateCode;
    if (!code) continue;

    // Skip templates that are already the "-migrated" variant
    if (code.endsWith('-migrated')) continue;

    // If filter provided, only include matching codes
    if (filterIds && !filterIds.has(code)) continue;

    const migratedCode = `${code}-migrated`;
    const migratedId = codeMap.get(migratedCode);

    if (migratedId) {
      idMap.set(snippet._id, migratedId);
    }
  }

  return idMap;
}

// ═══════════════════════════════════════════════════════════════
// COMMAND HANDLER
// ═══════════════════════════════════════════════════════════════

export interface UpdateProductsOptions {
  domain: string;
  dryRun: boolean;
  verbose: boolean;
  ids?: string;
}

export async function handleUpdateProducts(opts: UpdateProductsOptions): Promise<void> {
  const { domain, dryRun, verbose, ids } = opts;

  // 1. Load domain config
  console.log(`\n📦 update-products: loading config for domain "${domain}"...`);
  const envConfig = await loadDomainEnv(domain);

  const apiUrl = envConfig.PROLIBU_API_URL;
  const authToken = envConfig.PROLIBU_AUTH_TOKEN;

  if (!apiUrl || !authToken) {
    console.error(
      `❌ Missing PROLIBU_API_URL or PROLIBU_AUTH_TOKEN in .${domain}.env`
    );
    process.exit(1);
  }

  const config: ProlibuClientConfig = {
    baseUrl: apiUrl,
    authToken: authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`,
  };

  // 2. Fetch all snippet templates from the account
  console.log(`📡 Fetching snippet templates from ${domain}...`);
  const snippets = await fetchExistingTemplates(config, 'snippet');
  console.log(`   Found ${snippets.length} snippet templates`);

  if (snippets.length === 0) {
    console.log('   ⚠️  No snippet templates found — nothing to do.');
    return;
  }

  // 3. Parse optional --ids filter
  const filterIds = ids
    ? new Set(ids.split(',').map((s) => s.trim()).filter(Boolean))
    : undefined;

  if (filterIds) {
    console.log(`   🔍 Filtering to ${filterIds.size} specified code(s): ${[...filterIds].join(', ')}`);
  }

  // 4. Build snippet ID map from existing templates
  const snippetIdMap = buildSnippetIdMap(snippets, filterIds);

  if (snippetIdMap.size === 0) {
    console.log('   ⚠️  No snippet pairs found (no [code] → [code]-migrated matches).');

    if (verbose) {
      const codes = snippets
        .filter((s) => s.contentTemplateCode && !s.contentTemplateCode.endsWith('-migrated'))
        .map((s) => s.contentTemplateCode);
      console.log(`   Original snippet codes: ${codes.join(', ') || '(none)'}`);
      const migratedCodes = snippets
        .filter((s) => s.contentTemplateCode?.endsWith('-migrated'))
        .map((s) => s.contentTemplateCode);
      console.log(`   Migrated snippet codes: ${migratedCodes.join(', ') || '(none)'}`);
    }

    return;
  }

  // 5. Show the map
  console.log(`\n🗺️  Snippet ID map (${snippetIdMap.size} pair${snippetIdMap.size > 1 ? 's' : ''}):`);
  for (const [oldId, newId] of snippetIdMap) {
    // Find the codes for display
    const oldSnippet = snippets.find((s) => s._id === oldId);
    const newSnippet = snippets.find((s) => s._id === newId);
    const oldLabel = oldSnippet?.contentTemplateCode ?? oldId;
    const newLabel = newSnippet?.contentTemplateCode ?? newId;
    console.log(`   ${oldLabel} (${oldId}) → ${newLabel} (${newId})`);
  }

  // 6. Run snippet replacement phase (reuses existing logic)
  const results = await runSnippetReplacementPhase(snippetIdMap, config, dryRun, verbose);

  // 7. Final message
  const totalUpdated = results.reduce((sum, r) => sum + r.productsUpdated, 0);
  if (dryRun) {
    if (totalUpdated > 0) {
      console.log(`\n💡 Run without --dry-run to apply these changes.`);
    } else {
      console.log(`\n✅ No products need updating.`);
    }
  } else {
    console.log(`\n✅ Done. ${totalUpdated} product(s) updated.`);
  }
}
