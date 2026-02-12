/**
 * Document Transformer — creates the Document "shell"
 * (settings, metadata, assets) without pages and nodes.
 */

import { SCHEMA_VERSION, DEFAULT_DOCUMENT_SETTINGS, generateId } from '@design-studio/schema';
import type {
  Document,
  DocumentSettings,
  DocumentMetadata,
  DocumentAssets,
} from '@design-studio/schema';
import type { ProlibuLayout } from '../types/prolibu.js';
import type { ResolvedFonts } from '../assets/fontResolver.js';

/**
 * Create the Document shell (everything except pages and nodes).
 */
export function transformDocumentShell(
  layout: ProlibuLayout,
  fonts: ResolvedFonts
): Omit<Document, 'pages' | 'nodes'> {
  const now = new Date().toISOString();

  const settings: DocumentSettings = {
    ...DEFAULT_DOCUMENT_SETTINGS,
    typography: {
      ...DEFAULT_DOCUMENT_SETTINGS.typography,
      defaultFontFamily: fonts.defaultFontFamily,
      availableFonts: [
        ...fonts.availableFonts,
        ...DEFAULT_DOCUMENT_SETTINGS.typography.availableFonts,
      ],
    },
  };

  const assets: DocumentAssets = {
    images: {},
    fonts: fonts.fontAssets,
  };

  const metadata: DocumentMetadata = {
    figmaSource: null,
    aiGenerated: false,
    custom: {
      prolibuId: layout._id,
      templateType: layout.templateType,
      contentTemplateCode: layout.contentTemplateCode ?? null,
      migratedAt: now,
    },
  };

  return {
    version: SCHEMA_VERSION,
    id: generateId(),
    name: layout.contentTemplateName,
    createdAt: now,
    updatedAt: now,
    settings,
    assets,
    metadata,
  };
}
