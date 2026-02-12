import { describe, test, expect } from 'vitest';
import { transformRectangle } from '../../transformers/rectangleTransformer.js';
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

describe('rectangleTransformer', () => {
  test('creates RECTANGLE for solid background', () => {
    const ctx = createTestContext();
    const node = {
      name: 'Box',
      type: 'localRectangle',
      styles: {
        left: '10px',
        top: '20px',
        width: '200px',
        height: '100px',
        backgroundColor: '#ff0000',
      },
    };

    const result = transformRectangle(node, 'parent-1', ctx);
    expect(result.type).toBe('RECTANGLE');
    expect(result.x).toBe(10);
    expect(result.y).toBe(20);
    expect(result.width).toBe(200);
    expect(result.height).toBe(100);
    expect(ctx.stats.rectangleNodes).toBe(1);
  });

  test('creates IMAGE for real backgroundImage URL', () => {
    const ctx = createTestContext();
    const node = {
      name: 'Photo',
      type: 'localRectangle',
      styles: {
        width: '300px',
        height: '200px',
        backgroundImage: 'url("https://example.com/photo.jpg")',
      },
    };

    const result = transformRectangle(node, 'parent-1', ctx);
    expect(result.type).toBe('IMAGE');
    expect(ctx.stats.imageNodes).toBe(1);
  });

  test('creates IMAGE for wildcard backgroundImage', () => {
    const ctx = createTestContext();
    const node = {
      name: 'DynamicBg',
      type: 'localRectangle',
      styles: {
        width: '300px',
        height: '200px',
        backgroundImage: 'url("{{ proposal.cover }}")',
      },
    };

    const result = transformRectangle(node, 'parent-1', ctx);
    expect(result.type).toBe('IMAGE');
    if (result.type === 'IMAGE') {
      expect(result.imageRef).toContain('{{{ proposal.cover }}}');
    }
    expect(ctx.stats.imageNodes).toBe(1);
  });
});
