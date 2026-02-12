/**
 * Line Transformer — converts Prolibu localLineHorizontal to Design Studio LineNode
 */

import { generateId } from '@design-studio/schema';
import type { LineNode, Stroke } from '@design-studio/schema';
import type { ProlibuNode } from '../types/prolibu.js';
import type { TransformContext } from './nodeRouter.js';
import { parseNodeStyles } from '../converters/cssParser.js';
import { parseColor } from '../converters/colorParser.js';

/**
 * Transform a Prolibu localLineHorizontal node into a Design Studio LineNode.
 */
export function transformLine(
  node: ProlibuNode,
  parentId: string,
  ctx: TransformContext
): LineNode {
  ctx.stats.lineNodes++;

  const styles = parseNodeStyles(node.styles);

  // Build strokes from border CSS
  const strokes: Stroke[] = [];
  if (styles.border) {
    const color = parseColor(styles.border.color);
    strokes.push({
      color,
      weight: styles.border.width,
      style: (styles.border.style === 'dashed'
        ? 'dashed'
        : styles.border.style === 'dotted'
          ? 'dotted'
          : 'solid') as 'solid' | 'dashed' | 'dotted',
    });
  } else {
    // Default: 1px solid black
    strokes.push({
      color: { r: 0, g: 0, b: 0, a: 1 },
      weight: 1,
      style: 'solid',
    });
  }

  return {
    type: 'LINE',
    id: generateId(),
    name: node.name || 'Line',
    parentId,
    children: [],
    x: styles.x,
    y: styles.y,
    width: styles.width,
    height: styles.height,
    rotation: 0,
    visible: styles.visible,
    locked: false,
    opacity: styles.opacity,
    constraints: { horizontal: 'left', vertical: 'top' },
    blendMode: 'normal',
    pluginData: {},
    strokes,
    strokeWeight: strokes[0]?.weight ?? 1,
    startPoint: { x: 0, y: 0 },
    endPoint: { x: styles.width, y: 0 }, // Horizontal line
  };
}
