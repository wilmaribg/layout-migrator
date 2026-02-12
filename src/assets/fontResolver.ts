/**
 * Font Resolver — resolves fonts from Prolibu layout into Design Studio assets
 *
 * 1. Iterates embeddedFonts[]
 * 2. Preserves exact font names (no normalization)
 * 3. Groups by base family for weight detection
 * 4. Generates FontAsset entries with source: 'custom'
 * 5. Resolves defaultFontFamily from layout.defaultFont (exact name)
 */

import type { FontAsset } from '@design-studio/schema';
import type { ProlibuLayout } from '../types/prolibu.js';

export interface ResolvedFonts {
  /** Font assets for DocumentAssets.fonts */
  fontAssets: Record<string, FontAsset>;
  /** Available font names for typography.availableFonts */
  availableFonts: string[];
  /** Default font family for the document */
  defaultFontFamily: string;
}

/**
 * Resolve fonts from a Prolibu layout into Design Studio font assets.
 */
export function resolveFonts(layout: ProlibuLayout): ResolvedFonts {
  const fontAssets: Record<string, FontAsset> = {};
  const fontFamilies = new Map<string, { url: string; weights: number[] }>();
  const seenBaseNames = new Set<string>();

  // Process embedded fonts
  if (layout.embeddedFonts) {
    for (const font of layout.embeddedFonts) {
      // Extract fontName and fontUrl based on format
      let fontName: string;
      let fontUrl: string;

      if (typeof font === 'string') {
        fontName = font;
        fontUrl = '';
      } else if ('fileName' in font) {
        // Populated format: { _id, fileName, url, ... }
        fontName = font.fileName;
        fontUrl = font.url;
      } else if ('fontName' in font) {
        // Legacy format: { fontName, fontUrl }
        fontName = font.fontName;
        fontUrl = font.fontUrl;
      } else {
        continue; // Unknown format, skip
      }

      // Remove only the file extension (.ttf, .otf, .woff, etc.) - keep everything else exactly as-is
      // File extension is not part of the font name in CSS
      const exactName = fontName.replace(/\.(ttf|otf|woff2?)$/i, '');

      // Skip duplicates (exact same name)
      if (seenBaseNames.has(exactName)) continue;
      seenBaseNames.add(exactName);

      // Extract family base for grouping weights: "NouvelR_Bold" → "NouvelR"
      // But keep the exact name for the asset key
      const familyBase = extractFamilyBase(exactName);

      if (fontFamilies.has(familyBase)) {
        const existing = fontFamilies.get(familyBase)!;
        const weight = inferWeight(exactName);
        if (!existing.weights.includes(weight)) {
          existing.weights.push(weight);
        }
      } else {
        fontFamilies.set(familyBase, {
          url: fontUrl,
          weights: [inferWeight(exactName)],
        });
      }

      // Register with exact name (no normalization)
      fontAssets[exactName] = {
        family: exactName,
        weights: [inferWeight(exactName)],
        source: 'custom',
        url: fontUrl,
      };
    }
  }

  // Build family-level assets
  for (const [family, data] of fontFamilies) {
    if (!fontAssets[family]) {
      fontAssets[family] = {
        family,
        weights: data.weights.sort((a, b) => a - b),
        source: 'custom',
        url: data.url,
      };
    }
  }

  // Available fonts: all unique names (individual + families)
  const availableFonts = Array.from(new Set([...seenBaseNames, ...fontFamilies.keys()])).sort();

  // Default font - preserve exact name
  const defaultFontFamily = layout.defaultFont
    ? layout.defaultFont
    : (availableFonts[0] ?? 'Inter');

  return { fontAssets, availableFonts, defaultFontFamily };
}

/**
 * Extract the base family name from a font variant name.
 * "NouvelR_Bold" → "NouvelR"
 * "NouvelR-Light" → "NouvelR"
 * "Roboto" → "Roboto"
 */
function extractFamilyBase(name: string): string {
  // Common weight suffixes to strip
  const weightSuffixes =
    /[_-](Thin|ExtraLight|UltraLight|Light|Regular|Book|Medium|SemiBold|DemiBold|Bold|ExtraBold|UltraBold|Black|Heavy)$/i;

  const stripped = name.replace(weightSuffixes, '');
  return stripped || name;
}

/**
 * Infer a numeric weight from a font variant name.
 */
function inferWeight(name: string): number {
  const lower = name.toLowerCase();
  if (lower.includes('thin')) return 100;
  if (lower.includes('extralight') || lower.includes('ultralight')) return 200;
  if (lower.includes('light')) return 300;
  if (lower.includes('book') || lower.includes('regular')) return 400;
  if (lower.includes('medium')) return 500;
  if (lower.includes('semibold') || lower.includes('demibold')) return 600;
  if (lower.includes('extrabold') || lower.includes('ultrabold')) return 800;
  if (lower.includes('bold')) return 700;
  if (lower.includes('black') || lower.includes('heavy')) return 900;
  return 400; // Default regular
}
