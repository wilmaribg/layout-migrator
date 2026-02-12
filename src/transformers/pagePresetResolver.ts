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
} from '@design-studio/schema';
import type {
  Page,
  FrameNode,
  SceneNode,
  ComponentNode,
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
  // layoutProductSnippets is handled separately as placeholder
};

/**
 * Names of localGroup children that indicate a known page preset.
 */
const KNOWN_PRESET_NAMES = new Set(Object.keys(V1_TO_V2_PRESET_MAP));

// ═══════════════════════════════════════════════════════════════
// V2 PAGE PRESET STRUCTURES
// These match exactly what editorStore.addPageFromContentPreset creates.
// ═══════════════════════════════════════════════════════════════

interface V2PresetConfig {
  name: string;
  width: number;
  height: number;
  orientation: 'portrait' | 'landscape';
  backgroundColor: { r: number; g: number; b: number; a: number };
  pageType: string;
  autoGrow?: boolean;
  minHeight?: number;
  /** The main component of this preset */
  component: {
    pluginId: string;
    componentName: string;
    defaultProps: Record<string, unknown>;
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * V2 page preset configurations.
 * These must stay in sync with apps/web/src/stores/editorStore.ts contentPresets.
 */
const V2_PRESETS: Record<string, V2PresetConfig> = {
  'quote-page': {
    name: 'Quote',
    width: 612,
    height: 792,
    orientation: 'portrait',
    backgroundColor: { r: 255, g: 255, b: 255, a: 1 },
    pageType: 'pricing',
    autoGrow: true,
    minHeight: 792,
    component: {
      pluginId: 'com-quote',
      componentName: 'Price Quote',
      defaultProps: {
        title: 'Price Summary.',
        summary: '',
        hideTitleAndDescription: false,
        repeatHeaders: false,
        showTitleAndDescription: true,
        showDateExpanded: false,
        showGroupExpanded: false,
        showFamilyExpanded: false,
        showLineItemExpanded: false,
        showConsolidated: false,
        showAditionalNotes: false,
        hideSummaryOfDates: false,
        hideSummaryOfGroups: false,
        hideSummaryOfFamilies: false,
        hideSummaryOfTotal: false,
        showPaymentPlan: true,
        columns: [
          {
            label: 'Concept',
            cell: 'productName',
            width: '110px',
            minWidth: '110px',
            visible: true,
          },
          { label: 'Qty.', cell: 'quantity', width: '25px', minWidth: '25px', visible: true },
          {
            label: 'U. Price',
            cell: 'netUnitPrice',
            width: '55px',
            minWidth: '55px',
            visible: true,
          },
          { label: 'Sub Total', cell: 'subTotal', width: '55px', minWidth: '55px', visible: true },
          {
            label: 'Discount',
            cell: 'discountAmount',
            width: '55px',
            minWidth: '55px',
            visible: true,
          },
          {
            label: 'Taxes',
            cell: 'netTotalTaxAmount',
            width: '55px',
            minWidth: '55px',
            visible: true,
          },
          { label: 'Total', cell: 'total', width: '75px', minWidth: '75px', visible: true },
        ],
        paymentPlanColumns: [
          { label: '#', cell: 'number', width: 60, minWidth: 60, visible: true, align: 'center' },
          {
            label: 'Title',
            cell: 'title',
            width: 280,
            minWidth: 200,
            visible: true,
            align: 'left',
          },
          {
            label: 'Payment Date',
            cell: 'dueDate',
            width: 120,
            minWidth: 120,
            visible: true,
            align: 'center',
          },
          { label: 'Total', cell: 'total', width: 100, visible: true, align: 'right' },
        ],
      },
      x: 32,
      y: 32,
      width: 548,
      height: 728,
    },
  },
  'quick-proposal-approval-page': {
    name: 'Quick Approval',
    width: 792,
    height: 612,
    orientation: 'landscape',
    backgroundColor: { r: 255, g: 255, b: 255, a: 1 },
    pageType: 'content',
    component: {
      pluginId: 'com-quick-proposal-approval',
      componentName: 'Quick Proposal Approval',
      defaultProps: {
        title: 'Proposal Approval.',
        descriptionText: null,
        descriptionApproved: null,
        descriptionDenied: null,
      },
      x: 40,
      y: 100,
      width: 712,
      height: 472,
    },
  },
  'accordion-page': {
    name: 'FAQ / Accordion',
    width: 792,
    height: 612,
    orientation: 'landscape',
    backgroundColor: { r: 255, g: 255, b: 255, a: 1 },
    pageType: 'content',
    autoGrow: true,
    minHeight: 612,
    component: {
      pluginId: 'com-accordion',
      componentName: 'Accordion',
      defaultProps: {
        rows: [
          {
            title: 'Title',
            description: 'Description',
            expanded: false,
            blockExpanded: false,
          },
        ],
        startExpanded: false,
      },
      x: 40,
      y: 40,
      width: 712,
      height: 500,
    },
  },
};

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
 * Create a V2 page preset structure using exact V2 definitions.
 * Merges V1 comCompConfig props into the component.
 */
export function resolvePagePreset(
  v2PresetId: string,
  v1Props: Record<string, unknown> | undefined,
  _pageIndex: number,
  pageSize: PageSize,
  ctx: TransformContext,
  v1Styles?: Record<string, unknown>
): ResolvedPagePreset {
  const preset = V2_PRESETS[v2PresetId];
  if (!preset) {
    throw new Error(`Unknown V2 preset ID: ${v2PresetId}`);
  }

  const pageId = generateId();
  const rootId = generateId();
  const componentId = generateId();

  // Create fills from preset background
  const fills: Fill[] = [{ type: 'solid', color: preset.backgroundColor, opacity: 1 }];

  // Use preset dimensions or page size
  const frameWidth = preset.width || pageSize.width;
  const frameHeight = preset.height || pageSize.height;

  // Detect autoGrow from V1 styles (height: 'auto' or minHeight present)
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

  // Create component node with merged props
  const mergedProps = {
    ...preset.component.defaultProps,
    ...(v1Props ?? {}),
  };

  const component: ComponentNode = {
    type: 'COMPONENT',
    id: componentId,
    name: preset.component.componentName,
    parentId: rootId,
    children: [],
    x: preset.component.x,
    y: preset.component.y,
    width: preset.component.width,
    height: preset.component.height,
    rotation: 0,
    visible: true,
    locked: false,
    opacity: 1,
    constraints: { horizontal: 'left', vertical: 'top' },
    blendMode: 'normal',
    pluginData: {},
    pluginId: preset.component.pluginId,
    componentName: preset.component.componentName,
    props: mergedProps,
    pluginVersion: '1.0.0',
    fallbackRender: 'placeholder',
  };

  // Link component to root frame
  rootFrame.children = [componentId];

  // Create page
  const page: Page = {
    id: pageId,
    name: preset.name,
    rootId,
    orientation: preset.orientation,
    size: pageSize,
    types: [],
    isPlaceholder: false,
  };

  // Update stats
  ctx.stats.componentNodes++;
  ctx.stats.pages++;

  // Add warning for reference
  ctx.warnings.push(
    `PagePresetResolved: Using V2 "${v2PresetId}" preset structure (V1 props merged)`
  );

  return {
    page,
    rootFrame,
    nodes: {
      [rootId]: rootFrame,
      [componentId]: component,
    },
  };
}

/**
 * Check if a preset ID is known.
 */
export function isKnownV2Preset(presetId: string): boolean {
  return presetId in V2_PRESETS;
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
