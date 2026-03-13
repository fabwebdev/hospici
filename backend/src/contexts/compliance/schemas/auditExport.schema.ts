// contexts/compliance/schemas/auditExport.schema.ts
// T3-10: ADR / TPE / Survey Record Packet Export — TypeBox schemas only.
// Validators are compiled ONCE in typebox-compiler.ts — never here.

import { type Static, Type } from "@sinclair/typebox";

// ── Enum schemas ──────────────────────────────────────────────────────────────

export const ExportPurposeSchema = Type.Enum({
  ADR: "ADR",
  TPE: "TPE",
  SURVEY: "SURVEY",
  LEGAL: "LEGAL",
  PAYER_REQUEST: "PAYER_REQUEST",
} as const);

export const ExportStatusSchema = Type.Enum({
  REQUESTED: "REQUESTED",
  GENERATING: "GENERATING",
  READY: "READY",
  EXPORTED: "EXPORTED",
  FAILED: "FAILED",
} as const);

export const ExportSectionKeySchema = Type.Enum({
  DEMOGRAPHICS: "DEMOGRAPHICS",
  NOE_NOTR: "NOE_NOTR",
  BENEFIT_PERIODS: "BENEFIT_PERIODS",
  HOPE_ASSESSMENTS: "HOPE_ASSESSMENTS",
  CARE_PLAN: "CARE_PLAN",
  ENCOUNTERS: "ENCOUNTERS",
  ORDERS: "ORDERS",
  IDG: "IDG",
  MEDICATIONS_MAR: "MEDICATIONS_MAR",
  CONSENTS: "CONSENTS",
  AUDIT_LOG: "AUDIT_LOG",
  COMPLETENESS_SUMMARY: "COMPLETENESS_SUMMARY",
} as const);

// ── Input schema ──────────────────────────────────────────────────────────────

export const AuditRecordExportRequestSchema = Type.Object({
  patientId: Type.String({ format: "uuid" }),
  purpose: ExportPurposeSchema,
  dateRangeFrom: Type.String({ format: "date" }),
  dateRangeTo: Type.String({ format: "date" }),
  selectedSections: Type.Array(ExportSectionKeySchema, { minItems: 1 }),
  includeAuditLog: Type.Boolean(),
  includeCompletenessSummary: Type.Boolean(),
});

export type AuditRecordExportRequestType = Static<typeof AuditRecordExportRequestSchema>;

// ── Manifest schemas ──────────────────────────────────────────────────────────

const ManifestIncludedSectionSchema = Type.Object({
  name: Type.String(),
  documentCount: Type.Integer({ minimum: 0 }),
  hash: Type.String(),
});

const ManifestOmittedSectionSchema = Type.Object({
  name: Type.String(),
  reason: Type.String(),
});

export const AuditRecordExportManifestSchema = Type.Object({
  exportId: Type.String({ format: "uuid" }),
  patientId: Type.String({ format: "uuid" }),
  purpose: Type.String(),
  requestedAt: Type.String({ format: "date-time" }),
  requestedBy: Type.String({ format: "uuid" }),
  dateRange: Type.Object({
    from: Type.String({ format: "date" }),
    to: Type.String({ format: "date" }),
  }),
  includedSections: Type.Array(ManifestIncludedSectionSchema),
  omittedSections: Type.Array(ManifestOmittedSectionSchema),
  totalDocuments: Type.Integer({ minimum: 0 }),
  exportHash: Type.String(),
  generatedAt: Type.String({ format: "date-time" }),
});

export type AuditRecordExportManifestType = Static<typeof AuditRecordExportManifestSchema>;

// ── Full row schema (mirrors DB columns, camelCase) ───────────────────────────

export const AuditRecordExportSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  patientId: Type.String({ format: "uuid" }),
  locationId: Type.String({ format: "uuid" }),
  requestedByUserId: Type.String({ format: "uuid" }),
  purpose: Type.String(),
  status: Type.String(),
  dateRangeFrom: Type.String(),
  dateRangeTo: Type.String(),
  selectedSections: Type.Array(Type.String()),
  includeAuditLog: Type.Boolean(),
  includeCompletenessSummary: Type.Boolean(),
  exportHash: Type.Union([Type.String(), Type.Null()]),
  manifestJson: Type.Union([AuditRecordExportManifestSchema, Type.Null()]),
  pdfStorageKey: Type.Union([Type.String(), Type.Null()]),
  zipStorageKey: Type.Union([Type.String(), Type.Null()]),
  generationStartedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  generationCompletedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  exportedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  errorMessage: Type.Union([Type.String(), Type.Null()]),
  createdAt: Type.String({ format: "date-time" }),
  updatedAt: Type.String({ format: "date-time" }),
});

export type AuditRecordExportType = Static<typeof AuditRecordExportSchema>;

// ── List response ─────────────────────────────────────────────────────────────

export const AuditRecordExportListResponseSchema = Type.Object({
  exports: Type.Array(AuditRecordExportSchema),
  total: Type.Integer({ minimum: 0 }),
});

export type AuditRecordExportListResponseType = Static<typeof AuditRecordExportListResponseSchema>;

// ── Download response ─────────────────────────────────────────────────────────

export const AuditRecordExportDownloadResponseSchema = Type.Object({
  downloadUrl: Type.String(),
  format: Type.String(),
  expiresAt: Type.String({ format: "date-time" }),
});

export type AuditRecordExportDownloadResponseType = Static<
  typeof AuditRecordExportDownloadResponseSchema
>;
