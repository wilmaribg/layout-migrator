#!/usr/bin/env node

// src/index.ts
import { Command } from "commander";
import { writeFile, mkdir } from "fs/promises";
import { dirname, resolve as resolve3 } from "path";

// ../../packages/schema/dist/validation.js
function validateDocument(doc) {
  const errors = [];
  const warnings = [];
  if (!doc || typeof doc !== "object") {
    errors.push({
      path: "",
      message: "Document must be an object",
      code: "INVALID_DOCUMENT"
    });
    return { valid: false, errors, warnings };
  }
  const d = doc;
  if (!d.version || typeof d.version !== "string") {
    errors.push({
      path: "version",
      message: "Document must have a version string",
      code: "MISSING_VERSION"
    });
  }
  if (!d.id || typeof d.id !== "string") {
    errors.push({
      path: "id",
      message: "Document must have an id",
      code: "MISSING_ID"
    });
  }
  if (!d.pages || !Array.isArray(d.pages)) {
    errors.push({
      path: "pages",
      message: "Document must have pages array",
      code: "MISSING_PAGES"
    });
  }
  if (!d.nodes || typeof d.nodes !== "object") {
    errors.push({
      path: "nodes",
      message: "Document must have nodes object",
      code: "MISSING_NODES"
    });
  }
  if (d.pages && Array.isArray(d.pages) && d.nodes && typeof d.nodes === "object") {
    let collectReachable2 = function(nodeId) {
      if (reachableNodes.has(nodeId))
        return;
      reachableNodes.add(nodeId);
      const node = nodes[nodeId];
      if (node?.children && Array.isArray(node.children)) {
        node.children.forEach(collectReachable2);
      }
    };
    var collectReachable = collectReachable2;
    const nodes = d.nodes;
    const pages = d.pages;
    pages.forEach((page, index) => {
      if (!page.rootId || typeof page.rootId !== "string") {
        errors.push({
          path: `pages[${index}].rootId`,
          message: `Page ${index} must have a rootId`,
          code: "PAGE_MISSING_ROOT_ID"
        });
      } else if (!nodes[page.rootId]) {
        errors.push({
          path: `pages[${index}].rootId`,
          message: `Page ${index} rootId "${page.rootId}" does not exist in nodes`,
          code: "PAGE_ROOT_NOT_FOUND"
        });
      } else {
        const rootNode = nodes[page.rootId];
        if (rootNode.type !== "FRAME") {
          errors.push({
            path: `pages[${index}].rootId`,
            message: `Page ${index} root must be a FRAME, got ${rootNode.type}`,
            code: "PAGE_ROOT_NOT_FRAME"
          });
        }
        if (rootNode.parentId !== null) {
          warnings.push({
            path: `pages[${index}].rootId`,
            message: `Page ${index} root frame has a parentId (expected null for root)`,
            code: "PAGE_ROOT_HAS_PARENT"
          });
        }
      }
    });
    Object.entries(nodes).forEach(([nodeId, node]) => {
      const n = node;
      if (n.parentId && typeof n.parentId === "string") {
        if (!nodes[n.parentId]) {
          errors.push({
            path: `nodes.${nodeId}.parentId`,
            message: `Node "${nodeId}" references non-existent parent "${n.parentId}"`,
            code: "DANGLING_PARENT_REF"
          });
        } else {
          const parent = nodes[n.parentId];
          if (parent.children && Array.isArray(parent.children)) {
            if (!parent.children.includes(nodeId)) {
              warnings.push({
                path: `nodes.${nodeId}.parentId`,
                message: `Node "${nodeId}" has parentId "${n.parentId}" but parent's children array doesn't include it`,
                code: "PARENT_CHILDREN_MISMATCH"
              });
            }
          }
        }
      }
      if (n.children && Array.isArray(n.children)) {
        n.children.forEach((childId, idx) => {
          if (!nodes[childId]) {
            errors.push({
              path: `nodes.${nodeId}.children[${idx}]`,
              message: `Node "${nodeId}" has non-existent child "${childId}"`,
              code: "DANGLING_CHILD_REF"
            });
          } else {
            const child = nodes[childId];
            if (child.parentId !== nodeId) {
              warnings.push({
                path: `nodes.${nodeId}.children[${idx}]`,
                message: `Node "${nodeId}" has child "${childId}" but child's parentId is "${child.parentId}"`,
                code: "CHILDREN_PARENT_MISMATCH"
              });
            }
          }
        });
      }
    });
    const reachableNodes = /* @__PURE__ */ new Set();
    pages.forEach((page) => {
      if (page.rootId && typeof page.rootId === "string" && nodes[page.rootId]) {
        collectReachable2(page.rootId);
      }
    });
    Object.keys(nodes).forEach((nodeId) => {
      if (!reachableNodes.has(nodeId)) {
        warnings.push({
          path: `nodes.${nodeId}`,
          message: `Node "${nodeId}" is orphaned (not reachable from any page root)`,
          code: "ORPHANED_NODE"
        });
      }
    });
  }
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// ../../packages/schema/dist/defaults.js
var SCHEMA_VERSION = "1.0.0";
var PAGE_SIZES = {
  fixed: { width: 792, height: 612, preset: "fixed" }
};
var DEFAULT_COLORS = {
  white: { r: 255, g: 255, b: 255, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  gray: { r: 128, g: 128, b: 128, a: 1 },
  primary: { r: 59, g: 130, b: 246, a: 1 },
  // #3B82F6
  transparent: { r: 0, g: 0, b: 0, a: 0 }
};
var DEFAULT_CONSTRAINTS = {
  horizontal: "left",
  vertical: "top"
};
var DEFAULT_TYPOGRAPHY_SETTINGS = {
  defaultFontFamily: "Inter",
  defaultFontSize: 16,
  defaultFontWeight: 400,
  defaultLineHeight: 1.5,
  defaultTextColor: "#000000",
  availableFonts: [
    "Inter",
    "Roboto",
    "Open Sans",
    "Lato",
    "Montserrat",
    "Poppins",
    "Source Sans Pro",
    "Playfair Display",
    "Merriweather",
    "Georgia",
    "Times New Roman",
    "Arial",
    "Helvetica"
  ]
};
var DEFAULT_DOCUMENT_SETTINGS = {
  grid: {
    enabled: true,
    size: 8,
    color: "#E5E5E5",
    snap: true
  },
  rulers: {
    enabled: true,
    unit: "px"
  },
  background: "#FFFFFF",
  typography: DEFAULT_TYPOGRAPHY_SETTINGS
};
function createFrameNode(overrides) {
  return {
    type: "FRAME",
    parentId: null,
    children: [],
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    visible: true,
    locked: false,
    opacity: 1,
    constraints: DEFAULT_CONSTRAINTS,
    blendMode: "normal",
    pluginData: {},
    clipContent: true,
    constrainChildren: true,
    fills: [{ type: "solid", color: DEFAULT_COLORS.white, opacity: 1 }],
    strokes: [],
    strokeWeight: 0,
    strokeAlign: "inside",
    cornerRadius: 0,
    layoutMode: "none",
    layoutWrap: false,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    itemSpacing: 0,
    counterAxisAlign: "start",
    primaryAxisAlign: "start",
    effects: [],
    ...overrides
  };
}
function createRectangleNode(overrides) {
  return {
    type: "RECTANGLE",
    parentId: null,
    children: [],
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    rotation: 0,
    visible: true,
    locked: false,
    opacity: 1,
    constraints: DEFAULT_CONSTRAINTS,
    blendMode: "normal",
    pluginData: {},
    fills: [{ type: "solid", color: DEFAULT_COLORS.gray, opacity: 1 }],
    strokes: [],
    strokeWeight: 0,
    strokeAlign: "inside",
    cornerRadius: 0,
    effects: [],
    ...overrides
  };
}
function createRichTextContent(text = "Text") {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: text ? [
          {
            type: "text",
            text
          }
        ] : []
      }
    ]
  };
}
function createTextNode(overrides) {
  const characters = overrides.characters ?? "Text";
  const content = overrides.content ?? createRichTextContent(characters);
  const tiptapState = overrides.tiptapState ?? null;
  const htmlContent = overrides.htmlContent ?? "";
  return {
    type: "TEXT",
    parentId: null,
    children: [],
    x: 0,
    y: 0,
    width: 1,
    // Cursor width - auto-resize will expand as user types
    height: 24,
    // Line height based on default fontSize 16
    rotation: 0,
    visible: true,
    locked: false,
    opacity: 1,
    constraints: DEFAULT_CONSTRAINTS,
    blendMode: "normal",
    pluginData: {},
    content,
    tiptapState,
    htmlContent,
    characters,
    fontFamily: "inherit",
    // Use document default
    fontWeight: 400,
    fontSize: 16,
    lineHeight: { value: 1.5, unit: "auto" },
    letterSpacing: { value: 0, unit: "px" },
    textAlign: "left",
    verticalAlign: "top",
    textDecoration: "none",
    textTransform: "none",
    fills: [{ type: "solid", color: DEFAULT_COLORS.black, opacity: 1 }],
    // Container/Box properties
    backgroundFills: [],
    // No background by default (transparent)
    strokes: [],
    strokeWeight: 1,
    strokeAlign: "inside",
    cornerRadius: 0,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    textAutoResize: "width-and-height",
    ...overrides
  };
}
function generateId() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === "x" ? r : r & 3 | 8;
    return v.toString(16);
  });
}

// src/types/prolibu.ts
import { z } from "zod";
var ProlibuNodeSchema = z.object({
  name: z.string(),
  type: z.string(),
  styles: z.record(z.union([z.string(), z.number()])).optional(),
  content: z.string().optional(),
  value: z.string().optional(),
  children: z.array(z.lazy(() => ProlibuNodeSchema)).optional(),
  comCompConfig: z.record(z.unknown()).optional()
});
var ProlibuPageSchema = z.object({
  name: z.string().optional(),
  children: z.array(ProlibuNodeSchema)
});
var ProlibuEmbeddedFontSchema = z.union([
  // Poblado: objeto con URL completa
  z.object({
    _id: z.string(),
    fileName: z.string(),
    filePath: z.string().optional(),
    url: z.string(),
    mimeType: z.string().optional(),
    size: z.number().optional()
  }),
  // Legacy: objeto simple
  z.object({
    fontName: z.string(),
    fontUrl: z.string()
  }),
  // Solo ID string (no poblado)
  z.string()
]);
var ProlibuLayoutSchema = z.object({
  _id: z.string(),
  contentTemplateName: z.string(),
  contentTemplateCode: z.string().optional(),
  templateType: z.string(),
  pages: z.array(ProlibuPageSchema),
  defaultFont: z.string().optional(),
  secondaryFont: z.string().optional(),
  embeddedFonts: z.array(ProlibuEmbeddedFontSchema).optional(),
  assets: z.array(z.unknown()).optional(),
  figma: z.object({ pagePreviews: z.array(z.unknown()) }).optional()
});

// src/client/prolibuClient.ts
var REQUEST_TIMEOUT = 3e4;
var MAX_RETRIES = 3;
var RETRYABLE_STATUS = /* @__PURE__ */ new Set([408, 429, 500, 502, 503, 504]);
var ProlibuApiError = class extends Error {
  constructor(message, statusCode, responseBody) {
    super(message);
    this.statusCode = statusCode;
    this.responseBody = responseBody;
    this.name = "ProlibuApiError";
  }
};
var ProlibuParseError = class extends Error {
  constructor(message, zodErrors) {
    super(message);
    this.zodErrors = zodErrors;
    this.name = "ProlibuParseError";
  }
};
async function fetchContentTemplate(id, config) {
  const populatePath = JSON.stringify([{ path: "embeddedFonts", select: "fileName url mimeType" }]);
  const url = `${config.baseUrl}/v2/contenttemplate/${id}?populatePath=${encodeURIComponent(populatePath)}`;
  const response = await fetchWithRetry(
    url,
    {
      method: "GET",
      headers: {
        Authorization: config.authToken,
        "Content-Type": "application/json"
      }
    },
    `fetching template ${id}`
  );
  const json = await safeParseJson(response, `template ${id}`);
  const parsed = ProlibuLayoutSchema.safeParse(json);
  if (!parsed.success) {
    throw new ProlibuParseError(
      `Invalid API response structure for template ${id}: ${parsed.error.message}`,
      parsed.error.issues
    );
  }
  return parsed.data;
}
function documentToPayload(doc, options = {}) {
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  const name = options.name ?? `${doc.name} [migrated ${today}]`;
  const templateType = options.templateType ?? "layout";
  const pages = doc.pages.map((page, index) => {
    const base = {
      id: page.id,
      name: page.name,
      rootId: page.rootId,
      orientation: page.orientation,
      size: page.size,
      types: page.types,
      isPlaceholder: page.isPlaceholder
    };
    if (page.placeholder) {
      base.placeholder = page.placeholder;
    }
    if (index === 0) {
      base.nodes = doc.nodes;
      base.settings = doc.settings;
    }
    return base;
  });
  const googleFontsHtml = buildGoogleFontsLinkTags(doc.settings.typography.googleFonts ?? []);
  return {
    contentTemplateName: name,
    templateType,
    pages,
    html: "",
    // No browser rendering available — empty is accepted by the API
    // Font configuration
    defaultFont: doc.settings.typography.defaultFontFamily || void 0,
    // NOTE: assets expects File document IDs, not the actual image data
    meta: {
      googleFonts: googleFontsHtml
    }
  };
}
async function createContentTemplate(doc, config, options = {}) {
  const payload = documentToPayload(doc, options);
  const url = `${config.baseUrl}/v2/contenttemplate/`;
  const response = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: {
        Authorization: config.authToken,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    },
    "creating template"
  );
  const json = await safeParseJson(response, "create response");
  const _id = json._id ?? json.id ?? "";
  if (!_id) {
    throw new ProlibuApiError("API returned no _id for created template", 0);
  }
  return {
    _id,
    contentTemplateName: json.contentTemplateName
  };
}
function buildGoogleFontsLinkTags(googleFonts) {
  if (googleFonts.length === 0) return "";
  return googleFonts.map((f) => {
    const weights = f.weights.length > 0 ? `:wght@${f.weights.join(";")}` : "";
    const family = f.family.replace(/\s+/g, "+");
    return `<link href="https://fonts.googleapis.com/css2?family=${family}${weights}&display=swap" rel="stylesheet">`;
  }).join("\n");
}
async function fetchWithRetry(url, init, context, attempt = 1) {
  let response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT)
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new ProlibuApiError(`Request timed out (${REQUEST_TIMEOUT}ms) ${context}`, 0);
    }
    if (attempt < MAX_RETRIES) {
      const delay = Math.min(1e3 * 2 ** (attempt - 1), 8e3);
      await sleep(delay);
      return fetchWithRetry(url, init, context, attempt + 1);
    }
    throw new ProlibuApiError(
      `Network error ${context} after ${MAX_RETRIES} attempts: ${error instanceof Error ? error.message : String(error)}`,
      0
    );
  }
  if (RETRYABLE_STATUS.has(response.status) && init.method === "GET" && attempt < MAX_RETRIES) {
    const delay = Math.min(1e3 * 2 ** (attempt - 1), 8e3);
    await sleep(delay);
    return fetchWithRetry(url, init, context, attempt + 1);
  }
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ProlibuApiError(
      `API error: ${response.status} ${response.statusText} ${context}`,
      response.status,
      body
    );
  }
  return response;
}
async function safeParseJson(response, context) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new ProlibuApiError(
      `Invalid JSON response ${context}: ${text.slice(0, 200)}`,
      response.status,
      text
    );
  }
}
function sleep(ms) {
  return new Promise((resolve4) => setTimeout(resolve4, ms));
}

// src/assets/fontResolver.ts
function resolveFonts(layout) {
  const fontAssets = {};
  const fontFamilies = /* @__PURE__ */ new Map();
  const seenBaseNames = /* @__PURE__ */ new Set();
  if (layout.embeddedFonts) {
    for (const font of layout.embeddedFonts) {
      let fontName;
      let fontUrl;
      if (typeof font === "string") {
        fontName = font;
        fontUrl = "";
      } else if ("fileName" in font) {
        fontName = font.fileName;
        fontUrl = font.url;
      } else if ("fontName" in font) {
        fontName = font.fontName;
        fontUrl = font.fontUrl;
      } else {
        continue;
      }
      const exactName = fontName.replace(/\.(ttf|otf|woff2?)$/i, "");
      if (seenBaseNames.has(exactName)) continue;
      seenBaseNames.add(exactName);
      const familyBase = extractFamilyBase(exactName);
      if (fontFamilies.has(familyBase)) {
        const existing = fontFamilies.get(familyBase);
        const weight = inferWeight(exactName);
        if (!existing.weights.includes(weight)) {
          existing.weights.push(weight);
        }
      } else {
        fontFamilies.set(familyBase, {
          url: fontUrl,
          weights: [inferWeight(exactName)]
        });
      }
      fontAssets[exactName] = {
        family: exactName,
        weights: [inferWeight(exactName)],
        source: "custom",
        url: fontUrl
      };
    }
  }
  for (const [family, data] of fontFamilies) {
    if (!fontAssets[family]) {
      fontAssets[family] = {
        family,
        weights: data.weights.sort((a, b) => a - b),
        source: "custom",
        url: data.url
      };
    }
  }
  const availableFonts = Array.from(/* @__PURE__ */ new Set([...seenBaseNames, ...fontFamilies.keys()])).sort();
  const defaultFontFamily = layout.defaultFont ? layout.defaultFont : availableFonts[0] ?? "Inter";
  return { fontAssets, availableFonts, defaultFontFamily };
}
function extractFamilyBase(name) {
  const weightSuffixes = /[_-](Thin|ExtraLight|UltraLight|Light|Regular|Book|Medium|SemiBold|DemiBold|Bold|ExtraBold|UltraBold|Black|Heavy)$/i;
  const stripped = name.replace(weightSuffixes, "");
  return stripped || name;
}
function inferWeight(name) {
  const lower = name.toLowerCase();
  if (lower.includes("thin")) return 100;
  if (lower.includes("extralight") || lower.includes("ultralight")) return 200;
  if (lower.includes("light")) return 300;
  if (lower.includes("book") || lower.includes("regular")) return 400;
  if (lower.includes("medium")) return 500;
  if (lower.includes("semibold") || lower.includes("demibold")) return 600;
  if (lower.includes("extrabold") || lower.includes("ultrabold")) return 800;
  if (lower.includes("bold")) return 700;
  if (lower.includes("black") || lower.includes("heavy")) return 900;
  return 400;
}

// src/assets/fontMigrator.ts
async function syncFonts(embeddedFonts, apiConfig) {
  const result = {
    fontMap: {},
    uploaded: [],
    skipped: [],
    failed: []
  };
  const uniqueFonts = extractFonts(embeddedFonts);
  if (uniqueFonts.length === 0) {
    return result;
  }
  const existingFonts = await fetchExistingFonts(apiConfig);
  const existingByCode = new Map(existingFonts.map((f) => [f.fontCode, f]));
  for (const font of uniqueFonts) {
    const { baseName, fontCode, originalNames, url } = font;
    if (existingByCode.has(fontCode)) {
      result.skipped.push(baseName);
      for (const oldName of originalNames) {
        result.fontMap[oldName] = fontCode;
      }
      continue;
    }
    try {
      const file = await downloadFont(url, baseName);
      const uploaded = await uploadFont(file, baseName, fontCode, apiConfig);
      result.uploaded.push(baseName);
      for (const oldName of originalNames) {
        result.fontMap[oldName] = uploaded.fontCode;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (isDuplicateError(errorMessage)) {
        result.skipped.push(baseName);
        for (const oldName of originalNames) {
          result.fontMap[oldName] = fontCode;
        }
      } else {
        result.failed.push({ name: baseName, error: errorMessage });
        for (const oldName of originalNames) {
          result.fontMap[oldName] = fontCode;
        }
      }
    }
  }
  return result;
}
function extractFonts(embeddedFonts) {
  const fonts = [];
  const seen = /* @__PURE__ */ new Set();
  for (const font of embeddedFonts) {
    if (typeof font === "string") continue;
    let url;
    let fileName;
    if ("url" in font && font.url) {
      url = font.url;
      fileName = font.fileName;
    } else if ("fontUrl" in font && font.fontUrl) {
      url = font.fontUrl;
      fileName = font.fontName;
    } else {
      continue;
    }
    const originalName = fileName.replace(/\.(ttf|otf|woff2?)$/i, "");
    if (seen.has(originalName)) continue;
    seen.add(originalName);
    const baseName = originalName.replace(/__[a-zA-Z0-9]+__\d+$/, "");
    const namesToMap = [originalName];
    if (baseName !== originalName && !seen.has(baseName)) {
      namesToMap.push(baseName);
      seen.add(baseName);
    }
    fonts.push({
      baseName: originalName,
      fontCode: originalName,
      originalNames: namesToMap,
      url
    });
  }
  return fonts;
}
async function fetchExistingFonts(config) {
  const url = new URL("/v2/font", config.baseUrl);
  url.searchParams.set("select", "fontName fontCode fontFile");
  url.searchParams.set("populatePath", JSON.stringify({ path: "fontFile", select: "url" }));
  const authHeader = config.authToken.startsWith("Bearer ") ? config.authToken : `Bearer ${config.authToken}`;
  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
        Authorization: authHeader
      }
    });
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    return Array.isArray(data) ? data : data.data || [];
  } catch (error) {
    return [];
  }
}
async function downloadFont(url, baseName) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: HTTP ${response.status}`);
  }
  const blob = await response.blob();
  const extension = url.match(/\.(ttf|otf|woff2?)$/i)?.[1] || "ttf";
  const fileName = `${baseName}.${extension}`;
  return new File([blob], fileName, { type: blob.type || "font/ttf" });
}
async function uploadFont(file, fontName, fontCode, config) {
  const url = new URL("/v2/font", config.baseUrl);
  const formData = new FormData();
  formData.append("fontName", fontName);
  formData.append("fontCode", fontCode);
  formData.append("fontFile", file);
  formData.append("allowEveryone", JSON.stringify({ view: true, edit: true }));
  const authHeader = config.authToken.startsWith("Bearer ") ? config.authToken : `Bearer ${config.authToken}`;
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: authHeader
      // Note: Don't set Content-Type for FormData, browser sets it with boundary
    },
    body: formData
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `HTTP ${response.status}`);
  }
  const data = await response.json();
  return { fontCode: data.fontCode || fontCode };
}
function isDuplicateError(message) {
  const dupPatterns = [
    /already exists/i,
    /duplicate/i,
    /unique constraint/i,
    /fontcode.*taken/i,
    /E11000/i
    // MongoDB duplicate key error
  ];
  return dupPatterns.some((pattern) => pattern.test(message));
}

// src/transformers/documentTransformer.ts
function transformDocumentShell(layout, fonts) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const settings = {
    ...DEFAULT_DOCUMENT_SETTINGS,
    typography: {
      ...DEFAULT_DOCUMENT_SETTINGS.typography,
      defaultFontFamily: fonts.defaultFontFamily,
      availableFonts: [
        ...fonts.availableFonts,
        ...DEFAULT_DOCUMENT_SETTINGS.typography.availableFonts
      ]
    }
  };
  const assets = {
    images: {},
    fonts: fonts.fontAssets
  };
  const metadata = {
    figmaSource: null,
    aiGenerated: false,
    custom: {
      prolibuId: layout._id,
      templateType: layout.templateType,
      contentTemplateCode: layout.contentTemplateCode ?? null,
      migratedAt: now
    }
  };
  return {
    version: SCHEMA_VERSION,
    id: generateId(),
    name: layout.contentTemplateName,
    createdAt: now,
    updatedAt: now,
    settings,
    assets,
    metadata
  };
}

// src/converters/cssParser.ts
function parseNodeStyles(styles) {
  if (!styles) {
    return {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      opacity: 1,
      visible: true,
      zIndex: 0,
      heightAuto: false
    };
  }
  const s = {};
  for (const [k, v] of Object.entries(styles)) {
    s[k] = String(v);
  }
  const result = {
    x: parsePx(s.left) ?? 0,
    y: parsePx(s.top) ?? 0,
    width: parsePx(s.width) ?? 100,
    height: parsePx(s.height) ?? 100,
    opacity: s.opacity !== void 0 ? isNaN(parseFloat(s.opacity)) ? 1 : parseFloat(s.opacity) : 1,
    visible: s.display !== "none",
    zIndex: s.zIndex ? isNaN(parseInt(s.zIndex, 10)) ? 0 : parseInt(s.zIndex, 10) : 0,
    heightAuto: s.height === "auto"
  };
  if (s.backgroundColor) {
    result.backgroundColor = s.backgroundColor;
  }
  if (s.backgroundImage && s.backgroundImage !== "none") {
    const urlMatch = s.backgroundImage.match(/url\(["']?(.+?)["']?\)/);
    if (urlMatch) {
      result.backgroundImage = urlMatch[1];
    } else {
      result.backgroundImage = s.backgroundImage;
    }
  }
  const border = parseBorder(s);
  if (border) {
    result.border = border;
  }
  if (s.borderRadius) {
    result.borderRadius = parsePx(s.borderRadius) ?? 0;
  }
  if (s.fontFamily) {
    result.fontFamily = s.fontFamily.replace(/^['"]|['"]$/g, "").replace(/\.(ttf|otf|woff2?)$/i, "").trim();
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
    result.lineHeight = parsePx(s.lineHeight) ?? void 0;
  }
  if (s.minHeight) {
    result.minHeight = parsePx(s.minHeight) ?? void 0;
  }
  return result;
}
function parsePx(value) {
  if (!value || value === "auto" || value === "none") return null;
  const num = parseFloat(value);
  return isNaN(num) ? null : num;
}
function parseBorder(styles) {
  if (styles.border && styles.border !== "none") {
    const match = styles.border.match(/^([\d.]+)px\s+(\w+)\s+(.+)$/);
    if (match) {
      return { width: parseFloat(match[1]), style: match[2], color: match[3] };
    }
  }
  if (styles.borderWidth || styles.borderStyle || styles.borderColor) {
    return {
      width: parsePx(styles.borderWidth) ?? 1,
      style: styles.borderStyle || "solid",
      color: styles.borderColor || "#000000"
    };
  }
  if (styles.borderBottom && styles.borderBottom !== "none") {
    const match = styles.borderBottom.match(/^([\d.]+)px\s+(\w+)\s+(.+)$/);
    if (match) {
      return { width: parseFloat(match[1]), style: match[2], color: match[3] };
    }
  }
  if (styles.borderTop && styles.borderTop !== "none") {
    const match = styles.borderTop.match(/^([\d.]+)px\s+(\w+)\s+(.+)$/);
    if (match) {
      return { width: parseFloat(match[1]), style: match[2], color: match[3] };
    }
  }
  return null;
}
function resolveFontFamily(name, fontMap) {
  const cleanedName = name.replace(/^['"]|['"]$/g, "").replace(/\.(ttf|otf|woff2?)$/i, "").trim();
  if (!fontMap) {
    return cleanedName;
  }
  if (fontMap[cleanedName]) {
    return fontMap[cleanedName];
  }
  return cleanedName;
}

// src/converters/colorParser.ts
var NAMED_COLORS = {
  white: { r: 255, g: 255, b: 255, a: 1 },
  black: { r: 0, g: 0, b: 0, a: 1 },
  red: { r: 255, g: 0, b: 0, a: 1 },
  green: { r: 0, g: 128, b: 0, a: 1 },
  blue: { r: 0, g: 0, b: 255, a: 1 },
  gray: { r: 128, g: 128, b: 128, a: 1 },
  grey: { r: 128, g: 128, b: 128, a: 1 },
  transparent: { r: 0, g: 0, b: 0, a: 0 }
};
function parseColor(cssColor) {
  const trimmed = cssColor.trim().toLowerCase();
  if (NAMED_COLORS[trimmed]) {
    return { ...NAMED_COLORS[trimmed] };
  }
  const rgbMatch = trimmed.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (rgbMatch) {
    return {
      r: clamp(parseInt(rgbMatch[1], 10), 0, 255),
      g: clamp(parseInt(rgbMatch[2], 10), 0, 255),
      b: clamp(parseInt(rgbMatch[3], 10), 0, 255),
      a: 1
    };
  }
  const rgbaMatch = trimmed.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/);
  if (rgbaMatch) {
    return {
      r: clamp(parseInt(rgbaMatch[1], 10), 0, 255),
      g: clamp(parseInt(rgbaMatch[2], 10), 0, 255),
      b: clamp(parseInt(rgbaMatch[3], 10), 0, 255),
      a: clamp(parseFloat(rgbaMatch[4]), 0, 1)
    };
  }
  if (trimmed.startsWith("#")) {
    return parseHex(trimmed);
  }
  console.warn(`\u26A0\uFE0F  Unrecognized color format: "${cssColor}" \u2014 defaulting to black`);
  return { r: 0, g: 0, b: 0, a: 1 };
}
function parseHex(hex) {
  const h = hex.slice(1);
  if (h.length === 3) {
    return {
      r: parseInt(h[0] + h[0], 16),
      g: parseInt(h[1] + h[1], 16),
      b: parseInt(h[2] + h[2], 16),
      a: 1
    };
  }
  if (h.length === 6) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: 1
    };
  }
  if (h.length === 8) {
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
      a: Math.round(parseInt(h.slice(6, 8), 16) / 255 * 100) / 100
    };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

// src/converters/wildcardConverter.ts
function convertWildcards(text) {
  return text.replace(/(?<!\{)\{\{(?!\{)(.*?)\}\}(?!\})/g, "{{{$1}}}");
}

// src/transformers/pageTransformer.ts
function transformPage(frame, index, pageSize = PAGE_SIZES.fixed) {
  const pageId = generateId();
  const rootId = generateId();
  const styles = parseNodeStyles(frame.styles);
  const isPresetPage = frame.type === "presetPage";
  const layoutContentType = detectLayoutContentType(frame);
  const isAutoGrow = styles.heightAuto || styles.minHeight !== void 0;
  let isPlaceholder = false;
  let placeholder;
  let placeholderWildcard;
  if (isPresetPage) {
    isPlaceholder = true;
    if (layoutContentType === "snippets") {
      placeholder = {
        contentType: "snippets",
        rules: { emptyBehavior: "hide" }
      };
      placeholderWildcard = "{{{productSnippets}}}";
    } else {
      placeholder = {
        contentType: "external",
        rules: { emptyBehavior: "hide" }
      };
      placeholderWildcard = "{{{customContent}}}";
    }
  }
  const fills = [];
  if (styles.backgroundColor) {
    const rgba = parseColor(styles.backgroundColor);
    fills.push({ type: "solid", color: rgba, opacity: 1 });
  } else {
    fills.push({ type: "solid", color: { r: 255, g: 255, b: 255, a: 1 }, opacity: 1 });
  }
  let backgroundImage;
  if (styles.backgroundImage) {
    backgroundImage = convertWildcards(styles.backgroundImage);
  }
  const frameWidth = pageSize.width;
  const frameHeight = isAutoGrow ? styles.minHeight ?? pageSize.height : pageSize.height;
  const rootFrame = createFrameNode({
    id: rootId,
    name: frame.name || `Page ${index + 1}`,
    parentId: null,
    width: frameWidth,
    height: frameHeight,
    fills,
    backgroundImage,
    backgroundSize: backgroundImage ? "cover" : void 0,
    autoGrow: isAutoGrow || void 0,
    minHeight: isAutoGrow ? styles.minHeight ?? pageSize.height : void 0,
    clipContent: true
  });
  const extraNodes = {};
  if (placeholderWildcard) {
    const textId = generateId();
    const textNode = createTextNode({
      id: textId,
      name: "Placeholder Content",
      parentId: rootId,
      x: 0,
      y: 0,
      width: frameWidth,
      height: frameHeight,
      content: createRichTextContent(placeholderWildcard),
      htmlContent: `<p>${placeholderWildcard}</p>`,
      characters: placeholderWildcard,
      tiptapState: null,
      textAutoResize: "none"
    });
    extraNodes[textId] = textNode;
    rootFrame.children.push(textId);
  }
  const page = {
    id: pageId,
    name: frame.name || `Page ${index + 1}`,
    rootId,
    orientation: "landscape",
    size: pageSize,
    types: isPlaceholder ? ["marker"] : [],
    isPlaceholder,
    ...placeholder && { placeholder }
  };
  return { page, rootFrame, extraNodes };
}
function detectLayoutContentType(frame) {
  if (!frame.children) return null;
  for (const child of frame.children) {
    if (child.type === "localLayoutContent") {
      const name = child.name?.toLowerCase() || "";
      if (name.includes("layoutproductsnippets")) {
        return "snippets";
      }
      if (name.includes("layoutcontent") || name === "layoutcontent") {
        return "custom";
      }
    }
  }
  return null;
}

// src/transformers/pagePresetResolver.ts
var V1_TO_V2_PRESET_MAP = {
  quotePage: "quote-page",
  quickProposalApprovalPage: "quick-proposal-approval-page",
  accordionPage: "accordion-page"
  // layoutProductSnippets is handled separately as placeholder
};
var KNOWN_PRESET_NAMES = new Set(Object.keys(V1_TO_V2_PRESET_MAP));
var V2_PRESETS = {
  "quote-page": {
    name: "Quote",
    width: 612,
    height: 792,
    orientation: "portrait",
    backgroundColor: { r: 255, g: 255, b: 255, a: 1 },
    pageType: "pricing",
    autoGrow: true,
    minHeight: 792,
    component: {
      pluginId: "com-quote",
      componentName: "Price Quote",
      defaultProps: {
        title: "Price Summary.",
        summary: "",
        hideTitleAndDescription: false,
        repeatHeaders: false,
        showTitleAndDescription: true,
        showDateExpanded: false,
        showGroupExpanded: false,
        showFamilyExpanded: false,
        showLineItemExpanded: false,
        showConsolidated: false,
        showAditionalNotes: false,
        hideSummaryOfDates: false,
        hideSummaryOfGroups: false,
        hideSummaryOfFamilies: false,
        hideSummaryOfTotal: false,
        showPaymentPlan: true,
        columns: [
          {
            label: "Concept",
            cell: "productName",
            width: "110px",
            minWidth: "110px",
            visible: true
          },
          { label: "Qty.", cell: "quantity", width: "25px", minWidth: "25px", visible: true },
          {
            label: "U. Price",
            cell: "netUnitPrice",
            width: "55px",
            minWidth: "55px",
            visible: true
          },
          { label: "Sub Total", cell: "subTotal", width: "55px", minWidth: "55px", visible: true },
          {
            label: "Discount",
            cell: "discountAmount",
            width: "55px",
            minWidth: "55px",
            visible: true
          },
          {
            label: "Taxes",
            cell: "netTotalTaxAmount",
            width: "55px",
            minWidth: "55px",
            visible: true
          },
          { label: "Total", cell: "total", width: "75px", minWidth: "75px", visible: true }
        ],
        paymentPlanColumns: [
          { label: "#", cell: "number", width: 60, minWidth: 60, visible: true, align: "center" },
          {
            label: "Title",
            cell: "title",
            width: 280,
            minWidth: 200,
            visible: true,
            align: "left"
          },
          {
            label: "Payment Date",
            cell: "dueDate",
            width: 120,
            minWidth: 120,
            visible: true,
            align: "center"
          },
          { label: "Total", cell: "total", width: 100, visible: true, align: "right" }
        ]
      },
      x: 32,
      y: 32,
      width: 548,
      height: 728
    }
  },
  "quick-proposal-approval-page": {
    name: "Quick Approval",
    width: 792,
    height: 612,
    orientation: "landscape",
    backgroundColor: { r: 255, g: 255, b: 255, a: 1 },
    pageType: "content",
    component: {
      pluginId: "com-quick-proposal-approval",
      componentName: "Quick Proposal Approval",
      defaultProps: {
        title: "Proposal Approval.",
        descriptionText: null,
        descriptionApproved: null,
        descriptionDenied: null
      },
      x: 40,
      y: 100,
      width: 712,
      height: 472
    }
  },
  "accordion-page": {
    name: "FAQ / Accordion",
    width: 792,
    height: 612,
    orientation: "landscape",
    backgroundColor: { r: 255, g: 255, b: 255, a: 1 },
    pageType: "content",
    autoGrow: true,
    minHeight: 612,
    component: {
      pluginId: "com-accordion",
      componentName: "Accordion",
      defaultProps: {
        rows: [
          {
            title: "Title",
            description: "Description",
            expanded: false,
            blockExpanded: false
          }
        ],
        startExpanded: false
      },
      x: 40,
      y: 40,
      width: 712,
      height: 500
    }
  }
};
function detectPagePreset(frame) {
  const presetChild = frame.children?.find(
    (child) => child.type === "localGroup" && KNOWN_PRESET_NAMES.has(child.name)
  );
  if (!presetChild) {
    return { isPagePreset: false };
  }
  const v2PresetId = V1_TO_V2_PRESET_MAP[presetChild.name];
  const comName = presetChild.name.replace(/Page$/, "");
  const componentKey = `com${comName.charAt(0).toUpperCase()}${comName.slice(1)}`;
  const v1Props = extractComCompConfigProps(presetChild, componentKey);
  return {
    isPagePreset: true,
    v2PresetId,
    presetChild,
    v1Props
  };
}
function extractComCompConfigProps(node, componentKey) {
  for (const child of node.children ?? []) {
    const result = extractComCompConfigProps(child, componentKey);
    if (result) return result;
  }
  if (node.comCompConfig?.[componentKey]) {
    return filterConfigProps(node.comCompConfig[componentKey]);
  }
  return void 0;
}
function filterConfigProps(props) {
  const result = {};
  for (const [key, value] of Object.entries(props)) {
    if (key === "$configs") continue;
    result[key] = value;
  }
  return result;
}
function resolvePagePreset(v2PresetId, v1Props, _pageIndex, pageSize, ctx, v1Styles) {
  const preset = V2_PRESETS[v2PresetId];
  if (!preset) {
    throw new Error(`Unknown V2 preset ID: ${v2PresetId}`);
  }
  const pageId = generateId();
  const rootId = generateId();
  const componentId = generateId();
  const fills = [{ type: "solid", color: preset.backgroundColor, opacity: 1 }];
  const frameWidth = preset.width || pageSize.width;
  const frameHeight = preset.height || pageSize.height;
  const v1Height = v1Styles?.height;
  const v1MinHeight = v1Styles?.minHeight;
  const isAutoGrow = v1Height === "auto" || v1MinHeight !== void 0 || preset.autoGrow;
  const minHeight = v1MinHeight ? parseInt(v1MinHeight, 10) : preset.minHeight;
  const rootFrame = createFrameNode({
    id: rootId,
    name: preset.name,
    parentId: null,
    width: frameWidth,
    height: isAutoGrow ? minHeight ?? frameHeight : frameHeight,
    fills,
    clipContent: true,
    autoGrow: isAutoGrow || void 0,
    minHeight: isAutoGrow ? minHeight ?? frameHeight : void 0
  });
  const mergedProps = {
    ...preset.component.defaultProps,
    ...v1Props ?? {}
  };
  const component = {
    type: "COMPONENT",
    id: componentId,
    name: preset.component.componentName,
    parentId: rootId,
    children: [],
    x: preset.component.x,
    y: preset.component.y,
    width: preset.component.width,
    height: preset.component.height,
    rotation: 0,
    visible: true,
    locked: false,
    opacity: 1,
    constraints: { horizontal: "left", vertical: "top" },
    blendMode: "normal",
    pluginData: {},
    pluginId: preset.component.pluginId,
    componentName: preset.component.componentName,
    props: mergedProps,
    pluginVersion: "1.0.0",
    fallbackRender: "placeholder"
  };
  rootFrame.children = [componentId];
  const page = {
    id: pageId,
    name: preset.name,
    rootId,
    orientation: preset.orientation,
    size: pageSize,
    types: [],
    isPlaceholder: false
  };
  ctx.stats.componentNodes++;
  ctx.stats.pages++;
  ctx.warnings.push(
    `PagePresetResolved: Using V2 "${v2PresetId}" preset structure (V1 props merged)`
  );
  return {
    page,
    rootFrame,
    nodes: {
      [rootId]: rootFrame,
      [componentId]: component
    }
  };
}
var MARKER_PRESETS = {
  "snippets-placeholder": {
    name: "Product Snippets",
    width: 792,
    height: 80,
    orientation: "landscape",
    backgroundColor: { r: 26, g: 26, b: 26, a: 1 },
    // #1a1a1a
    pageType: "marker",
    markerText: "{{{productSnippets}}}"
  },
  "custom-content": {
    name: "Custom Content",
    width: 792,
    height: 80,
    orientation: "landscape",
    backgroundColor: { r: 26, g: 26, b: 26, a: 1 },
    // #1a1a1a
    pageType: "marker",
    markerText: "{{{customContent}}}"
  }
};
function detectMarkerPreset(frame) {
  if (!frame.children) {
    return { isMarkerPreset: false };
  }
  for (const child of frame.children) {
    if (child.type === "localLayoutContent") {
      const name = child.name?.toLowerCase() || "";
      if (name.includes("layoutproductsnippets")) {
        return {
          isMarkerPreset: true,
          markerPresetId: "snippets-placeholder"
        };
      }
      if (name.includes("layoutcontent") || name === "layoutcontent") {
        return {
          isMarkerPreset: true,
          markerPresetId: "custom-content"
        };
      }
    }
  }
  return { isMarkerPreset: false };
}
function resolveMarkerPreset(markerPresetId, _pageIndex, pageSize, ctx) {
  const preset = MARKER_PRESETS[markerPresetId];
  const pageId = generateId();
  const rootId = generateId();
  const textId = generateId();
  const fills = [{ type: "solid", color: preset.backgroundColor, opacity: 1 }];
  const rootFrame = createFrameNode({
    id: rootId,
    name: preset.name,
    parentId: null,
    width: preset.width,
    height: preset.height,
    fills,
    clipContent: true
  });
  const textNode = createTextNode({
    id: textId,
    name: preset.markerText,
    parentId: rootId,
    x: 0,
    y: 0,
    width: preset.width,
    height: preset.height,
    content: createRichTextContent(preset.markerText),
    htmlContent: `<p>${preset.markerText}</p>`,
    characters: preset.markerText,
    tiptapState: null,
    textAutoResize: "none",
    fills: [{ type: "solid", color: { r: 255, g: 255, b: 255, a: 1 }, opacity: 1 }]
  });
  rootFrame.children = [textId];
  const placeholderConfig = markerPresetId === "snippets-placeholder" ? { contentType: "snippets", rules: { emptyBehavior: "hide" } } : { contentType: "external", rules: { emptyBehavior: "hide" } };
  const page = {
    id: pageId,
    name: preset.name,
    rootId,
    orientation: preset.orientation,
    size: pageSize,
    types: ["marker"],
    isPlaceholder: true,
    placeholder: placeholderConfig
  };
  ctx.stats.pages++;
  ctx.stats.textNodes++;
  ctx.warnings.push(
    `MarkerPresetResolved: Using V2 "${markerPresetId}" preset for placeholder page`
  );
  return {
    page,
    rootFrame,
    nodes: {
      [rootId]: rootFrame,
      [textId]: textNode
    }
  };
}

// src/converters/quillToTiptapHtml.ts
function quillToTiptapHtml(html, fontMap) {
  if (!html) return "";
  let result = html.replace(
    /<(\w+)(\s[^>]*)?\/?>/g,
    (fullMatch, tagName, attrsRaw) => {
      if (!attrsRaw) return fullMatch;
      const isSelfClosing = fullMatch.endsWith("/>");
      let classes = extractAttr(attrsRaw, "class") ?? "";
      let style = extractAttr(attrsRaw, "style") ?? "";
      const otherAttrs = attrsRaw.replace(/\s*class="[^"]*"/g, "").replace(/\s*style="[^"]*"/g, "").replace(/\s*contenteditable="[^"]*"/g, "").trim();
      const alignMatch = classes.match(/\bql-align-(justify|center|right|left)\b/);
      if (alignMatch) {
        style = mergeStyles(style, `text-align: ${alignMatch[1]}`);
      }
      const fontMatch = classes.match(/\bql-font-(\S+)/);
      if (fontMatch) {
        style = mergeStyles(style, `font-family: ${resolveFontFamily(fontMatch[1], fontMap)}`);
      }
      classes = classes.replace(/\bql-align-\w+\b/g, "").replace(/\bql-font-\S+/g, "").replace(/\bpr-wildcard\b/g, "").replace(/\s+/g, " ").trim();
      let newAttrs = "";
      if (otherAttrs) newAttrs += " " + otherAttrs;
      if (classes) newAttrs += ` class="${classes}"`;
      if (style) newAttrs += ` style="${style}"`;
      return `<${tagName}${newAttrs}${isSelfClosing ? " /" : ""}>`;
    }
  );
  result = result.replace(/\s*class=""/g, "");
  result = result.replace(/\s*class="\s*"/g, "");
  return result;
}
function extractAttr(attrs, name) {
  const re = new RegExp(`\\s*${name}="([^"]*)"`);
  const m = attrs.match(re);
  return m ? m[1] : null;
}
function mergeStyles(existing, newStyle) {
  if (!existing) return newStyle;
  if (!newStyle) return existing;
  const styles = /* @__PURE__ */ new Map();
  for (const decl of existing.split(";")) {
    const [prop, ...vals] = decl.split(":");
    if (prop?.trim() && vals.length) {
      styles.set(prop.trim(), vals.join(":").trim());
    }
  }
  for (const decl of newStyle.split(";")) {
    const [prop, ...vals] = decl.split(":");
    if (prop?.trim() && vals.length) {
      styles.set(prop.trim(), vals.join(":").trim());
    }
  }
  return Array.from(styles.entries()).map(([prop, val]) => `${prop}: ${val}`).join("; ");
}

// src/transformers/textTransformer.ts
function transformText(node, parentId, ctx) {
  ctx.stats.textNodes++;
  const styles = parseNodeStyles(node.styles);
  let htmlContent = node.content ?? node.value ?? "";
  htmlContent = quillToTiptapHtml(htmlContent, ctx.fontMap);
  htmlContent = convertWildcards(htmlContent);
  const characters = stripHtmlTags(htmlContent);
  const content = createRichTextContent(characters);
  const fills = [];
  if (styles.color) {
    const rgba = parseColor(styles.color);
    fills.push({ type: "solid", color: rgba, opacity: 1 });
  }
  const textAlign = extractTextAlign(htmlContent);
  const fontFamily = styles.fontFamily ? resolveFontFamily(styles.fontFamily, ctx.fontMap) : "inherit";
  return createTextNode({
    id: generateId(),
    name: node.name || "Text",
    parentId,
    x: styles.x,
    y: styles.y,
    width: styles.width,
    height: styles.height,
    visible: styles.visible,
    opacity: styles.opacity,
    content,
    tiptapState: null,
    // Editor regenerates on open
    htmlContent,
    characters,
    fontFamily,
    fontSize: styles.fontSize ?? 16,
    fontWeight: styles.fontWeight ?? 400,
    lineHeight: styles.lineHeight ? { value: styles.lineHeight, unit: "px" } : { value: 1.5, unit: "auto" },
    textAlign,
    ...fills.length > 0 ? { fills } : {},
    textAutoResize: "none"
  });
}
function stripHtmlTags(html) {
  return html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>\s*<p[^>]*>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}
function extractTextAlign(html) {
  if (html.includes("text-align: justify")) return "justify";
  if (html.includes("text-align: center")) return "center";
  if (html.includes("text-align: right")) return "right";
  return "left";
}

// src/transformers/rectangleTransformer.ts
function transformRectangle(node, parentId, ctx) {
  const styles = parseNodeStyles(node.styles);
  const bgImage = styles.backgroundImage;
  if (bgImage && hasValidImageUrl(bgImage)) {
    ctx.stats.imageNodes++;
    const imageUrl = convertWildcards(bgImage);
    return createImageNode(node, parentId, styles, imageUrl);
  }
  ctx.stats.rectangleNodes++;
  return createRect(node, parentId, styles);
}
function createImageNode(node, parentId, styles, imageUrl) {
  return {
    type: "IMAGE",
    id: generateId(),
    name: node.name || "Image",
    parentId,
    children: [],
    x: styles.x,
    y: styles.y,
    width: styles.width,
    height: styles.height,
    rotation: 0,
    visible: styles.visible,
    locked: false,
    opacity: styles.opacity,
    constraints: { horizontal: "left", vertical: "top" },
    blendMode: "normal",
    pluginData: {},
    imageRef: imageUrl,
    scaleMode: "fill",
    imageTransform: { scale: 1, offsetX: 0, offsetY: 0 },
    cornerRadius: styles.borderRadius ?? 0,
    strokes: buildStrokes(styles),
    effects: []
  };
}
function createRect(node, parentId, styles) {
  return createRectangleNode({
    id: generateId(),
    name: node.name || "Rectangle",
    parentId,
    x: styles.x,
    y: styles.y,
    width: styles.width,
    height: styles.height,
    visible: styles.visible,
    opacity: styles.opacity,
    fills: buildFills(styles),
    strokes: buildStrokes(styles),
    cornerRadius: styles.borderRadius ?? 0
  });
}
function buildFills(styles) {
  if (styles.backgroundColor) {
    const rgba = parseColor(styles.backgroundColor);
    return [{ type: "solid", color: rgba, opacity: 1 }];
  }
  return [];
}
function buildStrokes(styles) {
  if (styles.border) {
    const color = parseColor(styles.border.color);
    return [
      {
        color,
        weight: styles.border.width,
        style: styles.border.style === "dashed" ? "dashed" : styles.border.style === "dotted" ? "dotted" : "solid"
      }
    ];
  }
  return [];
}
function hasValidImageUrl(url) {
  if (!url) return false;
  if (url === "none") return false;
  if (/\{\{.*?\}\}/.test(url)) return true;
  return url.startsWith("http://") || url.startsWith("https://") || url.startsWith("//") || url.startsWith("data:image/");
}

// src/transformers/componentTransformer.ts
var PLUGIN_MAP = {
  comProposalHeader: { pluginId: "com-proposal-header", componentName: "Proposal Header" },
  comAgent: { pluginId: "com-agent", componentName: "Agent Info" },
  comQuote: { pluginId: "com-quote", componentName: "Price Quote" },
  comQuickProposalApproval: {
    pluginId: "com-quick-proposal-approval",
    componentName: "Quick Approval"
  },
  comRate: { pluginId: "com-rate", componentName: "Rating" },
  comAccordion: { pluginId: "com-accordion", componentName: "Accordion" },
  comPaymentPlan: { pluginId: "com-payment-plan", componentName: "Payment Plan" },
  comAttachment: { pluginId: "com-attachment", componentName: "Attachment" },
  // Render-only (not editable in canvas, but rendered by doc-render)
  comAvatar: { pluginId: "com-avatar", componentName: "Avatar" },
  comSign: { pluginId: "com-sign", componentName: "Signature" },
  comAgreementSignature: {
    pluginId: "com-agreement-signature",
    componentName: "Agreement Signature"
  }
};
var RENDER_ONLY_COMPONENTS = /* @__PURE__ */ new Set(["comAvatar", "comSign", "comAgreementSignature"]);
function transformComponent(groupNode, parentId, ctx) {
  const styles = parseNodeStyles(groupNode.styles);
  const { localCom, configNode } = findLocalComRecursive(groupNode);
  if (!localCom) {
    ctx.warnings.push(`MissingLocalCom: localGroup "${groupNode.name}" has no localCom descendant`);
    ctx.stats.frameNodes++;
    return [createWrapper(groupNode, parentId, styles)];
  }
  const comName = localCom.name.replace(/^--/, "");
  const pluginInfo = PLUGIN_MAP[comName];
  if (!pluginInfo) {
    ctx.warnings.push(
      `UnknownComponent: "${comName}" from localCom "${localCom.name}" has no known plugin mapping`
    );
    return createFallbackComponent(groupNode, comName, parentId, styles, ctx);
  }
  if (RENDER_ONLY_COMPONENTS.has(comName)) {
    ctx.warnings.push(
      `RenderOnlyComponent: "${comName}" is not editable in canvas but will render in export`
    );
  }
  const comCompConfig = configNode?.comCompConfig ?? groupNode.comCompConfig ?? {};
  const props = comCompConfig[comName] ?? {};
  const cleanProps = filterProps(props);
  const componentId = generateId();
  const component = {
    type: "COMPONENT",
    id: componentId,
    name: pluginInfo.componentName,
    parentId,
    children: [],
    x: styles.x,
    y: styles.y,
    width: styles.width,
    height: styles.height,
    rotation: 0,
    visible: styles.visible,
    locked: false,
    opacity: styles.opacity,
    constraints: { horizontal: "left", vertical: "top" },
    blendMode: "normal",
    pluginData: {},
    pluginId: pluginInfo.pluginId,
    componentName: pluginInfo.componentName,
    props: cleanProps,
    pluginVersion: "1.0.0",
    fallbackRender: "placeholder"
  };
  ctx.stats.componentNodes++;
  return [component];
}
function createWrapper(node, parentId, styles) {
  return createFrameNode({
    id: generateId(),
    name: node.name || "Component Wrapper",
    parentId,
    x: styles.x,
    y: styles.y,
    width: styles.width,
    height: styles.height,
    visible: styles.visible,
    opacity: styles.opacity,
    fills: [],
    clipContent: false
  });
}
function createFallbackComponent(groupNode, comName, parentId, styles, ctx) {
  const pluginId = comName.replace(/([A-Z])/g, "-$1").toLowerCase().replace(/^-/, "");
  const componentId = generateId();
  const component = {
    type: "COMPONENT",
    id: componentId,
    name: comName,
    parentId,
    children: [],
    x: styles.x,
    y: styles.y,
    width: styles.width,
    height: styles.height,
    rotation: 0,
    visible: styles.visible,
    locked: false,
    opacity: styles.opacity,
    constraints: { horizontal: "left", vertical: "top" },
    blendMode: "normal",
    pluginData: {},
    pluginId,
    componentName: comName,
    props: filterProps(groupNode.comCompConfig?.[comName] ?? {}),
    pluginVersion: "1.0.0",
    fallbackRender: "placeholder"
  };
  ctx.stats.componentNodes++;
  return [component];
}
function filterProps(props) {
  const result = {};
  for (const [key, value] of Object.entries(props)) {
    if (key === "$configs") continue;
    result[key] = value;
  }
  return result;
}
function findLocalComRecursive(node, configAncestor) {
  const currentConfig = node.comCompConfig ? node : configAncestor;
  const directCom = node.children?.find((c) => c.type === "localCom");
  if (directCom) {
    return { localCom: directCom, configNode: currentConfig ?? null };
  }
  for (const child of node.children ?? []) {
    if (child.type === "localGroup") {
      const result = findLocalComRecursive(child, currentConfig);
      if (result.localCom) {
        return result;
      }
    }
  }
  return { localCom: null, configNode: null };
}

// src/transformers/lineTransformer.ts
function transformLine(node, parentId, ctx) {
  ctx.stats.lineNodes++;
  const styles = parseNodeStyles(node.styles);
  const strokes = [];
  if (styles.border) {
    const color = parseColor(styles.border.color);
    strokes.push({
      color,
      weight: styles.border.width,
      style: styles.border.style === "dashed" ? "dashed" : styles.border.style === "dotted" ? "dotted" : "solid"
    });
  } else {
    strokes.push({
      color: { r: 0, g: 0, b: 0, a: 1 },
      weight: 1,
      style: "solid"
    });
  }
  return {
    type: "LINE",
    id: generateId(),
    name: node.name || "Line",
    parentId,
    children: [],
    x: styles.x,
    y: styles.y,
    width: styles.width,
    height: styles.height,
    rotation: 0,
    visible: styles.visible,
    locked: false,
    opacity: styles.opacity,
    constraints: { horizontal: "left", vertical: "top" },
    blendMode: "normal",
    pluginData: {},
    strokes,
    strokeWeight: strokes[0]?.weight ?? 1,
    startPoint: { x: 0, y: 0 },
    endPoint: { x: styles.width, y: 0 }
    // Horizontal line
  };
}

// src/transformers/nodeRouter.ts
function createEmptyStats() {
  return {
    totalSourceNodes: 0,
    migratedNodes: 0,
    skippedNodes: 0,
    pages: 0,
    textNodes: 0,
    componentNodes: 0,
    imageNodes: 0,
    rectangleNodes: 0,
    lineNodes: 0,
    frameNodes: 0
  };
}
function routeNode(prolibuNode, parentId, ctx) {
  ctx.stats.totalSourceNodes++;
  switch (prolibuNode.type) {
    case "localText":
      ctx.stats.migratedNodes++;
      return [transformText(prolibuNode, parentId, ctx)];
    case "localRectangle":
      ctx.stats.migratedNodes++;
      return [transformRectangle(prolibuNode, parentId, ctx)];
    case "localGroup":
      ctx.stats.migratedNodes++;
      return transformComponent(prolibuNode, parentId, ctx);
    case "localCom":
      ctx.stats.skippedNodes++;
      return [];
    case "localLineHorizontal":
      ctx.stats.migratedNodes++;
      return [transformLine(prolibuNode, parentId, ctx)];
    case "localLayoutContent":
      ctx.stats.skippedNodes++;
      return [];
    default:
      ctx.warnings.push(
        `UnknownNodeType: "${prolibuNode.type}" (name: "${prolibuNode.name}") \u2014 skipped`
      );
      ctx.stats.skippedNodes++;
      return [];
  }
}

// src/pipeline/migrationPipeline.ts
async function migrate(id, options) {
  let layout;
  if (options.layout) {
    layout = options.layout;
  } else if (options.config) {
    layout = await fetchContentTemplate(id, options.config);
  } else {
    throw new Error("Either config or layout must be provided");
  }
  let fontSyncResult;
  if (options.fontApiConfig && layout.embeddedFonts && layout.embeddedFonts.length > 0) {
    fontSyncResult = await syncFonts(layout.embeddedFonts, options.fontApiConfig);
  }
  const result = migrateFromLayout(layout, options.pageSize, fontSyncResult?.fontMap);
  return {
    ...result,
    fontSync: fontSyncResult
  };
}
function migrateFromLayout(layout, pageSize = PAGE_SIZES.fixed, fontMap) {
  const fonts = resolveFonts(layout);
  const docShell = transformDocumentShell(layout, fonts);
  if (fontMap && docShell.settings.typography.defaultFontFamily) {
    const resolvedDefault = resolveFontFamily(
      docShell.settings.typography.defaultFontFamily,
      fontMap
    );
    docShell.settings.typography.defaultFontFamily = resolvedDefault;
  }
  const warnings = [];
  const stats = createEmptyStats();
  const ctx = {
    warnings,
    stats,
    fonts,
    wildcardConverter: convertWildcards,
    fontMap
  };
  const pages = [];
  const nodes = {};
  if (layout.pages.length === 0) {
    throw new Error("Layout has no pages \u2014 nothing to migrate.");
  }
  const sourceFrames = layout.pages[0]?.children ?? [];
  for (let i = 0; i < sourceFrames.length; i++) {
    const frame = sourceFrames[i];
    const presetDetection = detectPagePreset(frame);
    if (presetDetection.isPagePreset && presetDetection.v2PresetId) {
      const resolved = resolvePagePreset(
        presetDetection.v2PresetId,
        presetDetection.v1Props,
        i,
        pageSize,
        ctx,
        frame.styles
      );
      for (const [nodeId, node] of Object.entries(resolved.nodes)) {
        nodes[nodeId] = node;
      }
      pages.push(resolved.page);
      continue;
    }
    const markerDetection = detectMarkerPreset(frame);
    if (markerDetection.isMarkerPreset && markerDetection.markerPresetId) {
      const resolved = resolveMarkerPreset(markerDetection.markerPresetId, i, pageSize, ctx);
      for (const [nodeId, node] of Object.entries(resolved.nodes)) {
        nodes[nodeId] = node;
      }
      pages.push(resolved.page);
      continue;
    }
    stats.pages++;
    const { page, rootFrame, extraNodes } = transformPage(frame, i, pageSize);
    nodes[rootFrame.id] = rootFrame;
    for (const [nodeId, node] of Object.entries(extraNodes)) {
      nodes[nodeId] = node;
    }
    const childNodes = frame.children ?? [];
    for (const childNode of childNodes) {
      if (childNode.type === "localLayoutContent") {
        ctx.stats.totalSourceNodes++;
        ctx.stats.skippedNodes++;
        continue;
      }
      const transformedNodes = routeNode(childNode, rootFrame.id, ctx);
      for (const tNode of transformedNodes) {
        nodes[tNode.id] = tNode;
        if (tNode.parentId === rootFrame.id) {
          rootFrame.children.push(tNode.id);
        }
      }
    }
    pages.push(page);
  }
  const document = {
    ...docShell,
    pages,
    nodes
  };
  const validation = validateDocument(document);
  if (validation.warnings.length > 0) {
    for (const w of validation.warnings) {
      warnings.push(`Validation: ${w.message} (${w.path})`);
    }
  }
  return {
    document,
    validation,
    warnings,
    stats
  };
}

// src/config/envLoader.ts
import { readFile } from "fs/promises";
import { resolve } from "path";
import { existsSync, readdirSync } from "fs";
var DOMAIN_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/;
async function loadDomainEnv(domain) {
  if (!DOMAIN_PATTERN.test(domain)) {
    throw new Error(
      `Invalid domain name: "${domain}". Only alphanumeric characters, hyphens, and underscores are allowed.`
    );
  }
  const filename = `.${domain}.env`;
  const filePath = resolve(import.meta.dirname ?? process.cwd(), "..", "..", filename);
  if (!existsSync(filePath)) {
    const cwdPath = resolve(process.cwd(), filename);
    if (!existsSync(cwdPath)) {
      throw new Error(
        `Env file not found: "${filename}"
  Looked in:
    - ${filePath}
    - ${cwdPath}

  Create it with:
    PROLIBU_API_URL=https://${domain}.prolibu.com/api
    PROLIBU_AUTH_TOKEN=Bearer eyJ...`
      );
    }
    return parseEnvFile(cwdPath);
  }
  return parseEnvFile(filePath);
}
async function parseEnvFile(filePath) {
  const content = await readFile(filePath, "utf-8");
  const config = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    }
    config[key] = value;
  }
  return config;
}
function listAvailableDomains(dir) {
  for (const searchDir of [dir, process.cwd()]) {
    try {
      const files = readdirSync(searchDir);
      const domains = files.filter(
        (f) => f.startsWith(".") && f.endsWith(".env") && f !== ".env" && !f.endsWith(".example")
      ).map((f) => f.slice(1, -4));
      if (domains.length > 0) return domains;
    } catch {
    }
  }
  return [];
}

// src/cli/interactive.ts
import { resolve as resolve2 } from "path";

// src/cli/prompts.ts
import { stdin, stdout } from "process";
import * as readline from "readline";
var ESC = "\x1B[";
var CLEAR_LINE = `${ESC}2K`;
var CURSOR_UP = (n) => `${ESC}${n}A`;
var CURSOR_HIDE = `${ESC}?25l`;
var CURSOR_SHOW = `${ESC}?25h`;
var DIM = `${ESC}2m`;
var RESET = `${ESC}0m`;
var CYAN = `${ESC}36m`;
var GREEN = `${ESC}32m`;
var BOLD = `${ESC}1m`;
function select(options) {
  const { message, choices, defaultIndex = 0 } = options;
  return new Promise((resolve4, reject) => {
    if (choices.length === 0) {
      reject(new Error("No choices provided"));
      return;
    }
    let cursor = Math.min(defaultIndex, choices.length - 1);
    let rendered = false;
    const render = () => {
      if (rendered) {
        stdout.write(CURSOR_UP(choices.length));
      }
      for (let i = 0; i < choices.length; i++) {
        const choice = choices[i];
        const isActive = i === cursor;
        const pointer = isActive ? `${CYAN}\u276F${RESET}` : " ";
        const label = isActive ? `${BOLD}${choice.label}${RESET}` : `${DIM}${choice.label}${RESET}`;
        const desc = choice.description ? `  ${DIM}${choice.description}${RESET}` : "";
        stdout.write(`${CLEAR_LINE}  ${pointer} ${label}${desc}
`);
      }
      rendered = true;
    };
    stdout.write(
      `  ${GREEN}?${RESET} ${BOLD}${message}${RESET} ${DIM}(\u2191\u2193 to select, Enter to confirm)${RESET}
`
    );
    stdout.write(CURSOR_HIDE);
    render();
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    stdin.resume();
    const onKeypress = (data) => {
      const key = data.toString();
      if (key === "\x1B[A" || key === "k") {
        cursor = cursor > 0 ? cursor - 1 : choices.length - 1;
        render();
        return;
      }
      if (key === "\x1B[B" || key === "j") {
        cursor = cursor < choices.length - 1 ? cursor + 1 : 0;
        render();
        return;
      }
      if (key === "\r" || key === "\n") {
        cleanup();
        stdout.write(CURSOR_UP(choices.length));
        for (let i = 0; i < choices.length; i++) {
          stdout.write(`${CLEAR_LINE}
`);
        }
        stdout.write(CURSOR_UP(choices.length + 1));
        stdout.write(
          `${CLEAR_LINE}  ${GREEN}\u2714${RESET} ${BOLD}${message}${RESET} ${CYAN}${choices[cursor].label}${RESET}
`
        );
        resolve4(choices[cursor].value);
        return;
      }
      if (key === "") {
        cleanup();
        stdout.write("\n");
        process.exit(0);
      }
      if (key === "\x1B" || key === "q") {
        cleanup();
        stdout.write("\n  Cancelled.\n");
        process.exit(0);
      }
    };
    const cleanup = () => {
      stdin.removeListener("data", onKeypress);
      if (stdin.isTTY) {
        stdin.setRawMode(false);
      }
      stdin.pause();
      stdout.write(CURSOR_SHOW);
    };
    stdin.on("data", onKeypress);
  });
}
function confirm(options) {
  const { message, defaultValue = true } = options;
  const hint = defaultValue ? "Y/n" : "y/N";
  return new Promise((resolve4) => {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    rl.question(
      `  ${GREEN}?${RESET} ${BOLD}${message}${RESET} ${DIM}(${hint})${RESET} `,
      (answer) => {
        rl.close();
        const trimmed = answer.trim().toLowerCase();
        if (trimmed === "") {
          resolve4(defaultValue);
        } else {
          resolve4(trimmed === "y" || trimmed === "yes");
        }
      }
    );
  });
}
function textInput(options) {
  const { message, placeholder, defaultValue, required = false } = options;
  const hint = defaultValue ? `${DIM}(${defaultValue})${RESET} ` : placeholder ? `${DIM}(${placeholder})${RESET} ` : "";
  return new Promise((resolve4, reject) => {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    rl.question(`  ${GREEN}?${RESET} ${BOLD}${message}${RESET} ${hint}`, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      if (!trimmed && defaultValue) {
        resolve4(defaultValue);
        return;
      }
      if (required && !trimmed) {
        reject(new Error(`${message} is required.`));
        return;
      }
      resolve4(trimmed);
    });
  });
}

// src/cli/interactive.ts
async function runInteractivePrompt() {
  console.log("\n\u{1F680} Layout Migrator \u2014 Interactive Mode\n");
  const mode = await select({
    message: "What do you want to do?",
    choices: [
      { label: "Migrate within the same account", value: "migrate" },
      { label: "Transfer from one account to another", value: "transfer" }
    ]
  });
  const isTransfer = mode === "transfer";
  const projectRoot = resolve2(import.meta.dirname ?? process.cwd(), "..", "..");
  const domains = listAvailableDomains(projectRoot);
  const sourceLabel = isTransfer ? "Source domain" : "Domain";
  const domain = await pickDomain(domains, sourceLabel);
  let toDomain;
  if (isTransfer) {
    toDomain = await pickDomain(domains, "Destination domain");
    if (toDomain === domain) {
      console.log(
        "  \u26A0\uFE0F  Source and destination are the same \u2014 will create a copy in the same account.\n"
      );
    }
  }
  const templateId = await textInput({
    message: "contentTemplateCode to migrate",
    defaultValue: "main-layout"
  });
  const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  console.log("\n  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500");
  if (toDomain) {
    console.log(`  From:        ${domain}`);
    console.log(`  To:          ${toDomain}`);
  } else {
    console.log(`  Domain:      ${domain}`);
  }
  console.log(`  Code:        ${templateId}`);
  console.log(`  Name:        <original> [migrated ${today}]`);
  console.log("  \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n");
  const proceed = await confirm({ message: "Proceed?", defaultValue: true });
  if (!proceed) {
    console.log("\n  Cancelled.\n");
    process.exit(0);
  }
  return {
    domain,
    toDomain,
    templateId,
    name: void 0,
    templateType: "layout",
    verbose: true,
    dryRun: false,
    saveJson: false
  };
}
async function pickDomain(domains, label) {
  if (domains.length > 0) {
    const choices = [
      ...domains.map((d) => ({ label: d, value: d })),
      { label: "Enter a custom domain\u2026", value: "__custom__" }
    ];
    const picked = await select({ message: label, choices });
    if (picked === "__custom__") {
      return textInput({ message: "Domain name", placeholder: "e.g. redrenault", required: true });
    }
    return picked;
  }
  console.log("  No .{domain}.env files found.");
  console.log("  Create one like:  .redrenault.env  with PROLIBU_API_URL and PROLIBU_AUTH_TOKEN\n");
  return textInput({ message: label, placeholder: "e.g. redrenault", required: true });
}

// src/index.ts
var program = new Command();
program.name("layout-migrator").description("Migrate Prolibu v1 content templates to Design Studio v2 format").version("0.1.0");
program.command("migrate").description("Migrate a content template by ID and upload it as a new template (same account)").option("--id <code>", "contentTemplateCode of the template", "main-layout").option("--domain <domain>", "Load config from .<domain>.env file (e.g. --domain redrenault)").option("--api-url <url>", "Prolibu API base URL (overrides env file)").option("--token <token>", "Auth token (overrides env file)").option("--name <name>", 'Name for the new template (default: original name + " [migrated]")').option("--type <type>", "Template type: layout | content | snippet", "layout").option("--save-json [path]", "Also save JSON locally (optional path, default: ./output/)").option("--json-only", "Only save JSON locally, do NOT upload to Prolibu", false).option("--dry-run", "Validate only \u2014 no upload, no file write", false).option("--no-sync-fonts", "Disable automatic font synchronization (enabled by default)").option("--verbose", "Show warnings and stats", false).action(handleMigrate);
program.command("transfer").description("Migrate a template from one Prolibu account to another").option("--id <code>", "contentTemplateCode from the source account", "main-layout").requiredOption("--from <domain>", "Source domain (reads from .<domain>.env)").requiredOption("--to <domain>", "Destination domain (reads from .<domain>.env)").option("--name <name>", 'Name for the new template (default: original name + " [migrated]")').option("--type <type>", "Template type: layout | content | snippet", "layout").option("--save-json [path]", "Also save JSON locally").option("--dry-run", "Validate only \u2014 no upload, no file write", false).option("--no-sync-fonts", "Disable automatic font synchronization (enabled by default)").option("--verbose", "Show warnings and stats", false).action(handleTransfer);
program.command("run").description("Interactive migration \u2014 prompts for domain, template ID, and options").action(runInteractiveFlow);
program.action(runInteractiveFlow);
async function runInteractiveFlow() {
  const answers = await runInteractivePrompt();
  if (answers.toDomain) {
    await handleTransfer({
      id: answers.templateId,
      from: answers.domain,
      to: answers.toDomain,
      name: answers.name,
      type: answers.templateType,
      saveJson: answers.saveJson ? answers.outputPath ?? true : void 0,
      dryRun: answers.dryRun,
      syncFonts: true,
      // Always sync fonts in interactive mode
      verbose: answers.verbose
    });
  } else {
    await handleMigrate({
      id: answers.templateId,
      domain: answers.domain,
      name: answers.name,
      type: answers.templateType,
      saveJson: answers.saveJson ? answers.outputPath ?? true : void 0,
      jsonOnly: false,
      dryRun: answers.dryRun,
      syncFonts: true,
      // Always sync fonts in interactive mode
      verbose: answers.verbose
    });
  }
}
async function handleMigrate(opts) {
  const { id, domain, verbose } = opts;
  let envApiUrl;
  let envToken;
  if (domain) {
    try {
      const env = await loadDomainEnv(domain);
      envApiUrl = env.PROLIBU_API_URL;
      envToken = env.PROLIBU_AUTH_TOKEN;
      console.log(`\u{1F4C2} Loaded config from .${domain}.env`);
    } catch (error) {
      console.error(`\u274C ${error instanceof Error ? error.message : String(error)}`);
      process.exit(1);
    }
  }
  const apiUrl = opts.apiUrl ?? envApiUrl ?? process.env.PROLIBU_API_URL;
  if (!apiUrl) {
    console.error(
      "\u274C API URL required. Use --domain <name>, --api-url <url>, or set PROLIBU_API_URL env var."
    );
    process.exit(1);
  }
  const token = opts.token ?? envToken ?? process.env.PROLIBU_AUTH_TOKEN;
  if (!token) {
    console.error(
      "\u274C Auth token required. Use --token, --domain <name>, or set PROLIBU_AUTH_TOKEN env var."
    );
    process.exit(1);
  }
  const config = {
    baseUrl: apiUrl,
    authToken: token.startsWith("Bearer ") ? token : `Bearer ${token}`
  };
  console.log(`\u{1F504} Migrating contentTemplateCode: ${id}`);
  console.log(`   API: ${apiUrl}`);
  try {
    const fontApiConfig = opts.syncFonts ? {
      baseUrl: apiUrl,
      authToken: token.startsWith("Bearer ") ? token : `Bearer ${token}`
    } : void 0;
    const result = await migrate(id, { config, fontApiConfig });
    printStats(result.stats);
    printWarnings(result.warnings);
    printValidation(result.validation, verbose);
    if (opts.dryRun) {
      console.log("\n\u{1F50D} Dry run \u2014 no upload, no file written");
      if (!result.validation.valid) process.exit(2);
      return;
    }
    if (opts.saveJson || opts.jsonOnly) {
      const jsonPath = typeof opts.saveJson === "string" ? resolve3(opts.saveJson) : resolve3("output", `${sanitizeFilename(result.document.name)}.json`);
      await mkdir(dirname(jsonPath), { recursive: true });
      await writeFile(jsonPath, JSON.stringify(result.document, null, 2), "utf-8");
      console.log(`
\u{1F4C1} JSON saved to: ${jsonPath}`);
    }
    if (!opts.jsonOnly) {
      console.log("\n\u{1F4E4} Uploading to Prolibu as new template...");
      const created = await createContentTemplate(result.document, config, {
        name: opts.name,
        templateType: opts.type
      });
      console.log(
        `\u2705 Created: ${created.contentTemplateName ?? opts.name ?? result.document.name}`
      );
      console.log(`   ID: ${created._id}`);
      console.log(
        `   URL: ${apiUrl.replace("/api", "")}/ui/spa/suite/contentTemplates/edit/${created._id}`
      );
      console.log(`   Debug: http://localhost:3000/?id=${created._id}`);
    }
    if (!result.validation.valid) {
      process.exit(2);
    }
  } catch (error) {
    console.error("\n\u274C Migration failed:");
    if (error instanceof Error) {
      console.error(`   ${error.name}: ${error.message}`);
      if (verbose && error.stack) {
        console.error(error.stack);
      }
    } else {
      console.error(`   ${String(error)}`);
    }
    process.exit(1);
  }
}
async function handleTransfer(opts) {
  const { id, verbose } = opts;
  const sourceConfig = await resolveConfigFromDomain(opts.from, "Source");
  const destConfig = await resolveConfigFromDomain(opts.to, "Destination");
  console.log(`\u{1F504} Transferring contentTemplateCode: ${id}`);
  console.log(`   From: ${opts.from} (${sourceConfig.baseUrl})`);
  console.log(`   To:   ${opts.to} (${destConfig.baseUrl})`);
  try {
    const fontApiConfig = opts.syncFonts ? {
      baseUrl: destConfig.baseUrl,
      authToken: destConfig.authToken
    } : void 0;
    const result = await migrate(id, { config: sourceConfig, fontApiConfig });
    printStats(result.stats);
    printWarnings(result.warnings);
    printValidation(result.validation, verbose);
    if (opts.dryRun) {
      console.log("\n\u{1F50D} Dry run \u2014 no upload, no file written");
      if (!result.validation.valid) process.exit(2);
      return;
    }
    if (opts.saveJson) {
      const jsonPath = typeof opts.saveJson === "string" ? resolve3(opts.saveJson) : resolve3("output", `${sanitizeFilename(result.document.name)}.json`);
      await mkdir(dirname(jsonPath), { recursive: true });
      await writeFile(jsonPath, JSON.stringify(result.document, null, 2), "utf-8");
      console.log(`
\u{1F4C1} JSON saved to: ${jsonPath}`);
    }
    console.log(`
\u{1F4E4} Uploading to ${opts.to} as new template...`);
    const created = await createContentTemplate(result.document, destConfig, {
      name: opts.name,
      templateType: opts.type
    });
    console.log(
      `\u2705 Created on ${opts.to}: ${created.contentTemplateName ?? opts.name ?? result.document.name}`
    );
    console.log(`   ID: ${created._id}`);
    console.log(
      `   URL: ${destConfig.baseUrl.replace("/api", "")}/ui/spa/suite/contentTemplates/edit/${created._id}`
    );
    console.log(`   Debug: http://localhost:3000/?id=${created._id}`);
    if (!result.validation.valid) process.exit(2);
  } catch (error) {
    console.error("\n\u274C Transfer failed:");
    if (error instanceof ProlibuApiError) {
      console.error(`   ${error.name}: ${error.message}`);
      if (error.responseBody) {
        console.error(`   Response body: ${error.responseBody}`);
      }
      if (verbose && error.stack) console.error(error.stack);
    } else if (error instanceof Error) {
      console.error(`   ${error.name}: ${error.message}`);
      if (verbose && error.stack) console.error(error.stack);
    } else {
      console.error(`   ${String(error)}`);
    }
    process.exit(1);
  }
}
async function resolveConfigFromDomain(domain, label) {
  const env = await loadDomainEnv(domain);
  const apiUrl = env.PROLIBU_API_URL ?? `https://${domain}.prolibu.com/api`;
  const token = env.PROLIBU_AUTH_TOKEN;
  if (!token) {
    throw new Error(`${label}: No PROLIBU_AUTH_TOKEN found in .${domain}.env`);
  }
  console.log(`\u{1F4C2} ${label}: loaded .${domain}.env`);
  return {
    baseUrl: apiUrl,
    authToken: token.startsWith("Bearer ") ? token : `Bearer ${token}`
  };
}
function printStats(stats) {
  console.log("\n\u{1F4CA} Migration Stats:");
  console.log(`   Pages: ${stats.pages}`);
  console.log(`   Total source nodes: ${stats.totalSourceNodes}`);
  console.log(`   Migrated nodes: ${stats.migratedNodes}`);
  console.log(`   Skipped nodes: ${stats.skippedNodes}`);
  console.log(`   Text: ${stats.textNodes}`);
  console.log(`   Components: ${stats.componentNodes}`);
  console.log(`   Images: ${stats.imageNodes}`);
  console.log(`   Rectangles: ${stats.rectangleNodes}`);
  console.log(`   Lines: ${stats.lineNodes}`);
  console.log(`   Frames: ${stats.frameNodes}`);
}
function printWarnings(warnings) {
  if (warnings.length > 0) {
    console.log(`
\u26A0\uFE0F  Warnings (${warnings.length}):`);
    for (const w of warnings) {
      console.log(`   - ${w}`);
    }
  }
}
function printValidation(validation, verbose) {
  if (validation.valid) {
    console.log("\n\u2705 Document validation: PASSED");
  } else {
    console.log("\n\u274C Document validation: FAILED");
    for (const err of validation.errors) {
      console.log(`   Error: ${err.message} (${err.path}) [${err.code}]`);
    }
  }
  if (verbose && validation.warnings.length > 0) {
    console.log(`
   Validation warnings (${validation.warnings.length}):`);
    for (const w of validation.warnings) {
      console.log(`   - ${w.message} (${w.path})`);
    }
  }
}
function sanitizeFilename(name) {
  const cleaned = name.replace(/[^a-zA-Z0-9_\-\s]/g, "").replace(/\s+/g, "-").toLowerCase().slice(0, 100);
  return cleaned || "unnamed-template";
}
program.parseAsync().catch((err) => {
  console.error("\u274C Unexpected error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
