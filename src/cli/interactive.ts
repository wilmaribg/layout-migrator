/**
 * Interactive CLI — prompts the user step by step so they don't need flags.
 *
 * Uses arrow-key navigation for selections (zero external dependencies).
 */

import { resolve } from 'node:path';
import { listAvailableDomains, loadDomainEnv } from '../config/envLoader.js';
import { select, confirm, textInput } from './prompts.js';

export interface InteractiveAnswers {
  domain: string;
  toDomain?: string;
  templateId: string;
  name?: string;
  templateType: string;
  verbose: boolean;
  dryRun: boolean;
  saveJson: boolean;
  outputPath?: string;
  /** New: indicates batch migration mode */
  migrateAll?: boolean;
  /** Concurrency for batch migration */
  concurrency?: number;
  /** Hide (disable) old templates in source after migration */
  hideOldTemplates?: boolean;
  /** Specific template IDs to migrate (accepts _id or contentTemplateCode) */
  ids?: string[];
  /** Keep original name without -migrated suffix */
  keepOriginalName?: boolean;
  /** Update products that reference migrated snippets with new snippet IDs */
  updateProducts?: boolean;
  /** Standalone update-products mode (no migration) */
  updateProductsOnly?: boolean;
}

/**
 * Run the interactive prompt flow and return the user's choices.
 */
export async function runInteractivePrompt(): Promise<InteractiveAnswers> {
  console.log('\n🚀 Layout Migrator — Modo Interactivo\n');

  // ── 0. Mode selection ──────────────────────────────────────
  const mode = await select({
    message: '¿Qué deseas hacer?',
    choices: [
      { label: 'Migrar dentro de la misma cuenta', value: 'migrate' as const },
      { label: 'Transferir de una cuenta a otra', value: 'transfer' as const },
      {
        label: 'Transferir TODOS los templates de una cuenta a otra',
        value: 'migrate-all' as const,
      },
      {
        label: 'Actualizar productos (reemplazar snippet IDs ya migrados)',
        value: 'update-products' as const,
      },
    ],
  });
  const isTransfer = mode === 'transfer';
  const isMigrateAll = mode === 'migrate-all';
  const isUpdateProducts = mode === 'update-products';

  // ── 1. Source domain selection ─────────────────────────────
  const projectRoot = resolve(import.meta.dirname ?? process.cwd(), '..', '..');
  const domains = listAvailableDomains(projectRoot);

  const sourceLabel = isTransfer || isMigrateAll ? 'Dominio origen' : 'Dominio';
  const domain = await pickDomain(domains, sourceLabel);

  // ── update-products: standalone flow ───────────────────────
  if (isUpdateProducts) {
    return await runUpdateProductsPrompt(domain);
  }

  // ── 1b. Destination domain (transfer or migrate-all) ───────
  let toDomain: string | undefined;
  if (isTransfer || isMigrateAll) {
    toDomain = await pickDomain(domains, 'Dominio destino');
    if (toDomain === domain) {
      console.log('  ⚠️  Origen y destino son iguales — se crearán copias en la misma cuenta.\n');
    }
  }

  // ── 2. For migrate-all: type filter and options ────────────
  let templateType = 'layout';
  let concurrency = 5;
  let dryRun = false;
  let ids: string[] | undefined;
  let keepOriginalName = false;

  if (isMigrateAll) {
    templateType = await select({
      message: '¿Qué tipos de templates migrar?',
      choices: [
        { label: 'Todos los tipos', value: 'all' },
        { label: 'Solo layouts', value: 'layout' },
        { label: 'Solo contenido', value: 'content' },
        { label: 'Solo snippets', value: 'snippet' },
      ],
    });

    // ── 2b. Ask if migrating all or specific IDs ─────────────
    const migrateMode = await select({
      message: '¿Qué templates migrar?',
      choices: [
        { label: 'Todos los templates', value: 'all' },
        { label: 'Solo IDs específicos', value: 'specific' },
      ],
    });

    if (migrateMode === 'specific') {
      // Try to load MIGRATION_IDS from env
      let envIds: string[] | undefined;
      try {
        const env = await loadDomainEnv(domain);
        envIds = env.MIGRATION_IDS?.split(',')
          .map((id) => id.trim())
          .filter(Boolean);
      } catch {
        // Env file may not exist yet, that's ok
      }

      if (envIds && envIds.length > 0) {
        console.log(`  📋 Encontrados ${envIds.length} IDs en MIGRATION_IDS del .env`);
        const useEnvIds = await confirm({
          message: `¿Usar estos IDs? (${envIds.slice(0, 3).join(', ')}${envIds.length > 3 ? '...' : ''})`,
          defaultValue: true,
        });
        if (useEnvIds) {
          ids = envIds;
        }
      }

      if (!ids) {
        const idsInput = await textInput({
          message: 'IDs separados por coma (_id o contentTemplateCode)',
          placeholder: 'template-1, template-2',
          required: true,
        });
        ids = idsInput
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean);
      }
    }

    // ── 2c. Ask about keeping original names ─────────────────
    keepOriginalName = await confirm({
      message: '¿Mantener nombre original? (sin sufijos "-migrated" ni "[migrated YYYY-MM-DD]")',
      defaultValue: false,
    });

    // ⚠️ Warning: keepOriginalName + same account = will OVERWRITE originals
    if (keepOriginalName && toDomain === domain) {
      console.log('\n  ⚠️  ¡ATENCIÓN! Vas a SOBRESCRIBIR los templates originales.');
      console.log('      (origen = destino + mantener nombre original)\n');
      const confirmOverwrite = await confirm({
        message: '¿Estás seguro de que quieres sobrescribir los templates originales?',
        defaultValue: false,
      });
      if (!confirmOverwrite) {
        console.log('\n  Cancelado.\n');
        process.exit(0);
      }
    }

    // ── 2d. Ask about hiding old templates ───────────────
    // Skip when overwriting in-place (same account + keep name) — there's no "old" template to hide
    let hideOldTemplates = false;
    if (!(keepOriginalName && toDomain === domain)) {
      hideOldTemplates = await confirm({
        message:
          '¿Inhabilitar templates viejos en origen después de migrar? (los marca como ocultos)',
        defaultValue: false,
      });
    }

    // ── 2e. Ask about updating products (when snippets are involved) ──
    // Skip when overwriting in-place — snippet IDs don't change
    let updateProducts = false;
    if (
      (templateType === 'all' || templateType === 'snippet') &&
      !(keepOriginalName && toDomain === domain)
    ) {
      updateProducts = await confirm({
        message:
          '¿Actualizar productos que usan los snippets migrados? (reemplaza IDs viejos por nuevos)',
        defaultValue: true,
      });
    }

    // ── 2f. Ask about dry run ────────────────────────────────
    dryRun = await confirm({
      message: '¿Ejecutar primero en modo prueba? (muestra qué se migraría sin hacer cambios)',
      defaultValue: true,
    });

    // ── Summary for migrate-all ──────────────────────────────
    console.log('\n  ─────────────────────────────');
    console.log(`  Origen:       ${domain}`);
    console.log(`  Destino:      ${toDomain}`);
    console.log(`  Tipo:         ${templateType}`);
    console.log(`  IDs:          ${ids ? ids.length + ' específicos' : 'Todos'}`);
    console.log(`  Nombre orig:  ${keepOriginalName ? 'Sí' : 'No (con sufijo)'}`);
    console.log(`  Inhabilitar:  ${hideOldTemplates ? 'Sí' : 'No'}`);
    if (templateType === 'all' || templateType === 'snippet') {
      console.log(`  Upd products: ${updateProducts ? 'Sí' : 'No'}`);
    }
    console.log(`  Modo prueba:  ${dryRun ? 'Sí' : 'No'}`);
    console.log('  ─────────────────────────────\n');

    const proceed = await confirm({ message: '¿Continuar?', defaultValue: true });
    if (!proceed) {
      console.log('\n  Cancelado.\n');
      process.exit(0);
    }

    return {
      domain,
      toDomain,
      templateId: '', // Not used for migrate-all
      templateType,
      verbose: true,
      dryRun,
      saveJson: false,
      migrateAll: true,
      concurrency,
      hideOldTemplates,
      ids,
      keepOriginalName,
      updateProducts,
    };
  }

  // ── 2. contentTemplateCode (for single template modes) ─────
  const templateId = await textInput({
    message: 'contentTemplateCode a migrar',
    defaultValue: 'main-layout',
  });

  // ── Name auto-generated: "original [migrated YYYY-MM-DD]" ──
  const today = new Date().toISOString().slice(0, 10);

  // ── Summary ────────────────────────────────────────────────
  console.log('\n  ─────────────────────────────');
  if (toDomain) {
    console.log(`  Origen:      ${domain}`);
    console.log(`  Destino:     ${toDomain}`);
  } else {
    console.log(`  Dominio:     ${domain}`);
  }
  console.log(`  Código:      ${templateId}`);
  console.log(`  Nombre:      <original> [migrated ${today}]`);
  console.log('  ─────────────────────────────\n');

  const proceed = await confirm({ message: '¿Continuar?', defaultValue: true });
  if (!proceed) {
    console.log('\n  Cancelado.\n');
    process.exit(0);
  }

  return {
    domain,
    toDomain,
    templateId,
    name: undefined,
    templateType: 'layout',
    verbose: true,
    dryRun: false,
    saveJson: false,
  };
}

// ═══════════════════════════════════════════════════════════════
// UPDATE-PRODUCTS INTERACTIVE FLOW
// ═══════════════════════════════════════════════════════════════

async function runUpdateProductsPrompt(domain: string): Promise<InteractiveAnswers> {
  // Ask for optional IDs filter
  const filterMode = await select({
    message: '¿Qué snippets procesar?',
    choices: [
      { label: 'Todos los snippets con par [code] → [code]-migrated', value: 'all' },
      { label: 'Solo IDs específicos', value: 'specific' },
    ],
  });

  let ids: string[] | undefined;
  if (filterMode === 'specific') {
    const idsInput = await textInput({
      message: 'Códigos de snippets separados por coma (contentTemplateCode original)',
      placeholder: 'snippet-1, snippet-2',
      required: true,
    });
    ids = idsInput
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean);
  }

  const dryRun = await confirm({
    message: '¿Ejecutar primero en modo prueba? (muestra qué productos se actualizarían)',
    defaultValue: true,
  });

  // Summary
  console.log('\n  ─────────────────────────────');
  console.log(`  Cuenta:       ${domain}`);
  console.log(`  Snippets:     ${ids ? ids.join(', ') : 'Todos'}`);
  console.log(`  Modo prueba:  ${dryRun ? 'Sí' : 'No'}`);
  console.log('  ─────────────────────────────\n');

  const proceed = await confirm({ message: '¿Continuar?', defaultValue: true });
  if (!proceed) {
    console.log('\n  Cancelado.\n');
    process.exit(0);
  }

  return {
    domain,
    templateId: '',
    templateType: 'snippet',
    verbose: true,
    dryRun,
    saveJson: false,
    updateProductsOnly: true,
    ids,
  };
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

async function pickDomain(domains: string[], label: string): Promise<string> {
  if (domains.length > 0) {
    const choices = [
      ...domains.map((d) => ({ label: d, value: d })),
      { label: 'Ingresar dominio manualmente…', value: '__custom__' },
    ];

    const picked = await select({ message: label, choices });

    if (picked === '__custom__') {
      return textInput({
        message: 'Nombre del dominio',
        placeholder: 'ej: redrenault',
        required: true,
      });
    }
    return picked;
  }

  console.log('  No se encontraron archivos .{dominio}.env');
  console.log('  Crea uno como:  .redrenault.env  con PROLIBU_API_URL y PROLIBU_AUTH_TOKEN\n');
  return textInput({ message: label, placeholder: 'ej: redrenault', required: true });
}
