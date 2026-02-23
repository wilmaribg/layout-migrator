import { describe, test, expect } from 'vitest';
import {
  parseNodeStyles,
  parsePx,
  parseDimension,
  resolveFontFamily,
} from '../../converters/cssParser.js';

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

  describe('parseDimension', () => {
    test('"90%" with parent 792 → 713', () => {
      expect(parseDimension('90%', 792)).toBe(713);
    });

    test('"50%" with parent 612 → 306', () => {
      expect(parseDimension('50%', 612)).toBe(306);
    });

    test('"100%" with parent 792 → 792', () => {
      expect(parseDimension('100%', 792)).toBe(792);
    });

    test('"70%" with parent 612 → 428', () => {
      expect(parseDimension('70%', 612)).toBe(428);
    });

    test('"100px" with parent 792 → 100 (ignores parent)', () => {
      expect(parseDimension('100px', 792)).toBe(100);
    });

    test('"auto" → null', () => {
      expect(parseDimension('auto', 792)).toBeNull();
    });

    test('undefined → null', () => {
      expect(parseDimension(undefined, 792)).toBeNull();
    });

    test('"90%" without parent → 90 (fallback)', () => {
      expect(parseDimension('90%')).toBe(90);
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

    test('calculates percentage widths with parent dimensions', () => {
      const result = parseNodeStyles(
        { width: '90%', height: '70%', left: '45px', top: '36px' },
        { width: 792, height: 612 }
      );
      expect(result.width).toBe(713); // 90% of 792
      expect(result.height).toBe(428); // 70% of 612
      expect(result.x).toBe(45);
      expect(result.y).toBe(36);
    });

    test('falls back gracefully for percentage without parent', () => {
      const result = parseNodeStyles({ width: '90%', height: '70%' });
      expect(result.width).toBe(90); // fallback: percentage as number
      expect(result.height).toBe(70);
    });

    test('handles width: auto with parent dimensions (85% of parent)', () => {
      const result = parseNodeStyles(
        { width: 'auto', height: 'auto', left: '28px', top: '90px' },
        { width: 612, height: 792 }
      );
      // width should be 85% of parent = 612 * 0.85 = 520
      expect(result.width).toBe(520);
      expect(result.widthAuto).toBe(true);
      expect(result.heightAuto).toBe(true);
      expect(result.x).toBe(28);
    });

    test('handles width: auto without parent dimensions', () => {
      const result = parseNodeStyles({ width: 'auto', height: '100px' });
      expect(result.width).toBe(400); // default fallback
      expect(result.widthAuto).toBe(true);
      expect(result.heightAuto).toBe(false);
    });

    test('sets widthAuto and heightAuto correctly for fixed values', () => {
      const result = parseNodeStyles({ width: '523px', height: '188px' });
      expect(result.widthAuto).toBe(false);
      expect(result.heightAuto).toBe(false);
      expect(result.width).toBe(523);
      expect(result.height).toBe(188);
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
