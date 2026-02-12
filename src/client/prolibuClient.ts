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
  } = {}
): Record<string, unknown> {
  const today = new Date().toISOString().slice(0, 10);
  const name = options.name ?? `${doc.name} [migrated ${today}]`;
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

  // NOTE: embeddedFonts expects Font document IDs from the target account.
  // Cross-account migration cannot reference fonts that don't exist in destination.
  // Fonts would need to be uploaded separately to the target account first.

  return {
    contentTemplateName: name,
    templateType,
    pages,
    html: '', // No browser rendering available — empty is accepted by the API
    // Font configuration
    defaultFont: doc.settings.typography.defaultFontFamily || undefined,
    // NOTE: assets expects File document IDs, not the actual image data
    meta: {
      googleFonts: googleFontsHtml,
    },
  };
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
