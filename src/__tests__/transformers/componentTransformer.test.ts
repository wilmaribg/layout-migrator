import { describe, test, expect } from 'vitest';
import { transformComponent } from '../../transformers/componentTransformer.js';
import { createEmptyStats } from '../../transformers/nodeRouter.js';
import { convertWildcards } from '../../converters/wildcardConverter.js';
import type { TransformContext } from '../../transformers/nodeRouter.js';

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

describe('componentTransformer', () => {
  test('transforms localGroup + localCom into Component (no wrapper)', () => {
    const ctx = createTestContext();
    const groupNode = {
      name: 'QuoteGroup',
      type: 'localGroup',
      styles: { left: '100px', top: '200px', width: '792px', height: '500px' },
      comCompConfig: {
        comQuote: { title: 'Pricing', columns: ['name', 'price', 'qty'] },
        comAgent: { hideAvatar: true },
      },
      children: [{ name: '--comQuote', type: 'localCom' }],
    };

    const results = transformComponent(groupNode, 'parent-1', ctx);

    expect(results).toHaveLength(1);

    const [component] = results;
    expect(component.type).toBe('COMPONENT');
    expect(component.parentId).toBe('parent-1'); // Direct parent, no wrapper
    expect(component.x).toBe(100); // Position from localGroup styles
    expect(component.y).toBe(200);

    if (component.type === 'COMPONENT') {
      expect(component.pluginId).toBe('com-quote');
      expect(component.componentName).toBe('Price Quote');
      expect(component.props).toEqual({ title: 'Pricing', columns: ['name', 'price', 'qty'] });
      expect(component.pluginVersion).toBe('1.0.0');
      expect(component.fallbackRender).toBe('placeholder');
    }

    expect(ctx.stats.frameNodes).toBe(0); // No wrapper frame
    expect(ctx.stats.componentNodes).toBe(1);
  });

  test('warns and creates fallback for unknown component', () => {
    const ctx = createTestContext();
    const groupNode = {
      name: 'UnknownGroup',
      type: 'localGroup',
      styles: { width: '100px', height: '100px' },
      comCompConfig: { comUnknown: { foo: 'bar' } },
      children: [{ name: '--comUnknown', type: 'localCom' }],
    };

    const results = transformComponent(groupNode, 'parent-1', ctx);

    expect(results).toHaveLength(1);
    expect(results[0].type).toBe('COMPONENT');
    expect(ctx.warnings.some((w) => w.includes('UnknownComponent'))).toBe(true);
  });

  test('warns about render-only components', () => {
    const ctx = createTestContext();
    const groupNode = {
      name: 'AvatarGroup',
      type: 'localGroup',
      styles: { width: '100px', height: '100px' },
      comCompConfig: { comAvatar: { size: 'large' } },
      children: [{ name: '--comAvatar', type: 'localCom' }],
    };

    const results = transformComponent(groupNode, 'parent-1', ctx);

    expect(results).toHaveLength(1);
    expect(ctx.warnings.some((w) => w.includes('RenderOnlyComponent'))).toBe(true);

    const component = results[0];
    if (component.type === 'COMPONENT') {
      expect(component.pluginId).toBe('com-avatar');
    }
  });

  test('filters out $configs from props', () => {
    const ctx = createTestContext();
    const groupNode = {
      name: 'AgentGroup',
      type: 'localGroup',
      styles: { width: '100px', height: '100px' },
      comCompConfig: {
        comAgent: {
          hideAvatar: true,
          $configs: { fill: 'uiCom:color' },
        },
      },
      children: [{ name: '--comAgent', type: 'localCom' }],
    };

    const results = transformComponent(groupNode, 'parent-1', ctx);
    const component = results[0];
    if (component.type === 'COMPONENT') {
      expect(component.props).toEqual({ hideAvatar: true });
      expect(component.props).not.toHaveProperty('$configs');
    }
  });

  test('warns when localGroup has no localCom child', () => {
    const ctx = createTestContext();
    const groupNode = {
      name: 'EmptyGroup',
      type: 'localGroup',
      styles: { width: '100px', height: '100px' },
      comCompConfig: {},
      children: [],
    };

    const results = transformComponent(groupNode, 'parent-1', ctx);

    expect(results).toHaveLength(1); // Just the wrapper
    expect(ctx.warnings.some((w) => w.includes('MissingLocalCom'))).toBe(true);
  });

  test('finds nested localCom (quotePage structure)', () => {
    // Real structure from Prolibu: quotePage → localGroup → localCom
    const ctx = createTestContext();
    const groupNode = {
      name: 'quotePage',
      type: 'localGroup',
      styles: { left: '50px', top: '100px', width: '612px', height: 'auto', position: 'relative' },
      comCompConfig: {
        comQuote: {
          title: 'Cotización',
          summary: { show: true },
          columns: ['name', 'unitPrice', 'qty', 'total'],
        },
      },
      children: [
        {
          name: 'Group',
          type: 'localGroup',
          styles: { width: '100%', height: 'auto', position: 'relative' },
          comCompConfig: {
            comQuote: { title: 'Override' }, // Nested config should be used
          },
          children: [{ name: '--comQuote', type: 'localCom' }],
        },
      ],
    };

    const results = transformComponent(groupNode, 'parent-1', ctx);

    expect(results).toHaveLength(1);

    const [component] = results;
    expect(component.type).toBe('COMPONENT');
    expect(component.x).toBe(50); // Position from outer localGroup
    expect(component.y).toBe(100);

    if (component.type === 'COMPONENT') {
      expect(component.pluginId).toBe('com-quote');
      expect(component.componentName).toBe('Price Quote');
      // Should use the nested config (closer to localCom)
      expect(component.props).toHaveProperty('title', 'Override');
    }

    expect(ctx.stats.frameNodes).toBe(0); // No wrapper
    expect(ctx.stats.componentNodes).toBe(1);
    // No warning for missing localCom
    expect(ctx.warnings.some((w) => w.includes('MissingLocalCom'))).toBe(false);
  });

  test('uses parent comCompConfig when nested group has none', () => {
    const ctx = createTestContext();
    const groupNode = {
      name: 'quotePage',
      type: 'localGroup',
      styles: { width: '612px', height: 'auto' },
      comCompConfig: {
        comQuote: { title: 'From Parent', columns: ['a', 'b'] },
      },
      children: [
        {
          name: 'Group',
          type: 'localGroup',
          styles: { width: '100%', height: 'auto' },
          // No comCompConfig here
          children: [{ name: '--comQuote', type: 'localCom' }],
        },
      ],
    };

    const results = transformComponent(groupNode, 'parent-1', ctx);

    expect(results).toHaveLength(1);
    const component = results[0];
    if (component.type === 'COMPONENT') {
      expect(component.props).toEqual({ title: 'From Parent', columns: ['a', 'b'] });
    }
  });
});
