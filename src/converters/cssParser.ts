/**
 * CSS Parser — converts Prolibu node styles (key-value) to structured values
 *
 * Prolibu nodes have `styles: Record<string, string>` with CSS property values.
 * This parser extracts numeric values, background info, and border info.
 */

export interface ParentDimensions {
  width: number;
  height: number;
}

export interface ParsedStyles {
  x: number;
  y: number;
  width: number;
  height: number;
  opacity: number;
  visible: boolean;
  zIndex: number;
  backgroundColor?: string;
  backgroundImage?: string;
  border?: ParsedBorder;
  borderRadius?: number;
  fontFamily?: string;
  fontSize?: number;
  color?: string;
  fontWeight?: number;
  lineHeight?: number;
  minHeight?: number;
  heightAuto: boolean;
  widthAuto: boolean;
}

export interface ParsedBorder {
  width: number;
  style: string;
  color: string;
}

/**
 * Parse a Prolibu node's styles object into structured values.
 * @param styles The styles object from a Prolibu node
 * @param parentDimensions Optional parent dimensions for percentage calculations
 */
export function parseNodeStyles(
  styles: Record<string, string | number> | undefined,
  parentDimensions?: ParentDimensions
): ParsedStyles {
  if (!styles) {
    return {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      opacity: 1,
      visible: true,
      zIndex: 0,
      heightAuto: false,
      widthAuto: false,
    };
  }

  // Coerce all values to strings so downstream parsers work uniformly
  const s: Record<string, string> = {};
  for (const [k, v] of Object.entries(styles)) {
    s[k] = String(v);
  }

  // Detect auto dimensions
  const widthAuto = s.width === 'auto' || !s.width;
  const heightAuto = s.height === 'auto' || !s.height;

  // For auto width, use 85% of parent width as the standard width
  const x = parsePx(s.left) ?? 0;
  let width: number;
  if (widthAuto) {
    // Use 85% of parent width, or 400 as reasonable default without parent
    width = parentDimensions ? Math.round(parentDimensions.width * 0.85) : 400;
  } else {
    width = parseDimension(s.width, parentDimensions?.width) ?? 100;
  }

  const result: ParsedStyles = {
    x,
    y: parsePx(s.top) ?? 0,
    width,
    height: parseDimension(s.height, parentDimensions?.height) ?? 100,
    opacity:
      s.opacity !== undefined ? (isNaN(parseFloat(s.opacity)) ? 1 : parseFloat(s.opacity)) : 1,
    visible: s.display !== 'none',
    zIndex: s.zIndex ? (isNaN(parseInt(s.zIndex, 10)) ? 0 : parseInt(s.zIndex, 10)) : 0,
    heightAuto,
    widthAuto,
  };

  // Background color
  if (s.backgroundColor) {
    result.backgroundColor = s.backgroundColor;
  }

  // Background image
  if (s.backgroundImage && s.backgroundImage !== 'none') {
    // Extract URL from url("...") wrapper
    const urlMatch = s.backgroundImage.match(/url\(["']?(.+?)["']?\)/);
    if (urlMatch) {
      result.backgroundImage = urlMatch[1];
    } else {
      result.backgroundImage = s.backgroundImage;
    }
  }

  // Border
  const border = parseBorder(s);
  if (border) {
    result.border = border;
  }

  // Border radius
  if (s.borderRadius) {
    result.borderRadius = parsePx(s.borderRadius) ?? 0;
  }

  // Typography - preserve exact font name (only strip quotes and file extension)
  if (s.fontFamily) {
    result.fontFamily = s.fontFamily
      .replace(/^['"]|['"]$/g, '')
      .replace(/\.(ttf|otf|woff2?)$/i, '')
      .trim();
  }
  if (s.fontSize) {
    result.fontSize = parsePx(s.fontSize) ?? 16;
  }
  if (s.color) {
    result.color = s.color;
  }
  if (s.fontWeight) {
    result.fontWeight = parseInt(s.fontWeight, 10) || 400;
  }
  if (s.lineHeight) {
    result.lineHeight = parsePx(s.lineHeight) ?? undefined;
  }

  // Min height (for auto-grow pages)
  if (s.minHeight) {
    result.minHeight = parsePx(s.minHeight) ?? undefined;
  }

  return result;
}

/**
 * Parse a CSS pixel value: "705px" → 705, "auto" → null
 */
export function parsePx(value: string | undefined): number | null {
  if (!value || value === 'auto' || value === 'none') return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

/**
 * Parse a CSS dimension value that can be in px or percentage.
 * For percentages, calculates the actual pixel value based on parent dimension.
 *
 * @param value The CSS value (e.g., "90%", "100px", "auto")
 * @param parentDimension The parent dimension in pixels for percentage calculations
 * @returns The calculated pixel value, or null for "auto"/"none"
 *
 * Examples:
 *   parseDimension("90%", 792) → 712.8
 *   parseDimension("100px", 792) → 100
 *   parseDimension("auto", 792) → null
 */
export function parseDimension(value: string | undefined, parentDimension?: number): number | null {
  if (!value || value === 'auto' || value === 'none') return null;

  // Check if it's a percentage
  if (value.endsWith('%')) {
    const percent = parseFloat(value);
    if (isNaN(percent)) return null;

    // If no parent dimension provided, fallback to treating percentage as raw number
    // This maintains backward compatibility but may produce suboptimal results
    if (parentDimension === undefined) {
      return percent; // Fallback: treat "90%" as 90
    }

    return Math.round((percent / 100) * parentDimension);
  }

  // Otherwise parse as px value
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}

/**
 * Parse border properties from styles into a structured border.
 */
function parseBorder(styles: Record<string, string>): ParsedBorder | null {
  // Shorthand: "1px solid #000"
  if (styles.border && styles.border !== 'none') {
    const match = styles.border.match(/^([\d.]+)px\s+(\w+)\s+(.+)$/);
    if (match) {
      return { width: parseFloat(match[1]), style: match[2], color: match[3] };
    }
  }

  // Longhand: borderWidth + borderStyle + borderColor
  if (styles.borderWidth || styles.borderStyle || styles.borderColor) {
    return {
      width: parsePx(styles.borderWidth) ?? 1,
      style: styles.borderStyle || 'solid',
      color: styles.borderColor || '#000000',
    };
  }

  // Top/Bottom/Left/Right specific (take first found)
  if (styles.borderBottom && styles.borderBottom !== 'none') {
    const match = styles.borderBottom.match(/^([\d.]+)px\s+(\w+)\s+(.+)$/);
    if (match) {
      return { width: parseFloat(match[1]), style: match[2], color: match[3] };
    }
  }
  if (styles.borderTop && styles.borderTop !== 'none') {
    const match = styles.borderTop.match(/^([\d.]+)px\s+(\w+)\s+(.+)$/);
    if (match) {
      return { width: parseFloat(match[1]), style: match[2], color: match[3] };
    }
  }

  return null;
}

/**
 * Resolve font family using font map (if available).
 * Preserves exact font names - only removes CSS quotes and file extensions.
 * Falls back to original name if no mapping exists.
 *
 * @param name Original font name from v1 template
 * @param fontMap Map of original names → same names (from font sync)
 * @returns Resolved font family name for v2
 */
export function resolveFontFamily(name: string, fontMap?: Record<string, string>): string {
  // Remove CSS quotes and file extension only, preserve everything else
  const cleanedName = name
    .replace(/^['"]|['"]$/g, '')
    .replace(/\.(ttf|otf|woff2?)$/i, '')
    .trim();

  // If no fontMap, return cleaned name
  if (!fontMap) {
    return cleanedName;
  }

  // Try exact match
  if (fontMap[cleanedName]) {
    return fontMap[cleanedName];
  }

  // Fallback to cleaned name
  return cleanedName;
}
