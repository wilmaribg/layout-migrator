/**
 * Migration Pipeline — orchestrates the full migration flow:
 * fetch → sync fonts → transform → validate → output
 */

import { validateDocument, PAGE_SIZES } from '@design-studio/schema';
import type { Document, SceneNode, ValidationResult } from '@design-studio/schema';
import { fetchContentTemplate, type ProlibuClientConfig } from '../client/prolibuClient.js';
import type { ProlibuLayout } from '../types/prolibu.js';
import { resolveFonts, type ResolvedFonts } from '../assets/fontResolver.js';
import { syncFonts, type FontApiConfig, type FontSyncResult } from '../assets/fontMigrator.js';
import { transformDocumentShell } from '../transformers/documentTransformer.js';
import { transformPage } from '../transformers/pageTransformer.js';
import {
  detectPagePreset,
  resolvePagePreset,
  detectMarkerPreset,
  resolveMarkerPreset,
} from '../transformers/pagePresetResolver.js';
import { resolveFontFamily } from '../converters/cssParser.js';
import {
  routeNode,
  createEmptyStats,
  type MigrationStats,
  type TransformContext,
} from '../transformers/nodeRouter.js';
import { convertWildcards } from '../converters/wildcardConverter.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface MigrationResult {
  document: Document;
  validation: ValidationResult;
  warnings: string[];
  stats: MigrationStats;
  /** Font sync result (if font sync was enabled) */
  fontSync?: FontSyncResult;
}

export interface MigrationOptions {
  /** Prolibu API config (required if fetching) */
  config?: ProlibuClientConfig;
  /** Pre-fetched layout (skips API call if provided) */
  layout?: ProlibuLayout;
  /** Page size override */
  pageSize?: typeof PAGE_SIZES.fixed;
  /** Font API config (enables font sync if provided) */
  fontApiConfig?: FontApiConfig;
}

// ═══════════════════════════════════════════════════════════════
// PIPELINE
// ═══════════════════════════════════════════════════════════════

/**
 * Run the full migration pipeline for a Prolibu content template.
 */
export async function migrate(id: string, options: MigrationOptions): Promise<MigrationResult> {
  // 1. Fetch or use pre-provided layout
  let layout: ProlibuLayout;
  if (options.layout) {
    layout = options.layout;
  } else if (options.config) {
    layout = await fetchContentTemplate(id, options.config);
  } else {
    throw new Error('Either config or layout must be provided');
  }

  // 2. Sync fonts (if font API config provided)
  let fontSyncResult: FontSyncResult | undefined;
  if (options.fontApiConfig && layout.embeddedFonts && layout.embeddedFonts.length > 0) {
    fontSyncResult = await syncFonts(layout.embeddedFonts, options.fontApiConfig);
  }

  // 3. Run transformation with font map
  const result = migrateFromLayout(layout, options.pageSize, fontSyncResult?.fontMap);

  // 4. Attach font sync result
  return {
    ...result,
    fontSync: fontSyncResult,
  };
}

/**
 * Run migration from an already-fetched ProlibuLayout (no IO).
 * Useful for testing and for pre-fetched data.
 */
export function migrateFromLayout(
  layout: ProlibuLayout,
  pageSize = PAGE_SIZES.fixed,
  fontMap?: Record<string, string>
): MigrationResult {
  // 1. Resolve fonts
  const fonts: ResolvedFonts = resolveFonts(layout);

  // 2. Create document shell
  const docShell = transformDocumentShell(layout, fonts);

  // 2.5. Apply fontMap to defaultFontFamily if provided
  if (fontMap && docShell.settings.typography.defaultFontFamily) {
    const resolvedDefault = resolveFontFamily(
      docShell.settings.typography.defaultFontFamily,
      fontMap
    );
    docShell.settings.typography.defaultFontFamily = resolvedDefault;
  }

  // 3. Set up transform context
  const warnings: string[] = [];
  const stats = createEmptyStats();
  const ctx: TransformContext = {
    warnings,
    stats,
    fonts,
    wildcardConverter: convertWildcards,
    fontMap,
  };

  // 4. Transform pages and collect nodes
  const pages: Document['pages'] = [];
  const nodes: Record<string, SceneNode> = {};

  // Prolibu has 1 page with N frames as children
  if (layout.pages.length === 0) {
    throw new Error('Layout has no pages — nothing to migrate.');
  }
  const sourceFrames = layout.pages[0]?.children ?? [];

  for (let i = 0; i < sourceFrames.length; i++) {
    const frame = sourceFrames[i];

    // Check if this frame is a known page preset (quote, quick-approval, etc.)
    const presetDetection = detectPagePreset(frame);

    if (presetDetection.isPagePreset && presetDetection.v2PresetId) {
      // Use V2 preset structure instead of transforming manually
      const resolved = resolvePagePreset(
        presetDetection.v2PresetId,
        presetDetection.v1Props,
        i,
        pageSize,
        ctx,
        frame.styles as Record<string, unknown> | undefined
      );

      // Add all nodes from the resolved preset
      for (const [nodeId, node] of Object.entries(resolved.nodes)) {
        nodes[nodeId] = node;
      }

      pages.push(resolved.page);
      continue; // Skip normal transformation
    }

    // Check if this frame contains a marker (layoutProductSnippets or layoutContent)
    const markerDetection = detectMarkerPreset(frame);

    if (markerDetection.isMarkerPreset && markerDetection.markerPresetId) {
      // Use V2 marker preset instead of transforming manually
      const resolved = resolveMarkerPreset(markerDetection.markerPresetId, i, pageSize, ctx);

      // Add all nodes from the resolved marker preset
      for (const [nodeId, node] of Object.entries(resolved.nodes)) {
        nodes[nodeId] = node;
      }

      pages.push(resolved.page);
      continue; // Skip normal transformation
    }

    // Normal transformation for non-preset pages
    stats.pages++;

    // Transform the frame into a Page + root FrameNode
    const { page, rootFrame, extraNodes } = transformPage(frame, i, pageSize);

    // Add root frame to nodes
    nodes[rootFrame.id] = rootFrame;

    // Add any extra nodes (e.g., placeholder TEXT nodes)
    for (const [nodeId, node] of Object.entries(extraNodes)) {
      nodes[nodeId] = node;
    }

    // Transform child nodes of this frame
    const childNodes = frame.children ?? [];
    for (const childNode of childNodes) {
      // Skip localLayoutContent (absorbed by pageTransformer)
      if (childNode.type === 'localLayoutContent') {
        ctx.stats.totalSourceNodes++;
        ctx.stats.skippedNodes++;
        continue;
      }

      const transformedNodes = routeNode(childNode, rootFrame.id, ctx);

      for (const tNode of transformedNodes) {
        nodes[tNode.id] = tNode;

        // If this is a direct child of the root frame, add to children[]
        if (tNode.parentId === rootFrame.id) {
          rootFrame.children.push(tNode.id);
        }
      }
    }

    pages.push(page);
  }

  // 5. Assemble complete document
  const document: Document = {
    ...docShell,
    pages,
    nodes,
  };

  // 6. Validate
  const validation = validateDocument(document);

  // Add validation warnings
  if (validation.warnings.length > 0) {
    for (const w of validation.warnings) {
      warnings.push(`Validation: ${w.message} (${w.path})`);
    }
  }

  return {
    document,
    validation,
    warnings,
    stats,
  };
}
