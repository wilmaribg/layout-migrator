/**
 * Rectangle Transformer — converts Prolibu localRectangle to
 * Design Studio ImageNode or RectangleNode.
 *
 * Decision:
 * - If styles.backgroundImage exists → ImageNode (supports wildcards)
 * - If only color/border → RectangleNode
 */

import { createRectangleNode, generateId } from '@design-studio/schema';
import type { SceneNode, RectangleNode, ImageNode, Fill, Stroke } from '@design-studio/schema';
import type { ProlibuNode } from '../types/prolibu.js';
import type { TransformContext } from './nodeRouter.js';
import { parseNodeStyles } from '../converters/cssParser.js';
import { parseColor } from '../converters/colorParser.js';
import { convertWildcards } from '../converters/wildcardConverter.js';

/**
 * Transform a Prolibu localRectangle node.
 * - If backgroundImage exists → ImageNode (wildcards converted)
 * - Otherwise → RectangleNode
 */
export function transformRectangle(
  node: ProlibuNode,
  parentId: string,
  ctx: TransformContext
): SceneNode {
  const styles = parseNodeStyles(node.styles);

  const bgImage = styles.backgroundImage;

  if (bgImage && hasValidImageUrl(bgImage)) {
    // IMAGE node — supports both real URLs and wildcards
    ctx.stats.imageNodes++;
    const imageUrl = convertWildcards(bgImage);
    return createImageNode(node, parentId, styles, imageUrl);
  }

  // Plain RECTANGLE
  ctx.stats.rectangleNodes++;
  return createRect(node, parentId, styles);
}

function createImageNode(
  node: ProlibuNode,
  parentId: string,
  styles: ReturnType<typeof parseNodeStyles>,
  imageUrl: string
): ImageNode {
  return {
    type: 'IMAGE',
    id: generateId(),
    name: node.name || 'Image',
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
    imageRef: imageUrl,
    scaleMode: 'fill',
    imageTransform: { scale: 1, offsetX: 0, offsetY: 0 },
    cornerRadius: styles.borderRadius ?? 0,
    strokes: buildStrokes(styles),
    effects: [],
  };
}

function createRect(
  node: ProlibuNode,
  parentId: string,
  styles: ReturnType<typeof parseNodeStyles>
): RectangleNode {
  return createRectangleNode({
    id: generateId(),
    name: node.name || 'Rectangle',
    parentId,
    x: styles.x,
    y: styles.y,
    width: styles.width,
    height: styles.height,
    visible: styles.visible,
    opacity: styles.opacity,
    fills: buildFills(styles),
    strokes: buildStrokes(styles),
    cornerRadius: styles.borderRadius ?? 0,
  });
}

function buildFills(styles: ReturnType<typeof parseNodeStyles>): Fill[] {
  if (styles.backgroundColor) {
    const rgba = parseColor(styles.backgroundColor);
    return [{ type: 'solid', color: rgba, opacity: 1 }];
  }
  return [];
}

function buildStrokes(styles: ReturnType<typeof parseNodeStyles>): Stroke[] {
  if (styles.border) {
    const color = parseColor(styles.border.color);
    return [
      {
        color,
        weight: styles.border.width,
        style: (styles.border.style === 'dashed'
          ? 'dashed'
          : styles.border.style === 'dotted'
            ? 'dotted'
            : 'solid') as 'solid' | 'dashed' | 'dotted',
      },
    ];
  }
  return [];
}

/**
 * Check if URL is valid for an image (real URL or wildcard expression).
 */
function hasValidImageUrl(url: string): boolean {
  if (!url) return false;
  if (url === 'none') return false;

  // Wildcard expressions are valid
  if (/\{\{.*?\}\}/.test(url)) return true;

  // Real URLs
  return (
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('//') ||
    url.startsWith('data:image/')
  );
}
