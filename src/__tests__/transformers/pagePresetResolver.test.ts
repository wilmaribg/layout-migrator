import { describe, test, expect } from 'vitest';
import { detectPagePreset, resolvePagePreset } from '../../transformers/pagePresetResolver.js';
import { createEmptyStats } from '../../transformers/nodeRouter.js';
import { convertWildcards } from '../../converters/wildcardConverter.js';
import type { TransformContext } from '../../transformers/nodeRouter.js';
import { PAGE_SIZES } from '@design-studio/schema';

function createTestContext(): TransformContext {
  return {
    warnings: [],
    stats: createEmptyStats(),
    fonts: {
      fontAssets: {},
      availableFonts: ['Inter'],
      defaultFontFamily: 'Inter',
    },
    wildcardConverter: convertWildcards,
  };
}

describe('pagePresetResolver', () => {
  describe('detectPagePreset', () => {
    test('detects quotePage as page preset', () => {
      const frame = {
        type: 'presetPage',
        name: 'Group',
        children: [
          {
            type: 'localGroup',
            name: 'quotePage',
            comCompConfig: {
              comQuote: {
                title: 'Mi Cotización',
                showPaymentPlan: false,
              },
            },
            children: [{ type: 'localCom', name: '--comQuote' }],
          },
        ],
      };

      const result = detectPagePreset(frame as any);

      expect(result.isPagePreset).toBe(true);
      expect(result.v2PresetId).toBe('quote-page');
      expect(result.v1Props).toBeDefined();
      expect(result.v1Props?.title).toBe('Mi Cotización');
      expect(result.v1Props?.showPaymentPlan).toBe(false);
    });

    test('detects quickProposalApprovalPage as page preset', () => {
      const frame = {
        type: 'presetPage',
        name: 'Group',
        children: [
          {
            type: 'localGroup',
            name: 'quickProposalApprovalPage',
            comCompConfig: {
              comQuickProposalApproval: {
                title: 'Aprobación Rápida',
              },
            },
            children: [{ type: 'localCom', name: '--comQuickProposalApproval' }],
          },
        ],
      };

      const result = detectPagePreset(frame as any);

      expect(result.isPagePreset).toBe(true);
      expect(result.v2PresetId).toBe('quick-proposal-approval-page');
      expect(result.v1Props).toBeDefined();
      expect(result.v1Props?.title).toBe('Aprobación Rápida');
    });

    test('returns false for non-preset frames', () => {
      const frame = {
        type: 'FRAME',
        name: 'Regular Frame',
        children: [
          { type: 'localText', name: 'Some Text' },
          { type: 'localRectangle', name: 'Some Rectangle' },
        ],
      };

      const result = detectPagePreset(frame as any);

      expect(result.isPagePreset).toBe(false);
      expect(result.v2PresetId).toBeUndefined();
    });

    test('returns false for localGroup with unknown name', () => {
      const frame = {
        type: 'presetPage',
        name: 'Group',
        children: [
          {
            type: 'localGroup',
            name: 'unknownPage',
            children: [],
          },
        ],
      };

      const result = detectPagePreset(frame as any);

      expect(result.isPagePreset).toBe(false);
    });

    test('filters out $configs from V1 props', () => {
      const frame = {
        type: 'presetPage',
        name: 'Group',
        children: [
          {
            type: 'localGroup',
            name: 'quotePage',
            comCompConfig: {
              comQuote: {
                title: 'Test',
                $configs: { fill: 'uiCom:color' },
              },
            },
            children: [],
          },
        ],
      };

      const result = detectPagePreset(frame as any);

      expect(result.v1Props).toEqual({ title: 'Test' });
      expect(result.v1Props).not.toHaveProperty('$configs');
    });
  });

  describe('resolvePagePreset', () => {
    test('creates quote-page with V2 structure', () => {
      const ctx = createTestContext();
      const v1Props = { title: 'Precio Especial', showPaymentPlan: false };

      const result = resolvePagePreset('quote-page', v1Props, 0, PAGE_SIZES.fixed, ctx);

      // Check page
      expect(result.page.name).toBe('Quote');
      expect(result.page.orientation).toBe('portrait');
      expect(result.page.rootId).toBe(result.rootFrame.id);

      // Check root frame
      expect(result.rootFrame.width).toBe(612);
      expect(result.rootFrame.height).toBe(792);
      expect(result.rootFrame.children).toHaveLength(1);

      // Check component
      const componentId = result.rootFrame.children[0];
      const component = result.nodes[componentId];
      expect(component.type).toBe('COMPONENT');
      if (component.type === 'COMPONENT') {
        expect(component.pluginId).toBe('com-quote');
        expect(component.x).toBe(32);
        expect(component.y).toBe(32);
        // V1 props should be merged
        expect(component.props.title).toBe('Precio Especial');
        expect(component.props.showPaymentPlan).toBe(false);
        // V2 defaults should be preserved
        expect(component.props.columns).toBeDefined();
      }

      // Check stats updated
      expect(ctx.stats.componentNodes).toBe(1);
    });

    test('creates quick-proposal-approval-page with V2 structure', () => {
      const ctx = createTestContext();
      const v1Props = { title: 'Custom Title' };

      const result = resolvePagePreset(
        'quick-proposal-approval-page',
        v1Props,
        0,
        PAGE_SIZES.fixed,
        ctx
      );

      // Check page
      expect(result.page.name).toBe('Quick Approval');
      expect(result.page.orientation).toBe('landscape');

      // Check root frame
      expect(result.rootFrame.width).toBe(792);
      expect(result.rootFrame.height).toBe(612);

      // Check component
      const componentId = result.rootFrame.children[0];
      const component = result.nodes[componentId];
      if (component.type === 'COMPONENT') {
        expect(component.pluginId).toBe('com-quick-proposal-approval');
        expect(component.props.title).toBe('Custom Title');
      }
    });

    test('uses V2 defaults when no V1 props provided', () => {
      const ctx = createTestContext();

      const result = resolvePagePreset('quote-page', undefined, 0, PAGE_SIZES.fixed, ctx);

      const componentId = result.rootFrame.children[0];
      const component = result.nodes[componentId];
      if (component.type === 'COMPONENT') {
        expect(component.props.title).toBe('Price Summary.');
        expect(component.props.showPaymentPlan).toBe(true);
      }
    });

    test('adds warning about preset resolution', () => {
      const ctx = createTestContext();

      resolvePagePreset('quote-page', {}, 0, PAGE_SIZES.fixed, ctx);

      expect(ctx.warnings.some((w) => w.includes('PagePresetResolved'))).toBe(true);
    });
  });
});
