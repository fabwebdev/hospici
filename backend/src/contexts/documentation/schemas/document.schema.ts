/**
 * Document schemas — TypeBox definitions for the patient documents module.
 *
 * Covers:
 *   - Document upload (stub S3/R2 key generation)
 *   - Document list with status/category filtering
 *   - Document patch (status change, signature recording)
 *
 * Schema-first: TypeBox → Drizzle table → migration → typebox-compiler.ts
 * No TypeCompiler.Compile() calls here — all compilation in typebox-compiler.ts.
 */

import { type Static, Type } from "@sinclair/typebox";

// ── Enums ──────────────────────────────────────────────────────────────────────

export const DocumentCategorySchema = Type.Union([
  Type.Literal("CERTIFICATION"),
  Type.Literal("CONSENT"),
  Type.Literal("CLINICAL_NOTE"),
  Type.Literal("ORDER"),
  Type.Literal("CARE_PLAN"),
  Type.Literal("ADVANCE_DIRECTIVE"),
  Type.Literal("OTHER"),
]);
export type DocumentCategory = Static<typeof DocumentCategorySchema>;

export const DocumentStatusSchema = Type.Union([
  Type.Literal("ACTIVE"),
  Type.Literal("ARCHIVED"),
]);
export type DocumentStatus = Static<typeof DocumentStatusSchema>;

// ── Core document response schema ──────────────────────────────────────────────

export const DocumentResponseSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  patientId: Type.String({ format: "uuid" }),
  locationId: Type.String({ format: "uuid" }),
  name: Type.String({ minLength: 1, maxLength: 500 }),
  category: DocumentCategorySchema,
  storageKey: Type.Optional(Type.String()),
  mimeType: Type.Optional(Type.String({ maxLength: 100 })),
  sizeBytes: Type.Optional(Type.Integer({ minimum: 0 })),
  status: DocumentStatusSchema,
  uploadedByUserId: Type.Optional(Type.String({ format: "uuid" })),
  signed: Type.Boolean(),
  signedAt: Type.Optional(Type.String({ format: "date-time" })),
  signedByUserId: Type.Optional(Type.String({ format: "uuid" })),
  createdAt: Type.String({ format: "date-time" }),
  updatedAt: Type.String({ format: "date-time" }),
});
export type DocumentResponse = Static<typeof DocumentResponseSchema>;

// ── List response ──────────────────────────────────────────────────────────────

export const DocumentListResponseSchema = Type.Object({
  documents: Type.Array(DocumentResponseSchema),
  total: Type.Integer(),
});
export type DocumentListResponse = Static<typeof DocumentListResponseSchema>;

// ── Request body schemas ───────────────────────────────────────────────────────

export const CreateDocumentBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 500 }),
  category: DocumentCategorySchema,
  mimeType: Type.Optional(Type.String({ maxLength: 100 })),
  sizeBytes: Type.Optional(Type.Integer({ minimum: 0 })),
});
export type CreateDocumentBody = Static<typeof CreateDocumentBodySchema>;

export const PatchDocumentBodySchema = Type.Partial(
  Type.Object({
    status: DocumentStatusSchema,
    signed: Type.Boolean(),
  }),
);
export type PatchDocumentBody = Static<typeof PatchDocumentBodySchema>;
