/**
 * Prolibu API Client — fetches content templates from the Prolibu REST API
 * and creates new ones after migration.
 */

import { ProlibuLayoutSchema } from '../types/prolibu.js';
import type { ProlibuLayout } from '../types/prolibu.js';
import type { Document } from '@design-studio/schema';

/** Default request timeout in ms */
const REQUEST_TIMEOUT = 30_000;

/** Max retry attempts for transient errors */
const MAX_RETRIES = 3;

/** Retryable HTTP status codes */
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export interface ProlibuClientConfig {
  /** Base URL, e.g. "https://redrenault.prolibu.com/api" */
  baseUrl: string;
  /** Auth token (Bearer) */
  authToken: string;
}

// ═══════════════════════════════════════════════════════════════
// ERRORS
// ═══════════════════════════════════════════════════════════════

export class ProlibuApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public responseBody?: string
  ) {
    super(message);
    this.name = 'ProlibuApiError';
  }
}

export class ProlibuParseError extends Error {
  constructor(
    message: string,
    public zodErrors?: unknown
  ) {
    super(message);
    this.name = 'ProlibuParseError';
  }
}

// ═══════════════════════════════════════════════════════════════
// CLIENT
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch a content template from the Prolibu API and validate its structure.
 */
export async function fetchContentTemplate(
  id: string,
  config: ProlibuClientConfig
): Promise<ProlibuLayout> {
  // Build URL with populate to get embeddedFonts with URLs
  const populatePath = JSON.stringify([{ path: 'embeddedFonts', select: 'fileName url mimeType' }]);
  const url = `${config.baseUrl}/v2/contenttemplate/${id}?populatePath=${encodeURIComponent(populatePath)}`;

  const response = await fetchWithRetry(
    url,
    {
      method: 'GET',
      headers: {
        Authorization: config.authToken,
        'Content-Type': 'application/json',
      },
    },
    `fetching template ${id}`
  );

  const json = await safeParseJson(response, `template ${id}`);

  // Validate with zod
  const parsed = ProlibuLayoutSchema.safeParse(json);
  if (!parsed.success) {
    throw new ProlibuParseError(
      `Invalid API response structure for template ${id}: ${parsed.error.message}`,
      parsed.error.issues
    );
  }

  return parsed.data;
}

// ═══════════════════════════════════════════════════════════════
// CREATE (upload migrated document as a NEW content template)
// ═══════════════════════════════════════════════════════════════

export interface CreateContentTemplateResult {
  /** New template _id from Prolibu */
  _id: string;
  /** Template name as returned by API */
  contentTemplateName?: string;
}

/**
 * Convert a Design Studio Document into the payload format
 * expected by the Prolibu POST /v2/contenttemplate/ endpoint.
 *
 * Convention: nodes + settings are embedded only in pages[0].
 */
export function documentToPayload(
  doc: Document,
  options: {
    /** Name for the new template (defaults to doc.name + " [migrated]") */
    name?: string;
    /** Template type: "layout" | "content" | "snippet" */
    templateType?: string;
    /** Content template code (unique identifier for upsert) */
    contentTemplateCode?: string;
    /** Font document IDs to include in embeddedFonts */
    fontIds?: string[];
    /** Taxonomy for language/category classification (passthrough) */
    taxonomy?: Record<string, unknown>;
    /** Keep original name without "[migrated YYYY-MM-DD]" suffix */
    keepOriginalName?: boolean;
  } = {}
): Record<string, unknown> {
  const today = new Date().toISOString().slice(0, 10);
  const name = options.name ?? (options.keepOriginalName ? doc.name : `${doc.name} [migrated ${today}]`);
  const templateType = options.templateType ?? 'layout';

  // Build pages array — nodes & settings on pages[0] only
  const pages = doc.pages.map((page, index) => {
    const base: Record<string, unknown> = {
      id: page.id,
      name: page.name,
      rootId: page.rootId,
      orientation: page.orientation,
      size: page.size,
      types: page.types,
      isPlaceholder: page.isPlaceholder,
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

  // Build Google Fonts link tags from settings
  const googleFontsHtml = buildGoogleFontsLinkTags(doc.settings.typography.googleFonts ?? []);

  // NOTE: embeddedFonts is sent as empty array - fonts are uploaded separately
  // and linked via fontCode in the document settings/HTML classes.

  const payload: Record<string, unknown> = {
    contentTemplateName: name,
    templateType,
    pages,
    html: '', // No browser rendering available — empty is accepted by the API
    // Font configuration
    defaultFont: doc.settings.typography.defaultFontFamily || undefined,
    // Embedded fonts - empty array (fonts are uploaded separately)
    embeddedFonts: [],
    // NOTE: assets expects File document IDs, not the actual image data
    meta: {
      googleFonts: googleFontsHtml,
    },
  };

  // Include contentTemplateCode if provided (critical for upsert to work)
  if (options.contentTemplateCode) {
    payload.contentTemplateCode = options.contentTemplateCode;
  }

  // Include taxonomy if provided (passthrough all fields with dot notation)
  if (options.taxonomy) {
    for (const [key, value] of Object.entries(options.taxonomy)) {
      if (value !== undefined) {
        payload[`taxonomy.${key}`] = value;
      }
    }
  }

  return payload;
}

/**
 * Create a new content template on Prolibu by uploading a migrated Document.
 */
export async function createContentTemplate(
  doc: Document,
  config: ProlibuClientConfig,
  options: {
    name?: string;
    templateType?: string;
    contentTemplateCode?: string;
    fontIds?: string[];
    taxonomy?: Record<string, unknown>;
    keepOriginalName?: boolean;
  } = {}
): Promise<CreateContentTemplateResult> {
  const payload = documentToPayload(doc, options);
  const url = `${config.baseUrl}/v2/contenttemplate/`;

  const response = await fetchWithRetry(
    url,
    {
      method: 'POST',
      headers: {
        Authorization: config.authToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    'creating template'
  );

  const json = (await safeParseJson(response, 'create response')) as Record<string, unknown>;

  const _id = (json._id ?? json.id ?? '') as string;
  if (!_id) {
    throw new ProlibuApiError('API returned no _id for created template', 0);
  }

  return {
    _id,
    contentTemplateName: json.contentTemplateName as string | undefined,
  };
}

// ═══════════════════════════════════════════════════════════════
// DEACTIVATE TEMPLATE (mark as inactive)
// ═══════════════════════════════════════════════════════════════

/**
 * Mark a content template as inactive (disabled) via PATCH.
 * Sets `active: false` on the root of the document.
 * This effectively "disables" the old template after migration.
 */
export async function hideTemplate(templateId: string, config: ProlibuClientConfig): Promise<void> {
  const url = `${config.baseUrl}/v2/contenttemplate/${templateId}`;

  await fetchWithRetry(
    url,
    {
      method: 'PATCH',
      headers: {
        Authorization: config.authToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ active: false }),
    },
    `deactivating template ${templateId}`
  );
}

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function buildGoogleFontsLinkTags(
  googleFonts: Array<{ family: string; weights: number[] }>
): string {
  if (googleFonts.length === 0) return '';

  return googleFonts
    .map((f) => {
      const weights = f.weights.length > 0 ? `:wght@${f.weights.join(';')}` : '';
      const family = f.family.replace(/\s+/g, '+');
      return `<link href="https://fonts.googleapis.com/css2?family=${family}${weights}&display=swap" rel="stylesheet">`;
    })
    .join('\n');
}

// ═══════════════════════════════════════════════════════════════
// FETCH UTILITIES (timeout + retry + safe JSON parsing)
// ═══════════════════════════════════════════════════════════════

/**
 * Fetch with timeout and automatic retry on transient errors.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  context: string,
  attempt = 1
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ProlibuApiError(`Request timed out (${REQUEST_TIMEOUT}ms) ${context}`, 0);
    }
    if (attempt < MAX_RETRIES) {
      const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
      await sleep(delay);
      return fetchWithRetry(url, init, context, attempt + 1);
    }
    throw new ProlibuApiError(
      `Network error ${context} after ${MAX_RETRIES} attempts: ${error instanceof Error ? error.message : String(error)}`,
      0
    );
  }

  // Retry on transient HTTP errors (not on POST to avoid duplicates when not idempotent)
  if (RETRYABLE_STATUS.has(response.status) && init.method === 'GET' && attempt < MAX_RETRIES) {
    const delay = Math.min(1000 * 2 ** (attempt - 1), 8000);
    await sleep(delay);
    return fetchWithRetry(url, init, context, attempt + 1);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new ProlibuApiError(
      `API error: ${response.status} ${response.statusText} ${context}`,
      response.status,
      body
    );
  }

  return response;
}

/**
 * Safely parse JSON from a response, throwing ProlibuApiError on failure.
 */
async function safeParseJson(response: Response, context: string): Promise<unknown> {
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════
// LIST EXISTING TEMPLATES (for upsert logic)
// ═══════════════════════════════════════════════════════════════

export interface ContentTemplateListItem {
  _id: string;
  contentTemplateName: string;
  contentTemplateCode?: string;
  templateType: string;
  createdAt?: string;
}

/**
 * Fetch all content templates from a Prolibu account.
 * Used to check existence before deciding POST vs PATCH.
 */
export async function fetchExistingTemplates(
  config: ProlibuClientConfig,
  templateType?: 'layout' | 'content' | 'snippet'
): Promise<ContentTemplateListItem[]> {
  const allTemplates: ContentTemplateListItem[] = [];
  let page = 1;
  const limit = 500;

  while (true) {
    const url = new URL('/v2/contenttemplate/', config.baseUrl);
    url.searchParams.set(
      'select',
      'contentTemplateName contentTemplateCode templateType createdAt'
    );
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('page', String(page));
    url.searchParams.set('sort', '-createdAt');

    if (templateType) {
      url.searchParams.set('templateType', templateType);
    }

    const response = await fetchWithRetry(
      url.toString(),
      {
        method: 'GET',
        headers: {
          Authorization: config.authToken,
          'Content-Type': 'application/json',
        },
      },
      `listing templates page ${page}`
    );

    const json = await safeParseJson(response, `templates list page ${page}`);
    const data = Array.isArray(json) ? json : (json as { data?: unknown[] }).data || [];

    if (data.length === 0) break;

    allTemplates.push(...(data as ContentTemplateListItem[]));

    if (data.length < limit) break; // Last page
    page++;
  }

  return allTemplates;
}

/**
 * Build a lookup map from contentTemplateCode to template ID.
 * Used for O(1) existence check before upsert.
 */
export function buildTemplateCodeMap(templates: ContentTemplateListItem[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const t of templates) {
    if (t.contentTemplateCode) {
      map.set(t.contentTemplateCode, t._id);
    }
  }
  return map;
}

// ═══════════════════════════════════════════════════════════════
// UPDATE (PATCH existing template)
// ═══════════════════════════════════════════════════════════════

export interface UpdateContentTemplateResult {
  _id: string;
  contentTemplateName?: string;
}

/**
 * Update an existing content template on Prolibu via PATCH.
 */
export async function updateContentTemplate(
  templateId: string,
  doc: Document,
  config: ProlibuClientConfig,
  options: {
    name?: string;
    templateType?: string;
    contentTemplateCode?: string;
    fontIds?: string[];
    taxonomy?: Record<string, unknown>;
    keepOriginalName?: boolean;
  } = {}
): Promise<UpdateContentTemplateResult> {
  const payload = documentToPayload(doc, options);
  const url = `${config.baseUrl}/v2/contenttemplate/${templateId}`;

  const response = await fetchWithRetry(
    url,
    {
      method: 'PATCH',
      headers: {
        Authorization: config.authToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    `updating template ${templateId}`
  );

  const json = (await safeParseJson(response, 'update response')) as Record<string, unknown>;

  const _id = (json._id ?? json.id ?? templateId) as string;

  return {
    _id,
    contentTemplateName: json.contentTemplateName as string | undefined,
  };
}

// ═══════════════════════════════════════════════════════════════
// UPSERT (create or update based on existence)
// ═══════════════════════════════════════════════════════════════

export interface UpsertResult {
  action: 'created' | 'updated';
  _id: string;
  contentTemplateName?: string;
}

/**
 * Create or update a content template based on whether it already exists.
 * Uses contentTemplateCode for lookup and storage:
 * - With keepOriginalName=false (default): adds "-migrated" suffix to avoid collision
 * - With keepOriginalName=true: uses original code (may overwrite if same account)
 * This ensures:
 * 1. No collision with original templates in same-account migrations (when using suffix)
 * 2. Consistent code for detecting existing migrated templates (UPDATE vs CREATE)
 */
export async function upsertContentTemplate(
  doc: Document,
  config: ProlibuClientConfig,
  existingMap: Map<string, string>,
  options: {
    name?: string;
    templateType?: string;
    /** The original contentTemplateCode from source */
    sourceCode?: string;
    /** Font document IDs to include in embeddedFonts */
    fontIds?: string[];
    /** Taxonomy for language/category classification (passthrough) */
    taxonomy?: Record<string, unknown>;
    /** Keep original code without "-migrated" suffix */
    keepOriginalName?: boolean;
  } = {}
): Promise<UpsertResult> {
  const sourceCode = options.sourceCode ?? doc.name;
  // Use original code if keepOriginalName, otherwise add "-migrated" suffix
  const targetCode = options.keepOriginalName ? sourceCode : `${sourceCode}-migrated`;

  // Check if a template with the target code already exists
  const existingId = existingMap.get(targetCode);

  // Options for create/update - include the target code and fontIds
  const payloadOptions = {
    name: options.name,
    templateType: options.templateType,
    contentTemplateCode: targetCode,
    fontIds: options.fontIds,
    taxonomy: options.taxonomy,
    keepOriginalName: options.keepOriginalName,
  };

  if (existingId) {
    // Template exists — PATCH
    const result = await updateContentTemplate(existingId, doc, config, payloadOptions);
    return {
      action: 'updated',
      _id: result._id,
      contentTemplateName: result.contentTemplateName,
    };
  } else {
    // Template doesn't exist — POST
    const result = await createContentTemplate(doc, config, payloadOptions);
    return {
      action: 'created',
      _id: result._id,
      contentTemplateName: result.contentTemplateName,
    };
  }
}
