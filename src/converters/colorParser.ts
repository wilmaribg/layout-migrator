/**
 * Color Parser — converts CSS color strings to RGBA
 *
 * Supports: rgb(), rgba(), hex (#RGB, #RRGGBB, #RRGGBBAA),
 * 'transparent', and named colors (white, black).
 */

import type { RGBA } from '@design-studio/schema';

const NAMED_COLORS: Record<string, RGBA> = {
  white: { r: 255, g: 255, b: 255, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  red: { r: 255, g: 0, b: 0, a: 1 },
  green: { r: 0, g: 128, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 255, a: 1 },
  gray: { r: 128, g: 128, b: 128, a: 1 },
  grey: { r: 128, g: 128, b: 128, a: 1 },
  transparent: { r: 0, g: 0, b: 0, a: 0 },
};

export function parseColor(cssColor: string): RGBA {
  const trimmed = cssColor.trim().toLowerCase();

  // Named colors
  if (NAMED_COLORS[trimmed]) {
    return { ...NAMED_COLORS[trimmed] };
  }

  // rgb(r, g, b)
  const rgbMatch = trimmed.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (rgbMatch) {
    return {
      r: clamp(parseInt(rgbMatch[1], 10), 0, 255),
      g: clamp(parseInt(rgbMatch[2], 10), 0, 255),
      b: clamp(parseInt(rgbMatch[3], 10), 0, 255),
      a: 1,
    };
  }

  // rgba(r, g, b, a)
  const rgbaMatch = trimmed.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/);
  if (rgbaMatch) {
    return {
      r: clamp(parseInt(rgbaMatch[1], 10), 0, 255),
      g: clamp(parseInt(rgbaMatch[2], 10), 0, 255),
      b: clamp(parseInt(rgbaMatch[3], 10), 0, 255),
      a: clamp(parseFloat(rgbaMatch[4]), 0, 1),
    };
  }

  // Hex
  if (trimmed.startsWith('#')) {
    return parseHex(trimmed);
  }

  // Fallback: black (unrecognized format)
  console.warn(`⚠️  Unrecognized color format: "${cssColor}" — defaulting to black`);
  return { r: 0, g: 0, b: 0, a: 1 };
}

function parseHex(hex: string): RGBA {
  const h = hex.slice(1);

  if (h.length === 3) {
    // #RGB → #RRGGBB
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
      a: 1,
    };
  }

  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1,
    };
  }

  if (h.length === 8) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: Math.round((parseInt(h.slice(6, 8), 16) / 255) * 100) / 100,
    };
  }

  return { r: 0, g: 0, b: 0, a: 1 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
