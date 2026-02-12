/**
 * Prolibu v1 Types — Zod schemas + inferred TypeScript types
 * for the content template API response.
 */

import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════
// ZOD SCHEMAS
// ═══════════════════════════════════════════════════════════════

export const ProlibuNodeSchema: z.ZodType<ProlibuNode> = z.object({
  name: z.string(),
  type: z.string(),
  styles: z.record(z.union([z.string(), z.number()])).optional(),
  content: z.string().optional(),
  value: z.string().optional(),
  children: z.array(z.lazy(() => ProlibuNodeSchema)).optional(),
  comCompConfig: z.record(z.unknown()).optional(),
});

export const ProlibuPageSchema = z.object({
  name: z.string().optional(),
  children: z.array(ProlibuNodeSchema),
});

export const ProlibuEmbeddedFontSchema = z.union([
  // Poblado: objeto con URL completa
  z.object({
    _id: z.string(),
    fileName: z.string(),
    filePath: z.string().optional(),
    url: z.string(),
    mimeType: z.string().optional(),
    size: z.number().optional(),
  }),
  // Legacy: objeto simple
  z.object({
    fontName: z.string(),
    fontUrl: z.string(),
  }),
  // Solo ID string (no poblado)
  z.string(),
]);

export const ProlibuLayoutSchema = z.object({
  _id: z.string(),
  contentTemplateName: z.string(),
  contentTemplateCode: z.string().optional(),
  templateType: z.string(),
  pages: z.array(ProlibuPageSchema),
  defaultFont: z.string().optional(),
  secondaryFont: z.string().optional(),
  embeddedFonts: z.array(ProlibuEmbeddedFontSchema).optional(),
  assets: z.array(z.unknown()).optional(),
  figma: z.object({ pagePreviews: z.array(z.unknown()) }).optional(),
});

// ═══════════════════════════════════════════════════════════════
// INFERRED TYPES
// ═══════════════════════════════════════════════════════════════

export interface ProlibuNode {
  name: string;
  type: string;
  styles?: Record<string, string | number>;
  content?: string;
  value?: string;
  children?: ProlibuNode[];
  comCompConfig?: Record<string, unknown>;
}

export type ProlibuPage = z.infer<typeof ProlibuPageSchema>;
export type ProlibuEmbeddedFont = z.infer<typeof ProlibuEmbeddedFontSchema>;
export type ProlibuLayout = z.infer<typeof ProlibuLayoutSchema>;
