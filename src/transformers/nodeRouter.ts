/**
 * Node Router — dispatches Prolibu nodes to the correct transformer by type
 */

import type { SceneNode } from '@design-studio/schema';
import type { ProlibuNode } from '../types/prolibu.js';
import type { ResolvedFonts } from '../assets/fontResolver.js';
import { transformText } from './textTransformer.js';
import { transformRectangle } from './rectangleTransformer.js';
import { transformComponent } from './componentTransformer.js';
import { transformLine } from './lineTransformer.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface MigrationStats {
  totalSourceNodes: number;
  migratedNodes: number;
  skippedNodes: number;
  pages: number;
  textNodes: number;
  componentNodes: number;
  imageNodes: number;
  rectangleNodes: number;
  lineNodes: number;
  frameNodes: number;
}

export interface TransformContext {
  warnings: string[];
  stats: MigrationStats;
  fonts: ResolvedFonts;
  wildcardConverter: (text: string) => string;
  /** Map of original font names → new fontCode (from font sync) */
  fontMap?: Record<string, string>;
}

export function createEmptyStats(): MigrationStats {
  return {
    totalSourceNodes: 0,
    migratedNodes: 0,
    skippedNodes: 0,
    pages: 0,
    textNodes: 0,
    componentNodes: 0,
    imageNodes: 0,
    rectangleNodes: 0,
    lineNodes: 0,
    frameNodes: 0,
  };
}

// ═══════════════════════════════════════════════════════════════
// ROUTER
// ═══════════════════════════════════════════════════════════════

/**
 * Route a Prolibu node to the appropriate transformer based on its type.
 * Returns an array of SceneNodes (some transforms produce multiple nodes).
 */
export function routeNode(
  prolibuNode: ProlibuNode,
  parentId: string,
  ctx: TransformContext
): SceneNode[] {
  ctx.stats.totalSourceNodes++;

  switch (prolibuNode.type) {
    case 'localText':
      ctx.stats.migratedNodes++;
      return [transformText(prolibuNode, parentId, ctx)];

    case 'localRectangle':
      ctx.stats.migratedNodes++;
      return [transformRectangle(prolibuNode, parentId, ctx)];

    case 'localGroup':
      ctx.stats.migratedNodes++;
      return transformComponent(prolibuNode, parentId, ctx);

    case 'localCom':
      // Handled inside componentTransformer via localGroup parent
      ctx.stats.skippedNodes++;
      return [];

    case 'localLineHorizontal':
      ctx.stats.migratedNodes++;
      return [transformLine(prolibuNode, parentId, ctx)];

    case 'localLayoutContent':
      // Absorbed by pageTransformer — indicates parent presetPage is a placeholder
      ctx.stats.skippedNodes++;
      return [];

    default:
      ctx.warnings.push(
        `UnknownNodeType: "${prolibuNode.type}" (name: "${prolibuNode.name}") — skipped`
      );
      ctx.stats.skippedNodes++;
      return [];
  }
}
