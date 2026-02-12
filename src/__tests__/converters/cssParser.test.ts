import { describe, test, expect } from 'vitest';
import { parseNodeStyles, parsePx, resolveFontFamily } from '../../converters/cssParser.js';

describe('cssParser', () => {
  describe('parsePx', () => {
    test('"705px" → 705', () => {
      expect(parsePx('705px')).toBe(705);
    });

    test('"53.5px" → 53.5', () => {
      expect(parsePx('53.5px')).toBe(53.5);
    });

    test('"auto" → null', () => {
      expect(parsePx('auto')).toBeNull();
    });

    test('undefined → null', () => {
      expect(parsePx(undefined)).toBeNull();
    });

    test('"none" → null', () => {
      expect(parsePx('none')).toBeNull();
    });
  });

  describe('parseNodeStyles', () => {
    test('parses full CSS properties', () => {
      const result = parseNodeStyles({
        left: '32px',
        top: '71px',
        width: '705px',
        height: '53px',
        opacity: '0.8',
        zIndex: '5',
      });

      expect(result.x).toBe(32);
      expect(result.y).toBe(71);
      expect(result.width).toBe(705);
      expect(result.height).toBe(53);
      expect(result.opacity).toBe(0.8);
      expect(result.zIndex).toBe(5);
      expect(result.visible).toBe(true);
    });

    test('display: none → visible: false', () => {
      const result = parseNodeStyles({ display: 'none', width: '100px', height: '50px' });
      expect(result.visible).toBe(false);
    });

    test('handles undefined styles', () => {
      const result = parseNodeStyles(undefined);
      expect(result.x).toBe(0);
      expect(result.y).toBe(0);
      expect(result.width).toBe(100);
      expect(result.height).toBe(100);
    });

    test('parses backgroundColor', () => {
      const result = parseNodeStyles({
        backgroundColor: 'rgb(255,0,0)',
        width: '100px',
        height: '100px',
      });
      expect(result.backgroundColor).toBe('rgb(255,0,0)');
    });

    test('parses backgroundImage URL', () => {
      const result = parseNodeStyles({
        backgroundImage: 'url("https://example.com/img.jpg")',
        width: '100px',
        height: '100px',
      });
      expect(result.backgroundImage).toBe('https://example.com/img.jpg');
    });

    test('parses border shorthand', () => {
      const result = parseNodeStyles({
        border: '2px solid #ff0000',
        width: '100px',
        height: '100px',
      });
      expect(result.border).toEqual({ width: 2, style: 'solid', color: '#ff0000' });
    });

    test('detects height: auto', () => {
      const result = parseNodeStyles({ width: '100px', height: 'auto' });
      expect(result.heightAuto).toBe(true);
    });

    test('parses minHeight', () => {
      const result = parseNodeStyles({ width: '100px', height: 'auto', minHeight: '792px' });
      expect(result.minHeight).toBe(792);
      expect(result.heightAuto).toBe(true);
    });
  });

  describe('resolveFontFamily', () => {
    test('preserves exact name when no fontMap', () => {
      // No normalization - exact name is preserved
      expect(resolveFontFamily('NouvelR_Bold__roge__1234')).toBe('NouvelR_Bold__roge__1234');
    });

    test('preserves exact name when fontMap is undefined', () => {
      expect(resolveFontFamily('NouvelR_Bold__roge__1234', undefined)).toBe(
        'NouvelR_Bold__roge__1234'
      );
    });

    test('uses fontMap with exact original match', () => {
      const fontMap = {
        NouvelR_Bold__roge__1234: 'NouvelR_Bold__roge__1234',
      };
      expect(resolveFontFamily('NouvelR_Bold__roge__1234', fontMap)).toBe(
        'NouvelR_Bold__roge__1234'
      );
    });

    test('falls back to exact name when not in fontMap', () => {
      const fontMap = {
        SomeOtherFont: 'SomeOtherFont',
      };
      // Returns exact name since it's not in fontMap
      expect(resolveFontFamily('NouvelR_Bold__roge__1234', fontMap)).toBe(
        'NouvelR_Bold__roge__1234'
      );
    });

    test('strips quotes before lookup', () => {
      const fontMap = {
        Arial: 'Arial',
      };
      expect(resolveFontFamily("'Arial'", fontMap)).toBe('Arial');
    });

    test('strips file extension only', () => {
      // File extension is removed, but everything else preserved
      expect(resolveFontFamily('NouvelR_Bold__roge__1234.ttf')).toBe('NouvelR_Bold__roge__1234');
    });
  });
});
