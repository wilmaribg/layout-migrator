import { describe, test, expect } from 'vitest';
import { parseColor } from '../../converters/colorParser.js';

describe('colorParser', () => {
  test('rgb(255, 0, 128) → RGBA', () => {
    expect(parseColor('rgb(255, 0, 128)')).toEqual({ r: 255, g: 0, b: 128, a: 1 });
  });

  test('rgba(100, 200, 50, 0.5) → RGBA', () => {
    expect(parseColor('rgba(100, 200, 50, 0.5)')).toEqual({ r: 100, g: 200, b: 50, a: 0.5 });
  });

  test('#fff → white', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });

  test('#FFFFFF → white', () => {
    expect(parseColor('#FFFFFF')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });

  test('#000000 → black', () => {
    expect(parseColor('#000000')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  test('#FF000080 → red with alpha', () => {
    const result = parseColor('#FF000080');
    expect(result.r).toBe(255);
    expect(result.g).toBe(0);
    expect(result.b).toBe(0);
    expect(result.a).toBeCloseTo(0.5, 1);
  });

  test('transparent → alpha 0', () => {
    expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, a: 0 });
  });

  test('white → named color', () => {
    expect(parseColor('white')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });

  test('black → named color', () => {
    expect(parseColor('black')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  test('unknown string → fallback black', () => {
    expect(parseColor('foobar')).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  test('handles whitespace', () => {
    expect(parseColor('  rgb( 50 , 100 , 150 )  ')).toEqual({ r: 50, g: 100, b: 150, a: 1 });
  });
});
