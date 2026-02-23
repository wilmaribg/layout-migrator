/**
 * Interactive CLI — prompts the user step by step so they don't need flags.
 *
 * Uses arrow-key navigation for selections (zero external dependencies).
 */

import { resolve } from 'node:path';
import { listAvailableDomains } from '../config/envLoader.js';
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
    ],
  });
  const isTransfer = mode === 'transfer';
  const isMigrateAll = mode === 'migrate-all';

  // ── 1. Source domain selection ─────────────────────────────
  const projectRoot = resolve(import.meta.dirname ?? process.cwd(), '..', '..');
  const domains = listAvailableDomains(projectRoot);

  const sourceLabel = isTransfer || isMigrateAll ? 'Dominio origen' : 'Dominio';
  const domain = await pickDomain(domains, sourceLabel);

  // ── 1b. Destination domain (transfer or migrate-all) ───────
  let toDomain: string | undefined;
  if (isTransfer || isMigrateAll) {
    toDomain = await pickDomain(domains, 'Dominio destino');
    if (toDomain === domain) {
      console.log('  ⚠️  Origen y destino son iguales — se crearán copias en la misma cuenta.\n');
    }
  }

  // ── 2. For migrate-all: type filter and concurrency ────────
  let templateType = 'layout';
  let concurrency = 5;
  let dryRun = false;

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

    const concurrencyStr = await textInput({
      message: 'Concurrencia (migraciones en paralelo)',
      defaultValue: '5',
    });
    concurrency = parseInt(concurrencyStr, 10) || 5;

    dryRun = await confirm({
      message: '¿Ejecutar primero en modo prueba? (muestra qué se migraría sin hacer cambios)',
      defaultValue: true,
    });

    // Ask if the user wants to hide old templates after migration
    let hideOldTemplates = false;
    if (!dryRun) {
      hideOldTemplates = await confirm({
        message:
          '¿Inhabilitar templates viejos en origen después de migrar? (los marca como ocultos)',
        defaultValue: false,
      });
    }

    // ── Summary for migrate-all ──────────────────────────────
    console.log('\n  ─────────────────────────────');
    console.log(`  Origen:       ${domain}`);
    console.log(`  Destino:      ${toDomain}`);
    console.log(`  Tipo:         ${templateType}`);
    console.log(`  Concurrencia: ${concurrency}`);
    console.log(`  Modo prueba:  ${dryRun ? 'Sí' : 'No'}`);
    console.log(`  Inhabilitar:  ${hideOldTemplates ? 'Sí' : 'No'}`);
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
