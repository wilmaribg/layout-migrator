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
}

/**
 * Run the interactive prompt flow and return the user's choices.
 */
export async function runInteractivePrompt(): Promise<InteractiveAnswers> {
  console.log('\n🚀 Layout Migrator — Interactive Mode\n');

  // ── 0. Mode selection ──────────────────────────────────────
  const mode = await select({
    message: 'What do you want to do?',
    choices: [
      { label: 'Migrate within the same account', value: 'migrate' as const },
      { label: 'Transfer from one account to another', value: 'transfer' as const },
    ],
  });
  const isTransfer = mode === 'transfer';

  // ── 1. Source domain selection ─────────────────────────────
  const projectRoot = resolve(import.meta.dirname ?? process.cwd(), '..', '..');
  const domains = listAvailableDomains(projectRoot);

  const sourceLabel = isTransfer ? 'Source domain' : 'Domain';
  const domain = await pickDomain(domains, sourceLabel);

  // ── 1b. Destination domain (transfer only) ─────────────────
  let toDomain: string | undefined;
  if (isTransfer) {
    toDomain = await pickDomain(domains, 'Destination domain');
    if (toDomain === domain) {
      console.log(
        '  ⚠️  Source and destination are the same — will create a copy in the same account.\n'
      );
    }
  }

  // ── 2. contentTemplateCode ──────────────────────────────────
  const templateId = await textInput({
    message: 'contentTemplateCode to migrate',
    defaultValue: 'main-layout',
  });

  // ── Name auto-generated: "original [migrated YYYY-MM-DD]" ──
  const today = new Date().toISOString().slice(0, 10);

  // ── Summary ────────────────────────────────────────────────
  console.log('\n  ─────────────────────────────');
  if (toDomain) {
    console.log(`  From:        ${domain}`);
    console.log(`  To:          ${toDomain}`);
  } else {
    console.log(`  Domain:      ${domain}`);
  }
  console.log(`  Code:        ${templateId}`);
  console.log(`  Name:        <original> [migrated ${today}]`);
  console.log('  ─────────────────────────────\n');

  const proceed = await confirm({ message: 'Proceed?', defaultValue: true });
  if (!proceed) {
    console.log('\n  Cancelled.\n');
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
      { label: 'Enter a custom domain…', value: '__custom__' },
    ];

    const picked = await select({ message: label, choices });

    if (picked === '__custom__') {
      return textInput({ message: 'Domain name', placeholder: 'e.g. redrenault', required: true });
    }
    return picked;
  }

  console.log('  No .{domain}.env files found.');
  console.log('  Create one like:  .redrenault.env  with PROLIBU_API_URL and PROLIBU_AUTH_TOKEN\n');
  return textInput({ message: label, placeholder: 'e.g. redrenault', required: true });
}
