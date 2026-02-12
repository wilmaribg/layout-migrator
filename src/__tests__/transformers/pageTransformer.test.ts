import { describe, test, expect } from 'vitest';
import { transformPage } from '../../transformers/pageTransformer.js';
import { PAGE_SIZES } from '@design-studio/schema';

describe('pageTransformer', () => {
  test('transforms a regular FRAME into a Page + root FrameNode', () => {
    const frame = {
      name: 'Slide 1',
      type: 'FRAME',
      styles: {
        width: '792px',
        height: '612px',
        backgroundColor: '#ffffff',
      },
      children: [],
    };

    const result = transformPage(frame, 0, PAGE_SIZES.fixed);

    expect(result.page.name).toBe('Slide 1');
    expect(result.page.rootId).toBe(result.rootFrame.id);
    expect(result.page.orientation).toBe('landscape');
    expect(result.page.isPlaceholder).toBe(false);
    expect(result.rootFrame.type).toBe('FRAME');
    expect(result.rootFrame.width).toBe(792);
    expect(result.rootFrame.height).toBe(612);
    expect(result.rootFrame.parentId).toBeNull();
  });

  test('transforms a presetPage with layoutProductSnippets into placeholder', () => {
    const frame = {
      name: 'Snippets Page',
      type: 'presetPage',
      styles: { width: '792px', height: '612px' },
      children: [
        {
          name: 'layoutProductSnippets',
          type: 'localLayoutContent',
          styles: {},
        },
      ],
    };

    const result = transformPage(frame, 0, PAGE_SIZES.fixed);

    expect(result.page.isPlaceholder).toBe(true);
    expect(result.page.types).toContain('marker');
    expect(result.page.placeholder?.contentType).toBe('snippets');
    expect(result.page.placeholder?.rules.emptyBehavior).toBe('hide');

    // Should have a TEXT child with {{{productSnippets}}}
    const extraNodeIds = Object.keys(result.extraNodes);
    expect(extraNodeIds.length).toBe(1);
    const textNode = result.extraNodes[extraNodeIds[0]];
    expect(textNode.type).toBe('TEXT');
    if (textNode.type === 'TEXT') {
      expect(textNode.htmlContent).toContain('{{{productSnippets}}}');
    }
  });

  test('transforms a presetPage without layoutContent as external placeholder', () => {
    const frame = {
      name: 'Custom Page',
      type: 'presetPage',
      styles: { width: '792px', height: '612px' },
      children: [],
    };

    const result = transformPage(frame, 0, PAGE_SIZES.fixed);

    expect(result.page.isPlaceholder).toBe(true);
    expect(result.page.placeholder?.contentType).toBe('external');
  });

  test('handles auto-grow pages', () => {
    const frame = {
      name: 'Quote Page',
      type: 'presetPage',
      styles: {
        width: '792px',
        height: 'auto',
        minHeight: '792px',
      },
      children: [],
    };

    const result = transformPage(frame, 0, PAGE_SIZES.fixed);

    expect(result.rootFrame.autoGrow).toBe(true);
    expect(result.rootFrame.minHeight).toBe(792);
  });

  test('handles frame with background image wildcard', () => {
    const frame = {
      name: 'Bg Page',
      type: 'FRAME',
      styles: {
        width: '792px',
        height: '612px',
        backgroundImage: 'url("{{ proposal.cover }}")',
      },
      children: [],
    };

    const result = transformPage(frame, 0, PAGE_SIZES.fixed);

    expect(result.rootFrame.backgroundImage).toContain('{{{ proposal.cover }}}');
  });
});
