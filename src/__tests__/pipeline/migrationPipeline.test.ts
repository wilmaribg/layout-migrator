import { describe, test, expect } from 'vitest';
import { migrateFromLayout } from '../../pipeline/migrationPipeline.js';
import type { ProlibuLayout } from '../../types/prolibu.js';

/**
 * Fixture: simplified Prolibu layout response for E2E testing
 */
function createTestLayout(): ProlibuLayout {
  return {
    _id: 'test-template-001',
    contentTemplateName: 'Test Proposal',
    contentTemplateCode: 'TEST-001',
    templateType: 'layout',
    pages: [
      {
        name: 'Main Page',
        children: [
          // Frame 1: Regular page with text and image
          {
            name: 'Cover',
            type: 'FRAME',
            styles: {
              width: '792px',
              height: '612px',
              backgroundColor: '#1a1a2e',
            },
            children: [
              {
                name: 'Title',
                type: 'localText',
                styles: {
                  left: '50px',
                  top: '100px',
                  width: '692px',
                  height: '60px',
                  fontSize: '36px',
                  color: 'rgb(255,255,255)',
                },
                value:
                  '<p class="ql-align-center"><span style="font-size: 36px; color: rgb(255,255,255)">{{ proposal.title }}</span></p>',
              },
              {
                name: 'Logo',
                type: 'localRectangle',
                styles: {
                  left: '300px',
                  top: '200px',
                  width: '192px',
                  height: '192px',
                  backgroundImage: 'url("https://example.com/logo.png")',
                },
              },
              {
                name: 'Divider',
                type: 'localLineHorizontal',
                styles: {
                  left: '50px',
                  top: '420px',
                  width: '692px',
                  height: '1px',
                  borderBottom: '1px solid rgb(255,255,255)',
                },
              },
            ],
          },
          // Frame 2: Component page
          {
            name: 'Quote',
            type: 'FRAME',
            styles: {
              width: '792px',
              height: '612px',
              backgroundColor: '#ffffff',
            },
            children: [
              {
                name: 'QuoteComponent',
                type: 'localGroup',
                styles: {
                  left: '20px',
                  top: '20px',
                  width: '752px',
                  height: '570px',
                },
                comCompConfig: {
                  comQuote: {
                    title: 'Price Quote',
                    columns: ['name', 'unitPrice', 'qty', 'total'],
                  },
                },
                children: [{ name: '--comQuote', type: 'localCom' }],
              },
            ],
          },
          // Frame 3: Preset page (snippets)
          {
            name: 'Product Details',
            type: 'presetPage',
            styles: {
              width: '792px',
              height: 'auto',
              minHeight: '612px',
            },
            children: [
              {
                name: 'layoutProductSnippets',
                type: 'localLayoutContent',
              },
            ],
          },
        ],
      },
    ],
    defaultFont: 'NouvelR_Book',
    secondaryFont: 'NouvelR_Bold',
    embeddedFonts: [
      {
        fontName: 'NouvelR_Book__roge__1234.ttf',
        fontUrl: 'https://s3.example.com/NouvelR_Book.ttf',
      },
      {
        fontName: 'NouvelR_Bold__roge__1234.ttf',
        fontUrl: 'https://s3.example.com/NouvelR_Bold.ttf',
      },
    ],
  };
}

describe('migrationPipeline', () => {
  test('full E2E: transforms a complete layout into a valid Document', () => {
    const layout = createTestLayout();
    const result = migrateFromLayout(layout);

    // Should create 3 pages
    expect(result.document.pages).toHaveLength(3);

    // Page 1: Cover
    const coverPage = result.document.pages[0];
    expect(coverPage.name).toBe('Cover');
    expect(coverPage.isPlaceholder).toBe(false);

    // Page 2: Quote
    const quotePage = result.document.pages[1];
    expect(quotePage.name).toBe('Quote');
    expect(quotePage.isPlaceholder).toBe(false);

    // Page 3: Product Snippets (placeholder - uses V2 preset name)
    const snippetPage = result.document.pages[2];
    expect(snippetPage.name).toBe('Product Snippets');
    expect(snippetPage.isPlaceholder).toBe(true);
    expect(snippetPage.placeholder?.contentType).toBe('snippets');

    // Validate node count
    const nodeCount = Object.keys(result.document.nodes).length;
    expect(nodeCount).toBeGreaterThan(0);

    // Check stats
    expect(result.stats.pages).toBe(3);
    expect(result.stats.textNodes).toBeGreaterThanOrEqual(1);
    expect(result.stats.imageNodes).toBeGreaterThanOrEqual(1);
    expect(result.stats.componentNodes).toBeGreaterThanOrEqual(1);
    expect(result.stats.lineNodes).toBeGreaterThanOrEqual(1);

    // Fonts should be resolved with exact names (no normalization)
    expect(result.document.assets.fonts).toHaveProperty('NouvelR_Book__roge__1234');
    expect(result.document.assets.fonts).toHaveProperty('NouvelR_Bold__roge__1234');
    // defaultFont is preserved exactly as provided in the layout
    expect(result.document.settings.typography.defaultFontFamily).toBe('NouvelR_Book');

    // Metadata should contain prolibu ID
    expect(result.document.metadata.custom.prolibuId).toBe('test-template-001');

    // Wildcards should be converted
    const titleNode = Object.values(result.document.nodes).find(
      (n) => n.type === 'TEXT' && n.name === 'Title'
    );
    expect(titleNode).toBeDefined();
    if (titleNode?.type === 'TEXT') {
      expect(titleNode.htmlContent).toContain('{{{ proposal.title }}}');
    }

    // Validation should pass
    expect(result.validation.valid).toBe(true);
  });

  test('produces zero validation errors on valid layout', () => {
    const layout = createTestLayout();
    const result = migrateFromLayout(layout);
    expect(result.validation.errors).toHaveLength(0);
  });

  test('handles empty pages array gracefully', () => {
    const layout: ProlibuLayout = {
      _id: 'empty-001',
      contentTemplateName: 'Empty Template',
      templateType: 'layout',
      pages: [{ name: 'Empty', children: [] }],
    };

    const result = migrateFromLayout(layout);
    expect(result.document.pages).toHaveLength(0);
    expect(result.stats.pages).toBe(0);
  });
});
