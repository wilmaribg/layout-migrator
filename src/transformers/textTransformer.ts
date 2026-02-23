/**
 * Text Transformer — converts Prolibu localText nodes to Design Studio TextNode
 */

import { createTextNode, createRichTextContent, generateId } from '@design-studio/schema';
import type { TextNode, Fill } from '@design-studio/schema';
import type { ProlibuNode } from '../types/prolibu.js';
import type { TransformContext } from './nodeRouter.js';
import {
  parseNodeStyles,
  resolveFontFamily,
  type ParentDimensions,
} from '../converters/cssParser.js';
import { parseColor } from '../converters/colorParser.js';
import { quillToTiptapHtml } from '../converters/quillToTiptapHtml.js';
import { convertWildcards } from '../converters/wildcardConverter.js';

/**
 * Transform a Prolibu localText node into a Design Studio TextNode.
 *
 * @param node The source Prolibu localText node
 * @param parentId ID of the parent frame in the target document
 * @param ctx Transform context
 * @param parentDimensions Optional parent dimensions for percentage-based sizing
 */
export function transformText(
  node: ProlibuNode,
  parentId: string,
  ctx: TransformContext,
  parentDimensions?: ParentDimensions
): TextNode {
  ctx.stats.textNodes++;

  const styles = parseNodeStyles(node.styles, parentDimensions);

  // Process HTML content — API uses 'content', legacy uses 'value'
  let htmlContent = node.content ?? node.value ?? '';
  htmlContent = quillToTiptapHtml(htmlContent, ctx.fontMap);
  htmlContent = convertWildcards(htmlContent);

  // Extract plain text from HTML for the 'characters' field
  const characters = stripHtmlTags(htmlContent);

  // Create legacy rich text content
  const content = createRichTextContent(characters);

  // Build fills (text color)
  const fills: Fill[] = [];
  if (styles.color) {
    const rgba = parseColor(styles.color);
    fills.push({ type: 'solid', color: rgba, opacity: 1 });
  }

  // Determine text alignment from HTML or styles
  const textAlign = extractTextAlign(htmlContent);

  // Resolve font family using fontMap
  const fontFamily = styles.fontFamily
    ? resolveFontFamily(styles.fontFamily, ctx.fontMap)
    : 'inherit';

  // Determine textAutoResize based on V1 auto dimensions
  // When widthAuto was true, we assigned a fixed width (85% of parent),
  // so we use 'height' to respect that width while allowing auto height
  let textAutoResize: 'none' | 'width-and-height' | 'height' = 'none';
  if (styles.heightAuto) {
    // Both widthAuto+heightAuto → we assigned fixed width, so use 'height'
    // Only heightAuto → also use 'height' (fixed width, auto height)
    textAutoResize = 'height';
  }

  return createTextNode({
    id: generateId(),
    name: node.name || 'Text',
    parentId,
    x: styles.x,
    y: styles.y,
    width: styles.width,
    height: styles.height,
    visible: styles.visible,
    opacity: styles.opacity,
    content,
    tiptapState: null, // Editor regenerates on open
    htmlContent,
    characters,
    fontFamily,
    fontSize: styles.fontSize ?? 16,
    fontWeight: styles.fontWeight ?? 400,
    lineHeight: styles.lineHeight
      ? { value: styles.lineHeight, unit: 'px' as const }
      : { value: 1.5, unit: 'auto' as const },
    textAlign,
    ...(fills.length > 0 ? { fills } : {}),
    textAutoResize,
  });
}

/**
 * Strip HTML tags to get plain text.
 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Extract dominant text alignment from HTML paragraphs.
 */
function extractTextAlign(html: string): 'left' | 'center' | 'right' | 'justify' {
  if (html.includes('text-align: justify')) return 'justify';
  if (html.includes('text-align: center')) return 'center';
  if (html.includes('text-align: right')) return 'right';
  return 'left';
}
