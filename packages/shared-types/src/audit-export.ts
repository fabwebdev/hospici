// audit-export.ts
// T3-10: ADR / TPE / Survey Record Packet Export — shared types.
// Zero runtime dependencies — types and constants only.

// ── Union types ───────────────────────────────────────────────────────────────

export type ExportPurpose = "ADR" | "TPE" | "SURVEY" | "LEGAL" | "PAYER_REQUEST";

export type ExportStatus = "REQUESTED" | "GENERATING" | "READY" | "EXPORTED" | "FAILED";

export type ExportSectionKey =
  | "DEMOGRAPHICS"
  | "NOE_NOTR"
  | "BENEFIT_PERIODS"
  | "HOPE_ASSESSMENTS"
  | "CARE_PLAN"
  | "ENCOUNTERS"
  | "ORDERS"
  | "IDG"
  | "MEDICATIONS_MAR"
  | "CONSENTS"
  | "AUDIT_LOG"
  | "COMPLETENESS_SUMMARY";

// ── Display label maps ────────────────────────────────────────────────────────

export const EXPORT_STATUS_LABELS: Record<ExportStatus, string> = {
  REQUESTED: "Requested",
  GENERATING: "Generating",
  READY: "Ready",
  EXPORTED: "Exported",
  FAILED: "Failed",
};

export const EXPORT_PURPOSE_LABELS: Record<ExportPurpose, string> = {
  ADR: "Additional Documentation Request (ADR)",
  TPE: "Targeted Probe and Educate (TPE)",
  SURVEY: "State / Federal Survey",
  LEGAL: "Legal / Litigation",
  PAYER_REQUEST: "Payer Request",
};

export const EXPORT_SECTION_LABELS: Record<ExportSectionKey, string> = {
  DEMOGRAPHICS: "Patient Demographics & Admission",
  NOE_NOTR: "Notices of Election & Termination",
  BENEFIT_PERIODS: "Benefit Periods",
  HOPE_ASSESSMENTS: "HOPE Assessments",
  CARE_PLAN: "Care Plan",
  ENCOUNTERS: "Encounter / Visit Notes",
  ORDERS: "Physician Orders",
  IDG: "IDG Meeting Records",
  MEDICATIONS_MAR: "Medications & MAR",
  CONSENTS: "Consents & Signature Records",
  AUDIT_LOG: "Audit Log",
  COMPLETENESS_SUMMARY: "Completeness Summary",
};

// ── Canonical section order (matches worker) ──────────────────────────────────

export const CANONICAL_SECTION_ORDER: ExportSectionKey[] = [
  "DEMOGRAPHICS",
  "NOE_NOTR",
  "BENEFIT_PERIODS",
  "HOPE_ASSESSMENTS",
  "CARE_PLAN",
  "ENCOUNTERS",
  "ORDERS",
  "IDG",
  "MEDICATIONS_MAR",
  "CONSENTS",
  "AUDIT_LOG",
  "COMPLETENESS_SUMMARY",
];

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface AuditRecordExportManifestSection {
  name: string;
  documentCount: number;
  hash: string;
}

export interface AuditRecordExportManifestOmission {
  name: string;
  reason: string;
}

export interface AuditRecordExportManifest {
  exportId: string;
  patientId: string;
  purpose: ExportPurpose;
  requestedAt: string;
  requestedBy: string;
  dateRange: { from: string; to: string };
  includedSections: AuditRecordExportManifestSection[];
  omittedSections: AuditRecordExportManifestOmission[];
  totalDocuments: number;
  exportHash: string;
  generatedAt: string;
}

export interface AuditRecordExport {
  id: string;
  patientId: string;
  locationId: string;
  requestedByUserId: string;
  purpose: ExportPurpose;
  status: ExportStatus;
  dateRangeFrom: string;
  dateRangeTo: string;
  selectedSections: string[];
  includeAuditLog: boolean;
  includeCompletenessSummary: boolean;
  exportHash: string | null;
  manifestJson: AuditRecordExportManifest | null;
  pdfStorageKey: string | null;
  zipStorageKey: string | null;
  generationStartedAt: string | null;
  generationCompletedAt: string | null;
  exportedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditRecordExportListResponse {
  exports: AuditRecordExport[];
  total: number;
}

export interface CreateAuditRecordExportInput {
  purpose: ExportPurpose;
  dateRangeFrom: string;
  dateRangeTo: string;
  selectedSections: ExportSectionKey[];
  includeAuditLog: boolean;
  includeCompletenessSummary: boolean;
}

export interface AuditRecordExportDownloadResponse {
  downloadUrl: string;
  format: string;
  expiresAt: string;
}
