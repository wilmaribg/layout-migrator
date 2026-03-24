/**
 * fix-deal-layout command — Fixes deals that have `proposal.template.layoutHtml`
 * but are missing `proposal.template.layout` (the layout template _id).
 *
 * How it works:
 *  1. Fetches ALL layout content templates and builds a Map<html, _id>
 *  2. Paginates through deals where layout is null but layoutHtml exists
 *  3. For each deal, looks up the layoutHtml in the map
 *  4. If a match is found, PATCHes the deal with the layout _id
 *
 * Usage:
 *   pnpm start fix-deal-layout --domain redrenault --dry-run
 *   pnpm start fix-deal-layout --domain redrenault
 */

import {
  buildLayoutHtmlMap,
  fetchDealsWithMissingLayout,
  patchDealLayout,
  type ProlibuClientConfig,
} from '../client/prolibuClient.js';
import { loadDomainEnv } from '../config/envLoader.js';

// ═══════════════════════════════════════════════════════════════
// COMMAND HANDLER
// ═══════════════════════════════════════════════════════════════

export interface FixDealLayoutOptions {
  domain: string;
  dryRun: boolean;
  verbose: boolean;
}

export async function handleFixDealLayout(opts: FixDealLayoutOptions): Promise<void> {
  const { domain, dryRun, verbose } = opts;

  // 1. Load domain config
  console.log(`\n🔧 fix-deal-layout: loading config for domain "${domain}"...`);
  const envConfig = await loadDomainEnv(domain);

  const apiUrl = envConfig.PROLIBU_API_URL;
  const authToken = envConfig.PROLIBU_AUTH_TOKEN;

  if (!apiUrl || !authToken) {
    console.error(`❌ Missing PROLIBU_API_URL or PROLIBU_AUTH_TOKEN in .${domain}.env`);
    process.exit(1);
  }

  const config: ProlibuClientConfig = {
    baseUrl: apiUrl,
    authToken: authToken.startsWith('Bearer ') ? authToken : `Bearer ${authToken}`,
  };

  // 2. Build layout HTML → _id map from all layout templates
  console.log(`📥 Cargando layout templates...`);
  const layoutMap = await buildLayoutHtmlMap(config);
  console.log(`   Encontrados ${layoutMap.size} layouts con HTML`);

  if (layoutMap.size === 0) {
    console.log('   ⚠️  No se encontraron layout templates con HTML — nada que hacer.');
    return;
  }

  // 3. Paginate through deals with missing layout
  console.log(`📥 Buscando deals con layout faltante...`);

  let totalProcessed = 0;
  let totalUpdated = 0;
  let totalNoMatch = 0;
  let page = 1;

  while (true) {
    const deals = await fetchDealsWithMissingLayout(config, page);

    if (deals.length === 0) break;

    for (const deal of deals) {
      totalProcessed++;
      const layoutHtml = deal.proposal?.template?.layoutHtml;

      if (!layoutHtml) continue;

      const layoutId = layoutMap.get(layoutHtml);

      if (!layoutId) {
        totalNoMatch++;
        if (verbose) {
          console.log(`   ⚠️  Deal ${deal._id} → sin match (layoutHtml no coincide)`);
        }
        continue;
      }

      if (dryRun) {
        console.log(`   ✅ Deal ${deal._id} → layout ${layoutId} (dry-run)`);
      } else {
        await patchDealLayout(deal._id, layoutId, config);
        console.log(`   ✅ Deal ${deal._id} → layout ${layoutId}`);
      }

      totalUpdated++;
    }

    page++;
  }

  // 4. Summary
  console.log(
    `\n📊 Procesados: ${totalProcessed} | Actualizados: ${totalUpdated} | Sin match: ${totalNoMatch}`
  );

  if (dryRun && totalUpdated > 0) {
    console.log(`\n💡 Ejecuta sin --dry-run para aplicar los cambios.`);
  } else if (!dryRun) {
    console.log(`\n✅ Listo. ${totalUpdated} deal(s) actualizados.`);
  }
}
