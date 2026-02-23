/**
 * Page Preset Resolver — replaces V1 page presets with V2 equivalents.
 *
 * Instead of transforming V1 presetPage nodes manually, this resolver
 * uses the exact V2 page preset structures from editorStore.
 */

import {
  createFrameNode,
  generateId,
  createTextNode,
  createRichTextContent,
  createRectangleNode,
  contentPresets,
  type ContentPagePresetId,
} from '@design-studio/schema';
import type {
  Page,
  FrameNode,
  SceneNode,
  ComponentNode,
  ImageNode,
  TextNode,
  RectangleNode,
  Fill,
  PageSize,
} from '@design-studio/schema';
import type { ProlibuNode } from '../types/prolibu.js';
import type { TransformContext } from './nodeRouter.js';

// ═══════════════════════════════════════════════════════════════
// V1 → V2 PRESET ID MAP
// ═══════════════════════════════════════════════════════════════

/**
 * Map V1 localGroup names to V2 ContentPagePresetId.
 */
const V1_TO_V2_PRESET_MAP: Record<string, string> = {
  quotePage: 'quote-page',
  quickProposalApprovalPage: 'quick-proposal-approval-page',
  accordionPage: 'accordion-page',
  agreementSignaturePage: 'agreement-signature-page',
  satisfactionRate: 'satisfaction-page',
  // layoutProductSnippets is handled separately as placeholder
};

/**
 * Names of localGroup children that indicate a known page preset.
 */
const KNOWN_PRESET_NAMES = new Set(Object.keys(V1_TO_V2_PRESET_MAP));

// ═══════════════════════════════════════════════════════════════
// DETECTION
// ═══════════════════════════════════════════════════════════════

export interface PresetDetectionResult {
  isPagePreset: boolean;
  v2PresetId?: string;
  presetChild?: ProlibuNode;
  v1Props?: Record<string, unknown>;
}

/**
 * Detect if a V1 frame (presetPage or regular frame) contains a known page preset.
 * Returns detection result with V2 preset ID if found.
 */
export function detectPagePreset(frame: ProlibuNode): PresetDetectionResult {
  // Look for known preset names in direct children
  const presetChild = frame.children?.find(
    (child) => child.type === 'localGroup' && KNOWN_PRESET_NAMES.has(child.name)
  );

  if (!presetChild) {
    return { isPagePreset: false };
  }

  const v2PresetId = V1_TO_V2_PRESET_MAP[presetChild.name];

  // Extract V1 props from comCompConfig
  const comName = presetChild.name.replace(/Page$/, ''); // quotePage → quote
  const componentKey = `com${comName.charAt(0).toUpperCase()}${comName.slice(1)}`; // quote → comQuote
  const v1Props = extractComCompConfigProps(presetChild, componentKey);

  return {
    isPagePreset: true,
    v2PresetId,
    presetChild,
    v1Props,
  };
}

/**
 * Recursively search for comCompConfig props for a component.
 * Searches depth-first to prefer props from nested nodes (where actual
 * user-configured values typically reside) over parent wrapper nodes.
 */
function extractComCompConfigProps(
  node: ProlibuNode,
  componentKey: string
): Record<string, unknown> | undefined {
  // Search children first (depth-first) - nested nodes have actual config values
  for (const child of node.children ?? []) {
    const result = extractComCompConfigProps(child, componentKey);
    if (result) return result;
  }

  // Then check this node (fallback)
  if (node.comCompConfig?.[componentKey]) {
    return filterConfigProps(node.comCompConfig[componentKey] as Record<string, unknown>);
  }

  return undefined;
}

/**
 * Filter out $configs and other UI-only props.
 */
function filterConfigProps(props: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (key === '$configs') continue;
    result[key] = value;
  }
  return result;
}

// ═══════════════════════════════════════════════════════════════
// RESOLVER
// ═══════════════════════════════════════════════════════════════

export interface ResolvedPagePreset {
  page: Page;
  rootFrame: FrameNode;
  nodes: Record<string, SceneNode>;
}

/**
 * Create a V2 page preset structure using shared contentPresets from @design-studio/schema.
 * Merges V1 comCompConfig props into components.
 */
export function resolvePagePreset(
  v2PresetId: string,
  v1Props: Record<string, unknown> | undefined,
  _pageIndex: number,
  pageSize: PageSize,
  ctx: TransformContext,
  v1Styles?: Record<string, unknown>
): ResolvedPagePreset {
  // Use shared content presets from schema
  const preset = contentPresets[v2PresetId as ContentPagePresetId];
  if (!preset) {
    throw new Error(`Unknown V2 preset ID: ${v2PresetId}`);
  }

  const pageId = generateId();
  const rootId = generateId();

  // Create fills from preset background
  const fills: Fill[] = [{ type: 'solid', color: preset.backgroundColor, opacity: 1 }];

  // Use preset dimensions
  const frameWidth = preset.width;
  const frameHeight = preset.height;

  // Detect autoGrow from V1 styles or preset config
  const v1Height = v1Styles?.height as string | undefined;
  const v1MinHeight = v1Styles?.minHeight as string | undefined;
  const isAutoGrow = v1Height === 'auto' || v1MinHeight !== undefined || preset.autoGrow;
  const minHeight = v1MinHeight ? parseInt(v1MinHeight, 10) : preset.minHeight;

  // Create root frame
  const rootFrame: FrameNode = createFrameNode({
    id: rootId,
    name: preset.name,
    parentId: null,
    width: frameWidth,
    height: isAutoGrow ? (minHeight ?? frameHeight) : frameHeight,
    fills,
    clipContent: true,
    autoGrow: isAutoGrow || undefined,
    minHeight: isAutoGrow ? (minHeight ?? frameHeight) : undefined,
  });

  // Collect all nodes for this preset
  const allNodes: Record<string, SceneNode> = {
    [rootId]: rootFrame,
  };

  // Create child nodes from preset.children
  for (const childConfig of preset.children) {
    const childId = generateId();

    if (childConfig.type === 'COMPONENT') {
      // Merge V1 props with default props for matching component
      const mergedProps = {
        ...(childConfig.props || childConfig.pluginProps || {}),
        ...(v1Props ?? {}),
      };

      const componentNode: ComponentNode = {
        type: 'COMPONENT',
        id: childId,
        name: childConfig.componentName || 'Component',
        parentId: rootId,
        children: [],
        x: childConfig.x,
        y: childConfig.y,
        width: childConfig.width,
        height: childConfig.height,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        constraints: { horizontal: 'left', vertical: 'top' },
        blendMode: 'normal',
        pluginData: {},
        pluginId: childConfig.pluginId || 'unknown',
        componentName: childConfig.componentName || 'Component',
        props: mergedProps,
        pluginVersion: '1.0.0',
        fallbackRender: 'placeholder',
      };
      allNodes[childId] = componentNode;
      rootFrame.children.push(childId);
      ctx.stats.componentNodes++;
    } else if (childConfig.type === 'TEXT') {
      const textNode: TextNode = createTextNode({
        id: childId,
        name: 'Text',
        parentId: rootId,
        x: childConfig.x,
        y: childConfig.y,
        width: childConfig.width,
        height: childConfig.height,
        content: createRichTextContent(childConfig.characters || ''),
        htmlContent: childConfig.htmlContent || '',
        characters: childConfig.characters || '',
        tiptapState: childConfig.tiptapState || null,
        textAutoResize: 'none',
      });
      // Apply text styles
      if (childConfig.fontSize) (textNode as any).fontSize = childConfig.fontSize;
      if (childConfig.fontWeight) (textNode as any).fontWeight = childConfig.fontWeight;
      if (childConfig.textAlign) (textNode as any).textAlign = childConfig.textAlign;
      if (childConfig.fills) (textNode as any).fills = childConfig.fills;

      allNodes[childId] = textNode;
      rootFrame.children.push(childId);
      ctx.stats.textNodes++;
    } else if (childConfig.type === 'IMAGE') {
      const imageNode: ImageNode = {
        type: 'IMAGE',
        id: childId,
        name: 'Image',
        parentId: rootId,
        children: [],
        x: childConfig.x,
        y: childConfig.y,
        width: childConfig.width,
        height: childConfig.height,
        rotation: 0,
        visible: true,
        locked: false,
        opacity: 1,
        constraints: { horizontal: 'left', vertical: 'top' },
        blendMode: 'normal',
        pluginData: {},
        imageRef: childConfig.imageRef || '',
        scaleMode: 'fill',
        imageTransform: { scale: 1, offsetX: 0, offsetY: 0 },
        cornerRadius: 0,
        strokes: [],
        effects: [],
      };
      allNodes[childId] = imageNode;
      rootFrame.children.push(childId);
      ctx.stats.imageNodes++;
    } else if (childConfig.type === 'RECTANGLE') {
      const rectNode: RectangleNode = createRectangleNode({
        id: childId,
        name: 'Rectangle',
        parentId: rootId,
        x: childConfig.x,
        y: childConfig.y,
        width: childConfig.width,
        height: childConfig.height,
        fills: childConfig.fills || [],
        cornerRadius: childConfig.cornerRadius || 0,
      });
      allNodes[childId] = rectNode;
      rootFrame.children.push(childId);
      ctx.stats.rectangleNodes++;
    }
  }

  // Create page
  const page: Page = {
    id: pageId,
    name: preset.name,
    rootId,
    orientation: preset.orientation,
    size: { width: pageSize.width, height: pageSize.height, preset: v2PresetId },
    types: [],
    isPlaceholder: false,
  };

  ctx.stats.pages++;

  // Add warning for reference
  ctx.warnings.push(
    `PagePresetResolved: Using V2 "${v2PresetId}" preset structure from shared contentPresets`
  );

  return {
    page,
    rootFrame,
    nodes: allNodes,
  };
}

/**
 * Check if a preset ID is known.
 */
export function isKnownV2Preset(presetId: string): boolean {
  return presetId in contentPresets;
}

// ═══════════════════════════════════════════════════════════════
// MARKER PRESETS (snippets-placeholder, custom-content)
// ═══════════════════════════════════════════════════════════════

/**
 * Marker preset configuration - simpler than component presets.
 * These match the 'snippets-placeholder' and 'custom-content' presets in editorStore.
 */
interface MarkerPresetConfig {
  name: string;
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape';
  backgroundColor: { r: number; g: number; b: number; a: number };
  pageType: string;
  markerText: string;
}

const MARKER_PRESETS: Record<string, MarkerPresetConfig> = {
  'snippets-placeholder': {
    name: 'Product Snippets',
    width: 792,
    height: 80,
    orientation: 'landscape',
    backgroundColor: { r: 26, g: 26, b: 26, a: 1 }, // #1a1a1a
    pageType: 'marker',
    markerText: '{{{productSnippets}}}',
  },
  'custom-content': {
    name: 'Custom Content',
    width: 792,
    height: 80,
    orientation: 'landscape',
    backgroundColor: { r: 26, g: 26, b: 26, a: 1 }, // #1a1a1a
    pageType: 'marker',
    markerText: '{{{customContent}}}',
  },
};

export interface MarkerDetectionResult {
  isMarkerPreset: boolean;
  markerPresetId?: 'snippets-placeholder' | 'custom-content';
}

/**
 * Detect if a V1 frame contains a localLayoutContent marker.
 * Returns the corresponding V2 marker preset ID if found.
 */
export function detectMarkerPreset(frame: ProlibuNode): MarkerDetectionResult {
  if (!frame.children) {
    return { isMarkerPreset: false };
  }

  for (const child of frame.children) {
    if (child.type === 'localLayoutContent') {
      const name = child.name?.toLowerCase() || '';

      if (name.includes('layoutproductsnippets')) {
        return {
          isMarkerPreset: true,
          markerPresetId: 'snippets-placeholder',
        };
      }

      if (name.includes('layoutcontent') || name === 'layoutcontent') {
        return {
          isMarkerPreset: true,
          markerPresetId: 'custom-content',
        };
      }
    }
  }

  return { isMarkerPreset: false };
}

export interface ResolvedMarkerPreset {
  page: Page;
  rootFrame: FrameNode;
  nodes: Record<string, SceneNode>;
}

/**
 * Create a V2 marker preset page (snippets-placeholder or custom-content).
 * Uses the exact V2 preset structure from editorStore.
 */
export function resolveMarkerPreset(
  markerPresetId: 'snippets-placeholder' | 'custom-content',
  _pageIndex: number,
  pageSize: PageSize,
  ctx: TransformContext
): ResolvedMarkerPreset {
  const preset = MARKER_PRESETS[markerPresetId];

  const pageId = generateId();
  const rootId = generateId();
  const textId = generateId();

  // Create fills for root frame
  const fills: Fill[] = [{ type: 'solid', color: preset.backgroundColor, opacity: 1 }];

  // Create root frame
  const rootFrame: FrameNode = createFrameNode({
    id: rootId,
    name: preset.name,
    parentId: null,
    width: preset.width,
    height: preset.height,
    fills,
    clipContent: true,
  });

  // Create TEXT node with marker
  const textNode = createTextNode({
    id: textId,
    name: preset.markerText,
    parentId: rootId,
    x: 0,
    y: 0,
    width: preset.width,
    height: preset.height,
    content: createRichTextContent(preset.markerText),
    htmlContent: `<p>${preset.markerText}</p>`,
    characters: preset.markerText,
    tiptapState: null,
    textAutoResize: 'none' as const,
    fills: [{ type: 'solid', color: { r: 255, g: 255, b: 255, a: 1 }, opacity: 1 }],
  });

  // Link text to root frame
  rootFrame.children = [textId];

  // Determine placeholder config based on marker type
  const placeholderConfig =
    markerPresetId === 'snippets-placeholder'
      ? { contentType: 'snippets' as const, rules: { emptyBehavior: 'hide' as const } }
      : { contentType: 'external' as const, rules: { emptyBehavior: 'hide' as const } };

  // Create page
  const page: Page = {
    id: pageId,
    name: preset.name,
    rootId,
    orientation: preset.orientation,
    size: pageSize,
    types: ['marker'],
    isPlaceholder: true,
    placeholder: placeholderConfig,
  };

  // Update stats
  ctx.stats.pages++;
  ctx.stats.textNodes++;

  ctx.warnings.push(
    `MarkerPresetResolved: Using V2 "${markerPresetId}" preset for placeholder page`
  );

  return {
    page,
    rootFrame,
    nodes: {
      [rootId]: rootFrame,
      [textId]: textNode,
    },
  };
}
