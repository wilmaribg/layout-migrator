/**
 * Snippet Replacer — After migrating snippet templates, updates all products
 * that reference the old snippet ID to use the new snippet ID.
 *
 * Flow:
 * 1. Query products that have the old snippet ID in their `snippets` array
 * 2. For each product, replace the old ID with the new ID
 * 3. PATCH the product with the updated snippets array
 */

import {
  findProductsBySnippet,
  updateProductSnippets,
  type ProlibuClientConfig,
} from '../client/prolibuClient.js';
import type { SnippetReplacementResult } from '../types/prolibu.js';

/**
 * Replace a snippet ID in all products that reference it.
 *
 * @param oldSnippetId - The source snippet template _id (before migration)
 * @param newSnippetId - The destination snippet template _id (after migration)
 * @param config       - API config for the account where products live
 * @param dryRun       - If true, only report what would change without patching
 */
export async function replaceSnippetInProducts(
  oldSnippetId: string,
  newSnippetId: string,
  config: ProlibuClientConfig,
  dryRun = false
): Promise<SnippetReplacementResult> {
  // Guard: skip if old and new IDs are identical (e.g. --keep-original-name on same account)
  // Only skip in non-dry-run mode — dry-run needs to query products to report what would change
  if (oldSnippetId === newSnippetId && !dryRun) {
    return {
      oldSnippetId,
      newSnippetId,
      productsUpdated: 0,
      productIds: [],
      failedProducts: [],
      skipped: true,
    };
  }

  // 1. Find products that use the old snippet
  const products = await findProductsBySnippet(oldSnippetId, config);

  if (products.length === 0) {
    return {
      oldSnippetId,
      newSnippetId,
      productsUpdated: 0,
      productIds: [],
      failedProducts: [],
      skipped: true,
    };
  }

  // Dry run: report only
  if (dryRun) {
    return {
      oldSnippetId,
      newSnippetId,
      productsUpdated: products.length,
      productIds: products.map((p) => p._id),
      failedProducts: [],
      skipped: false,
    };
  }

  // 2. Update each product (with small delay to avoid rate limiting)
  const updatedIds: string[] = [];
  const failedProducts: Array<{ productId: string; error: string }> = [];

  for (const product of products) {
    try {
      // Build new snippets array: replace old ID with new ID, preserve others
      const newSnippets = product.snippets.map((id) => (id === oldSnippetId ? newSnippetId : id));

      await updateProductSnippets(product._id, newSnippets, config);
      updatedIds.push(product._id);

      // Small delay between PATCH requests to avoid overwhelming the API
      await new Promise((resolve) => setTimeout(resolve, 250));
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      failedProducts.push({ productId: product._id, error: errorMsg });
    }
  }

  return {
    oldSnippetId,
    newSnippetId,
    productsUpdated: updatedIds.length,
    productIds: updatedIds,
    failedProducts,
    skipped: false,
  };
}

/**
 * Run the full snippet replacement phase for all migrated snippets.
 *
 * @param snippetIdMap - Map of oldSnippetId → newSnippetId (built during migration)
 * @param config       - API config for the destination account
 * @param dryRun       - If true, only report what would change
 * @param verbose      - If true, log detailed progress
 */
export async function runSnippetReplacementPhase(
  snippetIdMap: Map<string, string>,
  config: ProlibuClientConfig,
  dryRun = false,
  verbose = false
): Promise<SnippetReplacementResult[]> {
  if (snippetIdMap.size === 0) return [];

  const prefix = dryRun ? '🔍 [DRY RUN]' : '🔗';
  console.log(`\n${prefix} Snippet → Product replacement phase (${snippetIdMap.size} snippets)...`);

  const results: SnippetReplacementResult[] = [];

  for (const [oldId, newId] of snippetIdMap) {
    try {
      const result = await replaceSnippetInProducts(oldId, newId, config, dryRun);
      results.push(result);

      if (result.skipped) {
        if (verbose) {
          console.log(`   ⏭️  ${oldId} → ${newId}: no products found`);
        }
      } else {
        const verb = dryRun ? 'would update' : 'updated';
        console.log(`   ✅ ${oldId} → ${newId}: ${verb} ${result.productsUpdated} products`);

        if (result.failedProducts.length > 0) {
          console.log(`      ⚠️  ${result.failedProducts.length} products failed`);
          if (verbose) {
            for (const f of result.failedProducts) {
              console.log(`         - ${f.productId}: ${f.error}`);
            }
          }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.log(`   ❌ ${oldId} → ${newId}: failed — ${errorMsg}`);
      results.push({
        oldSnippetId: oldId,
        newSnippetId: newId,
        productsUpdated: 0,
        productIds: [],
        failedProducts: [],
        skipped: false,
      });
    }
  }

  // Summary
  const totalUpdated = results.reduce((sum, r) => sum + r.productsUpdated, 0);
  const totalFailed = results.reduce((sum, r) => sum + r.failedProducts.length, 0);
  const totalSkipped = results.filter((r) => r.skipped).length;

  console.log(`\n   📊 Snippet replacement summary:`);
  console.log(`      Products ${dryRun ? 'to update' : 'updated'}: ${totalUpdated}`);
  if (totalFailed > 0) {
    console.log(`      Products failed: ${totalFailed}`);
  }
  if (totalSkipped > 0) {
    console.log(`      Snippets with no products: ${totalSkipped}`);
  }

  return results;
}
