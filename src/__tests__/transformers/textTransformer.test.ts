import { describe, test, expect } from 'vitest';
import { transformText } from '../../transformers/textTransformer.js';
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

describe('textTransformer', () => {
  test('creates TextNode from localText with value', () => {
    const ctx = createTestContext();
    const node = {
      name: 'Title',
      type: 'localText',
      styles: {
        left: '32px',
        top: '71px',
        width: '705px',
        height: '53px',
        fontSize: '24px',
        color: 'rgb(255,255,255)',
      },
      value: '<p>Hello World</p>',
    };

    const result = transformText(node, 'parent-1', ctx);

    expect(result.type).toBe('TEXT');
    expect(result.name).toBe('Title');
    expect(result.parentId).toBe('parent-1');
    expect(result.x).toBe(32);
    expect(result.y).toBe(71);
    expect(result.width).toBe(705);
    expect(result.height).toBe(53);
    expect(result.fontSize).toBe(24);
    expect(result.htmlContent).toContain('Hello World');
    expect(result.characters).toContain('Hello World');
    expect(result.tiptapState).toBeNull();
    expect(ctx.stats.textNodes).toBe(1);
  });

  test('converts wildcards in text', () => {
    const ctx = createTestContext();
    const node = {
      name: 'WildcardText',
      type: 'localText',
      styles: { width: '100px', height: '20px' },
      value: '<p>Hello {{ name }}</p>',
    };

    const result = transformText(node, 'parent-1', ctx);
    expect(result.htmlContent).toContain('{{{ name }}}');
  });

  test('handles hidden text (display: none)', () => {
    const ctx = createTestContext();
    const node = {
      name: 'Hidden',
      type: 'localText',
      styles: { display: 'none', width: '100px', height: '20px' },
      value: '<p>Hidden text</p>',
    };

    const result = transformText(node, 'parent-1', ctx);
    expect(result.visible).toBe(false);
  });

  test('reads HTML from content field (real API format)', () => {
    const ctx = createTestContext();
    const node = {
      name: 'unamed',
      type: 'localText',
      styles: {
        left: '32px',
        top: '71px',
        width: '705px',
        height: '53px',
        color: '#FFF',
        fontSize: '40px',
      },
      content:
        '<p class="ql-align-justify" style="line-height: 36px;"><strong class="ql-font-NouvelR_Bold" style="color: rgb(255, 255, 255); font-size: 36px; font-weight: 700;"><span class="pr-wildcard" contenteditable="false">{{ proposal.title }}</span></strong></p>',
    };

    const result = transformText(node, 'frame-1', ctx);
    expect(result.htmlContent).toContain('proposal.title');
    expect(result.characters).toBeTruthy();
    expect(result.characters.length).toBeGreaterThan(0);
  });

  test('prefers content over value when both exist', () => {
    const ctx = createTestContext();
    const node = {
      name: 'Dual',
      type: 'localText',
      styles: { width: '100px', height: '20px' },
      content: '<p>From content</p>',
      value: '<p>From value</p>',
    };

    const result = transformText(node, 'parent-1', ctx);
    expect(result.htmlContent).toContain('From content');
  });
});
