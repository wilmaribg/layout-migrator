/**
 * Page Transformer — converts a Prolibu FRAME or presetPage
 * into a Design Studio Page + root FrameNode.
 */

import {
  createFrameNode,
  createTextNode,
  createRichTextContent,
  generateId,
  PAGE_SIZES,
} from '@design-studio/schema';
import type { Page, PageSize, FrameNode, Fill, PlaceholderConfig } from '@design-studio/schema';
import type { ProlibuNode } from '../types/prolibu.js';
import { parseNodeStyles } from '../converters/cssParser.js';
import { parseColor } from '../converters/colorParser.js';
import { convertWildcards } from '../converters/wildcardConverter.js';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface TransformedPage {
  page: Page;
  rootFrame: FrameNode;
  /** Additional nodes generated (e.g., placeholder TEXT) */
  extraNodes: Record<string, import('@design-studio/schema').SceneNode>;
}

// ═══════════════════════════════════════════════════════════════
// TRANSFORMER
// ═══════════════════════════════════════════════════════════════

/**
 * Transform a Prolibu frame (FRAME or presetPage) into a Design Studio Page + root FrameNode.
 */
export function transformPage(
  frame: ProlibuNode,
  index: number,
  pageSize: PageSize = PAGE_SIZES.fixed
): TransformedPage {
  const pageId = generateId();
  const rootId = generateId();
  const styles = parseNodeStyles(frame.styles);

  const isPresetPage = frame.type === 'presetPage';
  const layoutContentType = detectLayoutContentType(frame);
  const isAutoGrow = styles.heightAuto || styles.minHeight !== undefined;

  // Determine placeholder config
  let isPlaceholder = false;
  let placeholder: PlaceholderConfig | undefined;
  let placeholderWildcard: string | undefined;

  if (isPresetPage) {
    isPlaceholder = true;

    if (layoutContentType === 'snippets') {
      // Snippets placeholder (layoutProductSnippets)
      placeholder = {
        contentType: 'snippets',
        rules: { emptyBehavior: 'hide' },
      };
      placeholderWildcard = '{{{productSnippets}}}';
    } else {
      // Custom content placeholder (layoutContent or default)
      placeholder = {
        contentType: 'external',
        rules: { emptyBehavior: 'hide' },
      };
      placeholderWildcard = '{{{customContent}}}';
    }
  }

  // Build fills for root frame
  const fills: Fill[] = [];
  if (styles.backgroundColor) {
    const rgba = parseColor(styles.backgroundColor);
    fills.push({ type: 'solid', color: rgba, opacity: 1 });
  } else {
    // Default white
    fills.push({ type: 'solid', color: { r: 255, g: 255, b: 255, a: 1 }, opacity: 1 });
  }

  // Background image (with wildcard conversion)
  let backgroundImage: string | undefined;
  if (styles.backgroundImage) {
    backgroundImage = convertWildcards(styles.backgroundImage);
  }

  // Frame dimensions
  const frameWidth = pageSize.width;
  const frameHeight = isAutoGrow ? (styles.minHeight ?? pageSize.height) : pageSize.height;

  // Create root frame
  const rootFrame: FrameNode = createFrameNode({
    id: rootId,
    name: frame.name || `Page ${index + 1}`,
    parentId: null,
    width: frameWidth,
    height: frameHeight,
    fills,
    backgroundImage,
    backgroundSize: backgroundImage ? 'cover' : undefined,
    autoGrow: isAutoGrow || undefined,
    minHeight: isAutoGrow ? (styles.minHeight ?? pageSize.height) : undefined,
    clipContent: true,
  });

  // Extra nodes (placeholder text for preset pages)
  const extraNodes: Record<string, import('@design-studio/schema').SceneNode> = {};

  if (placeholderWildcard) {
    const textId = generateId();
    const textNode = createTextNode({
      id: textId,
      name: 'Placeholder Content',
      parentId: rootId,
      x: 0,
      y: 0,
      width: frameWidth,
      height: frameHeight,
      content: createRichTextContent(placeholderWildcard),
      htmlContent: `<p>${placeholderWildcard}</p>`,
      characters: placeholderWildcard,
      tiptapState: null,
      textAutoResize: 'none' as const,
    });
    extraNodes[textId] = textNode;
    rootFrame.children.push(textId);
  }

  // Create page
  const page: Page = {
    id: pageId,
    name: frame.name || `Page ${index + 1}`,
    rootId,
    orientation: 'landscape',
    size: pageSize,
    types: isPlaceholder ? ['marker'] : [],
    isPlaceholder,
    ...(placeholder && { placeholder }),
  };

  return { page, rootFrame, extraNodes };
}

/**
 * Detect the type of localLayoutContent child in a presetPage.
 * Returns 'snippets' for layoutProductSnippets, 'custom' for layoutContent, or null.
 */
function detectLayoutContentType(frame: ProlibuNode): 'snippets' | 'custom' | null {
  if (!frame.children) return null;

  for (const child of frame.children) {
    if (child.type === 'localLayoutContent') {
      const name = child.name?.toLowerCase() || '';
      if (name.includes('layoutproductsnippets')) {
        return 'snippets';
      }
      if (name.includes('layoutcontent') || name === 'layoutcontent') {
        return 'custom';
      }
    }
  }
  return null;
}
