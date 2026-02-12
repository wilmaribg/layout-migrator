/**
 * Component Transformer — converts Prolibu localGroup + localCom
 * into Design Studio FrameNode (wrapper) + ComponentNode (child).
 */

import { createFrameNode, generateId } from '@design-studio/schema';
import type { SceneNode, ComponentNode, FrameNode } from '@design-studio/schema';
import type { ProlibuNode } from '../types/prolibu.js';
import type { TransformContext } from './nodeRouter.js';
import { parseNodeStyles } from '../converters/cssParser.js';

// ═══════════════════════════════════════════════════════════════
// PLUGIN MAP
// ═══════════════════════════════════════════════════════════════

const PLUGIN_MAP: Record<string, { pluginId: string; componentName: string }> = {
  comProposalHeader: { pluginId: 'com-proposal-header', componentName: 'Proposal Header' },
  comAgent: { pluginId: 'com-agent', componentName: 'Agent Info' },
  comQuote: { pluginId: 'com-quote', componentName: 'Price Quote' },
  comQuickProposalApproval: {
    pluginId: 'com-quick-proposal-approval',
    componentName: 'Quick Approval',
  },
  comRate: { pluginId: 'com-rate', componentName: 'Rating' },
  comAccordion: { pluginId: 'com-accordion', componentName: 'Accordion' },
  comPaymentPlan: { pluginId: 'com-payment-plan', componentName: 'Payment Plan' },
  comAttachment: { pluginId: 'com-attachment', componentName: 'Attachment' },
  // Render-only (not editable in canvas, but rendered by doc-render)
  comAvatar: { pluginId: 'com-avatar', componentName: 'Avatar' },
  comSign: { pluginId: 'com-sign', componentName: 'Signature' },
  comAgreementSignature: {
    pluginId: 'com-agreement-signature',
    componentName: 'Agreement Signature',
  },
};

const RENDER_ONLY_COMPONENTS = new Set(['comAvatar', 'comSign', 'comAgreementSignature']);

/**
 * Transform a Prolibu localGroup (with comCompConfig) + its localCom child
 * into a FrameNode wrapper + ComponentNode child.
 */
export function transformComponent(
  groupNode: ProlibuNode,
  parentId: string,
  ctx: TransformContext
): SceneNode[] {
  const styles = parseNodeStyles(groupNode.styles);

  // Find the localCom child — search recursively since it may be nested
  // e.g., quotePage → localGroup → localCom
  const { localCom, configNode } = findLocalComRecursive(groupNode);

  if (!localCom) {
    ctx.warnings.push(`MissingLocalCom: localGroup "${groupNode.name}" has no localCom descendant`);
    // Return just the frame wrapper with no component
    ctx.stats.frameNodes++;
    return [createWrapper(groupNode, parentId, styles)];
  }

  // Extract component name: "--comQuote" → "comQuote"
  const comName = localCom.name.replace(/^--/, '');

  // Look up plugin
  const pluginInfo = PLUGIN_MAP[comName];
  if (!pluginInfo) {
    ctx.warnings.push(
      `UnknownComponent: "${comName}" from localCom "${localCom.name}" has no known plugin mapping`
    );
    // Still create a fallback component
    return createFallbackComponent(groupNode, comName, parentId, styles, ctx);
  }

  // Warn about render-only components
  if (RENDER_ONLY_COMPONENTS.has(comName)) {
    ctx.warnings.push(
      `RenderOnlyComponent: "${comName}" is not editable in canvas but will render in export`
    );
  }

  // Extract props from the nearest node with comCompConfig
  // configNode is the closest ancestor (or groupNode itself) that has comCompConfig
  const comCompConfig = configNode?.comCompConfig ?? groupNode.comCompConfig ?? {};
  const props = (comCompConfig[comName] as Record<string, unknown>) ?? {};

  // Filter out $configs (UI hints from old editor)
  const cleanProps = filterProps(props);

  // Create component node directly (no wrapper - V2 native style)
  // Position comes from the localGroup styles
  const componentId = generateId();
  const component: ComponentNode = {
    type: 'COMPONENT',
    id: componentId,
    name: pluginInfo.componentName,
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
    pluginId: pluginInfo.pluginId,
    componentName: pluginInfo.componentName,
    props: cleanProps,
    pluginVersion: '1.0.0',
    fallbackRender: 'placeholder',
  };

  ctx.stats.componentNodes++;

  return [component];
}

/**
 * Create a wrapper FrameNode for the localGroup.
 */
function createWrapper(
  node: ProlibuNode,
  parentId: string,
  styles: ReturnType<typeof parseNodeStyles>
): FrameNode {
  return createFrameNode({
    id: generateId(),
    name: node.name || 'Component Wrapper',
    parentId,
    x: styles.x,
    y: styles.y,
    width: styles.width,
    height: styles.height,
    visible: styles.visible,
    opacity: styles.opacity,
    fills: [],
    clipContent: false,
  });
}

/**
 * Create a fallback component for unknown plugin types.
 * No wrapper - component has position directly (V2 native style).
 */
function createFallbackComponent(
  groupNode: ProlibuNode,
  comName: string,
  parentId: string,
  styles: ReturnType<typeof parseNodeStyles>,
  ctx: TransformContext
): SceneNode[] {
  // kebab-case conversion: comQuote → com-quote
  const pluginId = comName
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');

  const componentId = generateId();
  const component: ComponentNode = {
    type: 'COMPONENT',
    id: componentId,
    name: comName,
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
    pluginId,
    componentName: comName,
    props: filterProps((groupNode.comCompConfig?.[comName] as Record<string, unknown>) ?? {}),
    pluginVersion: '1.0.0',
    fallbackRender: 'placeholder',
  };

  ctx.stats.componentNodes++;

  return [component];
}

/**
 * Filter out $configs and other UI-only properties.
 */
function filterProps(props: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (key === '$configs') continue;
    result[key] = value;
  }
  return result;
}

/**
 * Recursively search for the first localCom descendant.
 * Also tracks the nearest ancestor with comCompConfig.
 *
 * Structure in v1 can be:
 * - Direct: localGroup → localCom
 * - Nested: localGroup (quotePage) → localGroup (Group) → localCom (--comQuote)
 */
function findLocalComRecursive(
  node: ProlibuNode,
  configAncestor?: ProlibuNode
): { localCom: ProlibuNode | null; configNode: ProlibuNode | null } {
  // Track the nearest node with comCompConfig
  const currentConfig = node.comCompConfig ? node : configAncestor;

  // Check direct children first
  const directCom = node.children?.find((c) => c.type === 'localCom');
  if (directCom) {
    return { localCom: directCom, configNode: currentConfig ?? null };
  }

  // Recurse into localGroup children
  for (const child of node.children ?? []) {
    if (child.type === 'localGroup') {
      const result = findLocalComRecursive(child, currentConfig);
      if (result.localCom) {
        return result;
      }
    }
  }

  return { localCom: null, configNode: null };
}
