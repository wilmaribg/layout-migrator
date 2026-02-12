/**
 * Env Loader — loads environment variables from domain-specific .env files.
 *
 * Convention:  .{domain}.env
 * Example:    .redrenault.env, .honda.env, .demo.env
 *
 * File format (simple KEY=VALUE, supports # comments):
 *   PROLIBU_API_URL=https://redrenault.prolibu.com/api
 *   PROLIBU_AUTH_TOKEN=Bearer eyJ...
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { existsSync, readdirSync } from 'node:fs';

export interface EnvConfig {
  PROLIBU_API_URL?: string;
  PROLIBU_AUTH_TOKEN?: string;
  [key: string]: string | undefined;
}

/** Strict domain name pattern — prevents path traversal */
const DOMAIN_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;

/**
 * Load environment variables from a `.{domain}.env` file.
 * Looks in the layoutMigrator root directory.
 */
export async function loadDomainEnv(domain: string): Promise<EnvConfig> {
  if (!DOMAIN_PATTERN.test(domain)) {
    throw new Error(
      `Invalid domain name: "${domain}". Only alphanumeric characters, hyphens, and underscores are allowed.`
    );
  }

  const filename = `.${domain}.env`;
  const filePath = resolve(import.meta.dirname ?? process.cwd(), '..', '..', filename);

  if (!existsSync(filePath)) {
    // Also try from cwd
    const cwdPath = resolve(process.cwd(), filename);
    if (!existsSync(cwdPath)) {
      throw new Error(
        `Env file not found: "${filename}"\n` +
          `  Looked in:\n` +
          `    - ${filePath}\n` +
          `    - ${cwdPath}\n\n` +
          `  Create it with:\n` +
          `    PROLIBU_API_URL=https://${domain}.prolibu.com/api\n` +
          `    PROLIBU_AUTH_TOKEN=Bearer eyJ...`
      );
    }
    return parseEnvFile(cwdPath);
  }

  return parseEnvFile(filePath);
}

/**
 * Parse a simple .env file into key-value pairs.
 */
async function parseEnvFile(filePath: string): Promise<EnvConfig> {
  const content = await readFile(filePath, 'utf-8');
  const config: EnvConfig = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();

    // Skip empty lines and comments
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Strip surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    config[key] = value;
  }

  return config;
}

/**
 * List available domain env files in the project directory.
 */
export function listAvailableDomains(dir: string): string[] {
  // Check the given directory first, then fall back to cwd
  for (const searchDir of [dir, process.cwd()]) {
    try {
      const files = readdirSync(searchDir);
      const domains = files
        .filter(
          (f) => f.startsWith('.') && f.endsWith('.env') && f !== '.env' && !f.endsWith('.example')
        )
        .map((f) => f.slice(1, -4)); // ".redrenault.env" → "redrenault"
      if (domains.length > 0) return domains;
    } catch {
      // continue to next search dir
    }
  }
  return [];
}
