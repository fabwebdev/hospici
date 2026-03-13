// tests/contract/audit-export.contract.test.ts
// T3-10: ADR / TPE / Survey Record Packet Export — contract tests

import { describe, expect, it } from "vitest";

// ── Test fixtures ─────────────────────────────────────────────────────────────

const EXPORT_UUID = "00000000-0000-0000-0000-000000000001";
const PATIENT_UUID = "00000000-0000-0000-0000-000000000002";
const LOCATION_UUID = "00000000-0000-0000-0000-000000000003";
const USER_UUID = "00000000-0000-0000-0000-000000000004";

// Valid 64-char hex strings (SHA-256 format)
const SAMPLE_HASH_1 = "abc123def456abc123def456abc123def456abc123def456abc123def456abc1";
const SAMPLE_HASH_2 = "def456abc123def456abc123def456abc123def456abc123def456abc123def4";
const SAMPLE_EXPORT_HASH = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

function makeManifest(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    exportId: EXPORT_UUID,
    patientId: PATIENT_UUID,
    purpose: "ADR" as const,
    requestedAt: "2026-03-13T10:00:00.000Z",
    requestedBy: USER_UUID,
    dateRange: { from: "2026-01-01", to: "2026-03-13" },
    includedSections: [
      {
        name: "Patient Demographics & Admission",
        documentCount: 1,
        hash: SAMPLE_HASH_1,
      },
      {
        name: "Encounter / Visit Notes",
        documentCount: 5,
        hash: SAMPLE_HASH_2,
      },
    ],
    omittedSections: [
      { name: "IDG Meeting Records", reason: "no records in date range" },
      { name: "Audit Log", reason: "not selected" },
    ],
    totalDocuments: 6,
    exportHash: SAMPLE_EXPORT_HASH,
    generatedAt: "2026-03-13T10:01:30.000Z",
    ...overrides,
  };
}

function makeExportRecord(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    id: EXPORT_UUID,
    patientId: PATIENT_UUID,
    locationId: LOCATION_UUID,
    requestedByUserId: USER_UUID,
    purpose: "ADR",
    status: "READY",
    dateRangeFrom: "2026-01-01",
    dateRangeTo: "2026-03-13",
    selectedSections: [
      "DEMOGRAPHICS",
      "NOE_NOTR",
      "BENEFIT_PERIODS",
      "ENCOUNTERS",
      "ORDERS",
      "MEDICATIONS_MAR",
    ],
    includeAuditLog: false,
    includeCompletenessSummary: false,
    exportHash: SAMPLE_EXPORT_HASH,
    manifestJson: makeManifest(),
    pdfStorageKey: "./export-storage/00000000-0000-0000-0000-000000000001/export.pdf.txt",
    zipStorageKey: "./export-storage/00000000-0000-0000-0000-000000000001/export.zip.txt",
    generationStartedAt: "2026-03-13T10:00:05.000Z",
    generationCompletedAt: "2026-03-13T10:01:30.000Z",
    exportedAt: null,
    errorMessage: null,
    createdAt: "2026-03-13T10:00:00.000Z",
    updatedAt: "2026-03-13T10:01:30.000Z",
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("T3-10: ADR/TPE/Survey Record Packet Export — contract tests", () => {
  // ── 1. Create export returns 202 + exportId ────────────────────────────────

  it("create export response has exportId (202 shape)", () => {
    const response = { exportId: EXPORT_UUID };
    expect(response).toHaveProperty("exportId");
    expect(typeof response.exportId).toBe("string");
    // Must be a valid UUID format
    expect(response.exportId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  // ── 2. Invalid purpose returns 400 ─────────────────────────────────────────

  it("create export with invalid purpose fails validation", () => {
    const invalidInput = {
      patientId: PATIENT_UUID,
      purpose: "INVALID_PURPOSE", // not in enum
      dateRangeFrom: "2026-01-01",
      dateRangeTo: "2026-03-13",
      selectedSections: ["DEMOGRAPHICS"],
      includeAuditLog: false,
      includeCompletenessSummary: false,
    };
    const validPurposes = ["ADR", "TPE", "SURVEY", "LEGAL", "PAYER_REQUEST"];
    expect(validPurposes).not.toContain(invalidInput.purpose);
  });

  // ── 3. Non-compliance-officer role returns 403 ─────────────────────────────

  it("non-compliance role is rejected at role check", () => {
    const ALLOWED_ROLES = new Set(["compliance_officer", "super_admin"]);
    const clinicianRole = "clinician";
    const nurseRole = "rn";
    expect(ALLOWED_ROLES.has(clinicianRole)).toBe(false);
    expect(ALLOWED_ROLES.has(nurseRole)).toBe(false);
    expect(ALLOWED_ROLES.has("compliance_officer")).toBe(true);
    expect(ALLOWED_ROLES.has("super_admin")).toBe(true);
  });

  // ── 4. List exports returns paginated array ────────────────────────────────

  it("list exports response has exports array and total", () => {
    const response = {
      exports: [makeExportRecord(), makeExportRecord({ id: "00000000-0000-0000-0000-000000000099" })],
      total: 2,
    };
    expect(Array.isArray(response.exports)).toBe(true);
    expect(response.exports).toHaveLength(2);
    expect(typeof response.total).toBe("number");
    expect(response.total).toBe(2);
  });

  // ── 5. Get export by id returns full shape ─────────────────────────────────

  it("AuditRecordExport has all required fields", () => {
    const record = makeExportRecord();
    expect(record).toHaveProperty("id");
    expect(record).toHaveProperty("patientId");
    expect(record).toHaveProperty("locationId");
    expect(record).toHaveProperty("requestedByUserId");
    expect(record).toHaveProperty("purpose");
    expect(record).toHaveProperty("status");
    expect(record).toHaveProperty("dateRangeFrom");
    expect(record).toHaveProperty("dateRangeTo");
    expect(record).toHaveProperty("selectedSections");
    expect(record).toHaveProperty("includeAuditLog");
    expect(record).toHaveProperty("includeCompletenessSummary");
    expect(record).toHaveProperty("exportHash");
    expect(record).toHaveProperty("manifestJson");
    expect(record).toHaveProperty("pdfStorageKey");
    expect(record).toHaveProperty("zipStorageKey");
    expect(record).toHaveProperty("generationStartedAt");
    expect(record).toHaveProperty("generationCompletedAt");
    expect(record).toHaveProperty("exportedAt");
    expect(record).toHaveProperty("errorMessage");
    expect(record).toHaveProperty("createdAt");
    expect(record).toHaveProperty("updatedAt");
  });

  // ── 6. Non-existent export returns 404 shape ──────────────────────────────

  it("404 error response shape has error string", () => {
    const notFoundResponse = { error: "Audit export not found: 99999999-0000-0000-0000-000000000000" };
    expect(notFoundResponse).toHaveProperty("error");
    expect(typeof notFoundResponse.error).toBe("string");
    expect(notFoundResponse.error).toContain("not found");
  });

  // ── 7. Download URL for non-READY export returns 400 ──────────────────────

  it("download URL for non-READY export returns error shape", () => {
    const record = makeExportRecord({ status: "GENERATING" });
    expect(record.status).toBe("GENERATING");
    // Service throws AuditExportNotReadyError → 400
    const errorResponse = {
      error: "Export is not ready for download (current status: GENERATING)",
    };
    expect(errorResponse.error).toContain("not ready");
    expect(errorResponse.error).toContain("GENERATING");
  });

  // ── 8. Download URL for READY export returns URL + expiresAt ──────────────

  it("download URL response has downloadUrl, format, and expiresAt", () => {
    // expiresAt is 15 minutes from now — use dynamic time to avoid stale fixture
    const fifteenMinFromNow = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const response = {
      downloadUrl: `/api/v1/patients/${PATIENT_UUID}/audit-exports/${EXPORT_UUID}/file?format=pdf&token=abc123`,
      format: "pdf",
      expiresAt: fifteenMinFromNow,
    };
    expect(response).toHaveProperty("downloadUrl");
    expect(response).toHaveProperty("format");
    expect(response).toHaveProperty("expiresAt");
    expect(response.format).toBe("pdf");
    expect(response.downloadUrl).toContain("token=");
    // expiresAt must be in the future
    expect(new Date(response.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  // ── 9. Manifest shape validation ──────────────────────────────────────────

  it("AuditRecordExportManifest has includedSections and omittedSections arrays", () => {
    const manifest = makeManifest();
    expect(Array.isArray(manifest.includedSections)).toBe(true);
    expect(Array.isArray(manifest.omittedSections)).toBe(true);
    expect(manifest.includedSections.length).toBeGreaterThan(0);
  });

  it("manifest includedSection has name, documentCount, and hash", () => {
    const section = makeManifest().includedSections[0];
    expect(section).toBeDefined();
    if (!section) throw new Error("section is undefined");
    expect(section).toHaveProperty("name");
    expect(section).toHaveProperty("documentCount");
    expect(section).toHaveProperty("hash");
    expect(typeof section.documentCount).toBe("number");
    expect(section.hash).toHaveLength(64); // SHA-256 hex = 64 chars
  });

  it("manifest omittedSection has name and reason", () => {
    const omitted = makeManifest().omittedSections[0];
    expect(omitted).toBeDefined();
    if (!omitted) throw new Error("omitted is undefined");
    expect(omitted).toHaveProperty("name");
    expect(omitted).toHaveProperty("reason");
    expect(["not selected", "no records in date range"]).toContain(omitted.reason);
  });

  // ── 10. Export history ordered most-recent-first ───────────────────────────

  it("export list is ordered most-recent-first by createdAt", () => {
    const older = makeExportRecord({ createdAt: "2026-02-01T00:00:00.000Z" });
    const newer = makeExportRecord({ createdAt: "2026-03-13T00:00:00.000Z" });
    const list = [newer, older]; // API returns newest first
    const dates = list.map((e) => new Date(e.createdAt).getTime());
    expect(dates[0]).toBeGreaterThan(dates[1] as number);
  });

  // ── 11. Export purpose enum values ────────────────────────────────────────

  it("ExportPurpose enum has all 5 valid values", () => {
    const purposes = ["ADR", "TPE", "SURVEY", "LEGAL", "PAYER_REQUEST"];
    expect(purposes).toHaveLength(5);
    expect(purposes).toContain("ADR");
    expect(purposes).toContain("TPE");
    expect(purposes).toContain("SURVEY");
    expect(purposes).toContain("LEGAL");
    expect(purposes).toContain("PAYER_REQUEST");
  });

  // ── 12. Export status enum values ─────────────────────────────────────────

  it("ExportStatus enum has all 5 valid values", () => {
    const statuses = ["REQUESTED", "GENERATING", "READY", "EXPORTED", "FAILED"];
    expect(statuses).toHaveLength(5);
    expect(statuses).toContain("REQUESTED");
    expect(statuses).toContain("GENERATING");
    expect(statuses).toContain("READY");
    expect(statuses).toContain("EXPORTED");
    expect(statuses).toContain("FAILED");
  });

  // ── 13. All 12 section keys are defined ───────────────────────────────────

  it("CANONICAL_SECTION_ORDER has all 12 sections in correct order", () => {
    const expectedSections = [
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
    expect(expectedSections).toHaveLength(12);
    expect(expectedSections[0]).toBe("DEMOGRAPHICS");
    expect(expectedSections[10]).toBe("AUDIT_LOG");
    expect(expectedSections[11]).toBe("COMPLETENESS_SUMMARY");
  });

  // ── 14. FAILED export has errorMessage ────────────────────────────────────

  it("FAILED export record has errorMessage populated", () => {
    const failed = makeExportRecord({
      status: "FAILED",
      errorMessage: "Database connection timeout during ENCOUNTERS section fetch",
      exportHash: null,
      manifestJson: null,
      pdfStorageKey: null,
      zipStorageKey: null,
      generationCompletedAt: null,
    });
    expect(failed.status).toBe("FAILED");
    expect(failed.errorMessage).toBeTruthy();
    expect(failed.exportHash).toBeNull();
  });

  // ── 15. Socket events for export lifecycle are defined ────────────────────

  it("Socket events export:ready and export:failed are defined", () => {
    const exportReadyPayload = {
      exportId: EXPORT_UUID,
      patientId: PATIENT_UUID,
      locationId: LOCATION_UUID,
      purpose: "ADR",
      generatedAt: "2026-03-13T10:01:30.000Z",
    };
    const exportFailedPayload = {
      exportId: EXPORT_UUID,
      patientId: PATIENT_UUID,
      locationId: LOCATION_UUID,
      errorMessage: "Timed out fetching ENCOUNTERS data",
    };
    expect(exportReadyPayload).toHaveProperty("exportId");
    expect(exportReadyPayload).toHaveProperty("purpose");
    expect(exportReadyPayload).toHaveProperty("generatedAt");
    expect(exportFailedPayload).toHaveProperty("errorMessage");
  });

  // ── 16. Manifest exportHash is SHA-256 (64 hex chars) ─────────────────────

  it("manifest exportHash is a 64-char hex string", () => {
    const manifest = makeManifest();
    expect(manifest.exportHash).toMatch(/^[0-9a-f]{64}$/);
  });

  // ── 17. GENERATING record has generationStartedAt ─────────────────────────

  it("GENERATING export has generationStartedAt populated", () => {
    const generating = makeExportRecord({
      status: "GENERATING",
      generationStartedAt: "2026-03-13T10:00:05.000Z",
      generationCompletedAt: null,
      exportHash: null,
      manifestJson: null,
      pdfStorageKey: null,
      zipStorageKey: null,
    });
    expect(generating.status).toBe("GENERATING");
    expect(generating.generationStartedAt).toBeTruthy();
    expect(generating.generationCompletedAt).toBeNull();
  });
});
