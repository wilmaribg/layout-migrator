import { describe, test, expect } from 'vitest';
import { quillToTiptapHtml } from '../../converters/quillToTiptapHtml.js';

describe('quillToTiptapHtml', () => {
  test('ql-align-justify → text-align: justify', () => {
    const input = '<p class="ql-align-justify">Hello</p>';
    const result = quillToTiptapHtml(input);
    expect(result).toContain('text-align: justify');
    expect(result).not.toContain('ql-align-justify');
  });

  test('ql-align-center → text-align: center', () => {
    const input = '<p class="ql-align-center">Centered text</p>';
    const result = quillToTiptapHtml(input);
    expect(result).toContain('text-align: center');
    expect(result).not.toContain('ql-align-center');
  });

  test('ql-font-FontName → font-family: FontName', () => {
    const input = '<span class="ql-font-NouvelR_Bold">Bold text</span>';
    const result = quillToTiptapHtml(input);
    expect(result).toContain('font-family: NouvelR_Bold');
    expect(result).not.toContain('ql-font-');
  });

  test('preserves exact font names with __user__timestamp', () => {
    const input = '<span class="ql-font-NouvelR_Bold__roge__1234">Text</span>';
    const result = quillToTiptapHtml(input);
    // Font name is preserved exactly as-is
    expect(result).toContain('font-family: NouvelR_Bold__roge__1234');
  });

  test('strips pr-wildcard class', () => {
    const input = '<span class="pr-wildcard">{{ var }}</span>';
    const result = quillToTiptapHtml(input);
    expect(result).not.toContain('pr-wildcard');
    expect(result).toContain('{{ var }}');
  });

  test('strips contenteditable attributes', () => {
    const input = '<span contenteditable="false">text</span>';
    const result = quillToTiptapHtml(input);
    expect(result).not.toContain('contenteditable');
  });

  test('preserves inline styles', () => {
    const input = '<span style="font-size: 36px; color: rgb(255,255,255)">Big white text</span>';
    const result = quillToTiptapHtml(input);
    expect(result).toContain('font-size: 36px');
    expect(result).toContain('color: rgb(255,255,255)');
  });

  test('handles empty input', () => {
    expect(quillToTiptapHtml('')).toBe('');
  });

  test('preserves <br> tags', () => {
    const input = '<p><br></p>';
    const result = quillToTiptapHtml(input);
    expect(result).toContain('<br>');
  });

  test('handles multiple paragraphs', () => {
    const input = '<p>First</p><p>Second</p>';
    const result = quillToTiptapHtml(input);
    expect(result).toContain('<p>First</p>');
    expect(result).toContain('<p>Second</p>');
  });
});
