/**
 * Font Migrator — synchronizes embedded fonts from v1 to v2 backend
 *
 * Flow:
 * 1. Extract fonts (exact names preserved, no normalization)
 * 2. Check which fonts already exist in v2 account
 * 3. Download missing fonts from S3
 * 4. Upload to v2 backend via API
 * 5. Generate font name mapping (oldName → same name)
 */

import type { ProlibuEmbeddedFont } from '../types/prolibu.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface FontApiConfig {
  /** Base URL for the v2 API (e.g., "https://domain.prolibu.com") */
  baseUrl: string;
  /** Bearer token for authentication */
  authToken: string;
}

export interface FontSyncResult {
  /** Map of original font names → new fontCode */
  fontMap: Record<string, string>;
  /** Fonts that were uploaded */
  uploaded: string[];
  /** Fonts that already existed (skipped) */
  skipped: string[];
  /** Fonts that failed to upload */
  failed: Array<{ name: string; error: string }>;
}

interface V2FontAsset {
  _id: string;
  fontName: string;
  fontCode: string;
  fontFile?: { url?: string };
}

interface DeduplicatedFont {
  baseName: string;
  fontCode: string;
  originalNames: string[];
  url: string;
}

// ═══════════════════════════════════════════════════════════════
// MAIN FUNCTION
// ═══════════════════════════════════════════════════════════════

/**
 * Synchronize embedded fonts from v1 template to v2 account.
 */
export async function syncFonts(
  embeddedFonts: ProlibuEmbeddedFont[],
  apiConfig: FontApiConfig
): Promise<FontSyncResult> {
  const result: FontSyncResult = {
    fontMap: {},
    uploaded: [],
    skipped: [],
    failed: [],
  };

  // 1. Extract fonts (no normalization, exact names preserved)
  const uniqueFonts = extractFonts(embeddedFonts);
  if (uniqueFonts.length === 0) {
    return result;
  }

  // 2. Get existing fonts from v2
  const existingFonts = await fetchExistingFonts(apiConfig);
  const existingByCode = new Map(existingFonts.map((f) => [f.fontCode, f]));

  // 3. Process each unique font
  for (const font of uniqueFonts) {
    const { baseName, fontCode, originalNames, url } = font;

    // Check if already exists
    if (existingByCode.has(fontCode)) {
      result.skipped.push(baseName);

      // Map all original names to the existing fontCode
      for (const oldName of originalNames) {
        result.fontMap[oldName] = fontCode;
      }
      continue;
    }

    // Download and upload
    try {
      const file = await downloadFont(url, baseName);
      const uploaded = await uploadFont(file, baseName, fontCode, apiConfig);

      result.uploaded.push(baseName);

      // Map all original names to the new fontCode
      for (const oldName of originalNames) {
        result.fontMap[oldName] = uploaded.fontCode;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if it's a duplicate error (race condition or parallel upload)
      if (isDuplicateError(errorMessage)) {
        result.skipped.push(baseName);

        for (const oldName of originalNames) {
          result.fontMap[oldName] = fontCode;
        }
      } else {
        result.failed.push({ name: baseName, error: errorMessage });

        // Fallback: map to the intended fontCode anyway (might work if it already exists)
        for (const oldName of originalNames) {
          result.fontMap[oldName] = fontCode;
        }
      }
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════

/**
 * Extract fonts from embedded fonts array.
 * Each font is kept with its exact original name - no normalization.
 */
function extractFonts(embeddedFonts: ProlibuEmbeddedFont[]): DeduplicatedFont[] {
  const fonts: DeduplicatedFont[] = [];
  const seen = new Set<string>();

  for (const font of embeddedFonts) {
    // Skip string-only (non-populated) or invalid entries
    if (typeof font === 'string') continue;

    // Get URL and filename based on schema variant
    let url: string;
    let fileName: string;

    if ('url' in font && font.url) {
      // Populated format: { _id, fileName, url, ... }
      url = font.url;
      fileName = font.fileName;
    } else if ('fontUrl' in font && font.fontUrl) {
      // Legacy format: { fontName, fontUrl }
      url = font.fontUrl;
      fileName = font.fontName;
    } else {
      continue; // No URL available
    }

    // Extract name without extension only - keep everything else exactly as-is
    // "NouvelR_Book__roge__123.ttf" → "NouvelR_Book__roge__123"
    const originalName = fileName.replace(/\.(ttf|otf|woff2?)$/i, '');

    // Skip duplicates (exact same name)
    if (seen.has(originalName)) continue;
    seen.add(originalName);

    // Extract base name without __user__timestamp suffix for fontMap
    // "NouvelR_Bold__roge__1756820731109" → "NouvelR_Bold"
    // This is needed because Quill classes use base names (ql-font-NouvelR_Bold)
    // while the font files have full names with suffixes
    const baseName = originalName.replace(/__[a-zA-Z0-9]+__\d+$/, '');

    // Build list of names to map to this font
    // Include both the full name and base name (if different)
    const namesToMap = [originalName];
    if (baseName !== originalName && !seen.has(baseName)) {
      namesToMap.push(baseName);
      seen.add(baseName);
    }

    // Keep name exactly as-is for both fontName and fontCode
    fonts.push({
      baseName: originalName,
      fontCode: originalName,
      originalNames: namesToMap,
      url,
    });
  }

  return fonts;
}

/**
 * Fetch existing fonts from v2 account.
 */
async function fetchExistingFonts(config: FontApiConfig): Promise<V2FontAsset[]> {
  const url = new URL('/v2/font', config.baseUrl);
  url.searchParams.set('select', 'fontName fontCode fontFile');
  url.searchParams.set('populatePath', JSON.stringify({ path: 'fontFile', select: 'url' }));

  // Normalize auth token (avoid "Bearer Bearer ...")
  const authHeader = config.authToken.startsWith('Bearer ')
    ? config.authToken
    : `Bearer ${config.authToken}`;

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
        Authorization: authHeader,
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as V2FontAsset[] | { data: V2FontAsset[] };
    return Array.isArray(data) ? data : data.data || [];
  } catch (error) {
    return [];
  }
}

/**
 * Download font file from S3 URL.
 */
async function downloadFont(url: string, baseName: string): Promise<File> {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to download: HTTP ${response.status}`);
  }

  const blob = await response.blob();

  // Determine extension from URL or content-type
  const extension = url.match(/\.(ttf|otf|woff2?)$/i)?.[1] || 'ttf';
  const fileName = `${baseName}.${extension}`;

  return new File([blob], fileName, { type: blob.type || 'font/ttf' });
}

/**
 * Upload font to v2 backend.
 */
async function uploadFont(
  file: File,
  fontName: string,
  fontCode: string,
  config: FontApiConfig
): Promise<{ fontCode: string }> {
  const url = new URL('/v2/font', config.baseUrl);

  const formData = new FormData();
  formData.append('fontName', fontName);
  formData.append('fontCode', fontCode);
  formData.append('fontFile', file);
  formData.append('allowEveryone', JSON.stringify({ view: true, edit: true }));

  // Normalize auth token (avoid "Bearer Bearer ...")
  const authHeader = config.authToken.startsWith('Bearer ')
    ? config.authToken
    : `Bearer ${config.authToken}`;

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      Authorization: authHeader,
      // Note: Don't set Content-Type for FormData, browser sets it with boundary
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }

  const data = (await response.json()) as { fontCode?: string };
  return { fontCode: data.fontCode || fontCode };
}

/**
 * Check if an error indicates the font already exists.
 */
function isDuplicateError(message: string): boolean {
  const dupPatterns = [
    /already exists/i,
    /duplicate/i,
    /unique constraint/i,
    /fontcode.*taken/i,
    /E11000/i, // MongoDB duplicate key error
  ];

  return dupPatterns.some((pattern) => pattern.test(message));
}
