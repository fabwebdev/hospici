// tests/contract/hope.functions.test.ts
// Contract tests for HOPE assessment server function handlers

import type {
  HOPEAssessmentListResponse,
  HOPEAssessmentResponse,
  HOPEDashboardResponse,
  HOPEPatientTimeline,
  HOPEQualityBenchmark,
  HOPESubmissionListResponse,
  HOPESubmissionRow,
  HOPEValidationResult,
} from "@hospici/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.server.js", () => ({
  env: { apiUrl: "http://localhost:3000", betterAuthSecret: "test" },
}));
vi.mock("vinxi/http", () => ({ getEvent: vi.fn(() => ({})) }));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: vi.fn(() => ({
    headers: { get: (key: string) => (key === "cookie" ? "session=test" : null) },
  })),
}));
// createServerFn chains .inputValidator(...).handler(...) or .handler(...) — provide no-op stubs
const chainable = {
  inputValidator: () => chainable,
  validator: () => chainable,
  handler: () => {},
};
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => chainable,
}));

const {
  fetchHOPEAssessments,
  fetchHOPEAssessment,
  createHOPEAssessment,
  patchHOPEAssessment,
  validateHOPEAssessment,
  approveHOPEAssessment,
  reprocessHOPESubmission,
  revertHOPEToReview,
  fetchQualityBenchmarks,
  fetchHOPEDashboard,
  fetchHOPEPatientTimeline,
  fetchHOPESubmissionsByAssessment,
} = await import("@/functions/hope.functions.js");

const COOKIE = "session=test";
const ASSESSMENT_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const PATIENT_ID = "bbbbbbbb-0000-0000-0000-000000000001";
const LOCATION_ID = "cccccccc-0000-0000-0000-000000000001";
const CLINICIAN_ID = "dddddddd-0000-0000-0000-000000000001";
const SUBMISSION_ID = "eeeeeeee-0000-0000-0000-000000000001";

const sampleAssessment: HOPEAssessmentResponse = {
  id: ASSESSMENT_ID,
  patientId: PATIENT_ID,
  locationId: LOCATION_ID,
  assessmentType: "01",
  assessmentDate: "2026-03-01",
  electionDate: "2026-02-15",
  windowStart: "2026-03-01",
  windowDeadline: "2026-03-08",
  assignedClinicianId: CLINICIAN_ID,
  status: "draft",
  completenessScore: 0,
  fatalErrorCount: 0,
  warningCount: 0,
  symptomFollowUpRequired: false,
  symptomFollowUpDueAt: null,
  data: {},
  createdAt: "2026-03-01T10:00:00.000Z",
  updatedAt: "2026-03-01T10:00:00.000Z",
};

const sampleList: HOPEAssessmentListResponse = {
  data: [sampleAssessment],
  total: 1,
  page: 1,
  limit: 20,
};

const sampleValidation: HOPEValidationResult = {
  completenessScore: 45,
  blockingErrors: [
    { field: "sectionA.A0100", code: "MISSING_REQUIRED", message: "A0100 is required" },
  ],
  warnings: [],
  inconsistencies: [],
  missingRequiredFields: ["sectionA.A0100", "sectionF.F0100"],
  suggestedNextActions: ["Complete Section A — Identification Information"],
};

const sampleSubmission: HOPESubmissionRow = {
  id: SUBMISSION_ID,
  assessmentId: ASSESSMENT_ID,
  locationId: LOCATION_ID,
  attemptNumber: 1,
  submittedAt: "2026-03-01T10:00:00.000Z",
  responseReceivedAt: null,
  trackingId: null,
  submittedByUserId: null,
  submissionStatus: "pending",
  correctionType: "none",
  rejectionCodes: [],
  rejectionDetails: null,
  payloadHash: "abc123def456",
  createdAt: "2026-03-01T10:00:00.000Z",
};

const sampleBenchmark: HOPEQualityBenchmark = {
  locationId: LOCATION_ID,
  reportingPeriod: {
    calendarYear: 2025,
    quarter: 4,
    periodStart: "2025-10-01",
    periodEnd: "2025-12-31",
  },
  hqrpPenaltyRisk: false,
  measures: [
    {
      measureCode: "NQF_3235",
      measureName: "Comprehensive Assessment at Admission",
      locationRate: 0.82,
      nationalAverage: 0.79,
      targetRate: 0.85,
      atRisk: false,
      trend: [],
    },
  ],
  updatedAt: "2026-03-01T10:00:00.000Z",
};

// ── fetchHOPEAssessments ──────────────────────────────────────────────────────

describe("fetchHOPEAssessments", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls GET /api/v1/hope/assessments with cookie", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleList), { status: 200 }),
    );

    const result = await fetchHOPEAssessments({}, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/hope/assessments",
      { headers: { cookie: COOKIE } },
    );
    expect(result.total).toBe(1);
    expect(result.data[0]?.id).toBe(ASSESSMENT_ID);
  });

  it("appends query params when filters provided", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleList), { status: 200 }),
    );

    await fetchHOPEAssessments(
      { patientId: PATIENT_ID, assessmentType: "01", status: "draft" },
      COOKIE,
    );

    const url = vi.mocked(global.fetch).mock.calls[0]?.[0] as string;
    expect(url).toContain(`patientId=${PATIENT_ID}`);
    expect(url).toContain("assessmentType=01");
    expect(url).toContain("status=draft");
  });

  it("appends windowOverdueOnly flag", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [], total: 0, page: 1, limit: 20 }), { status: 200 }),
    );

    await fetchHOPEAssessments({ windowOverdueOnly: true }, COOKIE);

    const url = vi.mocked(global.fetch).mock.calls[0]?.[0] as string;
    expect(url).toContain("windowOverdueOnly=true");
  });

  it("returns empty list when no assessments", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [], total: 0, page: 1, limit: 20 }), { status: 200 }),
    );

    const result = await fetchHOPEAssessments({}, COOKIE);
    expect(result.total).toBe(0);
    expect(result.data).toHaveLength(0);
  });

  it("throws on non-ok response", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Unauthorized" } }), { status: 401 }),
    );

    await expect(fetchHOPEAssessments({}, COOKIE)).rejects.toThrow("Unauthorized");
  });

  it("throws fallback message on malformed error body", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("bad json", { status: 500 }));

    await expect(fetchHOPEAssessments({}, COOKIE)).rejects.toThrow(
      "Failed to fetch HOPE assessments",
    );
  });
});

// ── fetchHOPEAssessment ───────────────────────────────────────────────────────

describe("fetchHOPEAssessment", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls GET /api/v1/hope/assessments/:id with cookie", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleAssessment), { status: 200 }),
    );

    const result = await fetchHOPEAssessment(ASSESSMENT_ID, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/hope/assessments/${ASSESSMENT_ID}`,
      { headers: { cookie: COOKIE } },
    );
    expect(result.id).toBe(ASSESSMENT_ID);
    expect(result.assessmentType).toBe("01");
  });

  it("throws NOT_FOUND on missing assessment", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "HOPE assessment not found" } }), {
        status: 404,
      }),
    );

    await expect(
      fetchHOPEAssessment("00000000-0000-0000-0000-000000000000", COOKIE),
    ).rejects.toThrow("HOPE assessment not found");
  });

  it("throws fallback on malformed error body", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("", { status: 500 }));

    await expect(fetchHOPEAssessment(ASSESSMENT_ID, COOKIE)).rejects.toThrow(
      "Failed to fetch HOPE assessment",
    );
  });
});

// ── createHOPEAssessment ──────────────────────────────────────────────────────

describe("createHOPEAssessment", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  const createBody = {
    patientId: PATIENT_ID,
    locationId: LOCATION_ID,
    assessmentType: "01" as const,
    assessmentDate: "2026-03-01",
    electionDate: "2026-02-15",
  };

  it("calls POST /api/v1/hope/assessments with JSON body", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleAssessment), { status: 201 }),
    );

    const result = await createHOPEAssessment(createBody, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/hope/assessments",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: expect.stringContaining('"assessmentType":"01"'),
      }),
    );
    expect(result.id).toBe(ASSESSMENT_ID);
    expect(result.status).toBe("draft");
  });

  it("creates HOPE-UV (02) same-day window assessment", async () => {
    const uvAssessment: HOPEAssessmentResponse = {
      ...sampleAssessment,
      assessmentType: "02",
      windowStart: "2026-03-10",
      windowDeadline: "2026-03-10",
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(uvAssessment), { status: 201 }),
    );

    const result = await createHOPEAssessment(
      { ...createBody, assessmentType: "02", assessmentDate: "2026-03-10" },
      COOKIE,
    );

    expect(result.assessmentType).toBe("02");
    expect(result.windowStart).toBe(result.windowDeadline);
  });

  it("throws WINDOW_VIOLATION on 7-day window breach", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { message: "Assessment date is outside the 7-day admission window" },
        }),
        { status: 422 },
      ),
    );

    await expect(createHOPEAssessment(createBody, COOKIE)).rejects.toThrow(
      "outside the 7-day admission window",
    );
  });

  it("throws fallback on non-ok without message", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("", { status: 500 }));

    await expect(createHOPEAssessment(createBody, COOKIE)).rejects.toThrow(
      "Failed to create HOPE assessment",
    );
  });
});

// ── patchHOPEAssessment ───────────────────────────────────────────────────────

describe("patchHOPEAssessment", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls PATCH /api/v1/hope/assessments/:id with body", async () => {
    const patched: HOPEAssessmentResponse = {
      ...sampleAssessment,
      status: "in_progress",
      data: { sectionA: { A0100: "1" } },
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(patched), { status: 200 }),
    );

    const result = await patchHOPEAssessment(
      ASSESSMENT_ID,
      { status: "in_progress", data: { sectionA: { A0100: "1" } } },
      COOKIE,
    );

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/hope/assessments/${ASSESSMENT_ID}`,
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: expect.stringContaining('"status":"in_progress"'),
      }),
    );
    expect(result.status).toBe("in_progress");
  });

  it("patches data only without status change", async () => {
    const patched: HOPEAssessmentResponse = {
      ...sampleAssessment,
      data: { sectionF: { F0100A: "0" } },
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(patched), { status: 200 }),
    );

    const result = await patchHOPEAssessment(
      ASSESSMENT_ID,
      { data: { sectionF: { F0100A: "0" } } },
      COOKIE,
    );

    expect(result.data).toEqual({ sectionF: { F0100A: "0" } });
  });

  it("throws on invalid status transition", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Invalid status transition" } }), {
        status: 422,
      }),
    );

    await expect(
      patchHOPEAssessment(ASSESSMENT_ID, { status: "accepted" }, COOKIE),
    ).rejects.toThrow("Invalid status transition");
  });

  it("throws fallback on non-ok without message", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("", { status: 500 }));

    await expect(patchHOPEAssessment(ASSESSMENT_ID, {}, COOKIE)).rejects.toThrow(
      "Failed to update HOPE assessment",
    );
  });
});

// ── validateHOPEAssessment ────────────────────────────────────────────────────

describe("validateHOPEAssessment", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls POST /api/v1/hope/assessments/:id/validate", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleValidation), { status: 200 }),
    );

    const result = await validateHOPEAssessment(ASSESSMENT_ID, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/hope/assessments/${ASSESSMENT_ID}/validate`,
      expect.objectContaining({ method: "POST", headers: { cookie: COOKIE } }),
    );
    expect(result.completenessScore).toBe(45);
    expect(result.blockingErrors).toHaveLength(1);
  });

  it("returns all-clear validation when assessment is complete", async () => {
    const allClear: HOPEValidationResult = {
      completenessScore: 100,
      blockingErrors: [],
      warnings: [],
      inconsistencies: [],
      missingRequiredFields: [],
      suggestedNextActions: [],
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(allClear), { status: 200 }),
    );

    const result = await validateHOPEAssessment(ASSESSMENT_ID, COOKIE);

    expect(result.completenessScore).toBe(100);
    expect(result.blockingErrors).toHaveLength(0);
    expect(result.missingRequiredFields).toHaveLength(0);
  });

  it("returns warnings separate from blocking errors", async () => {
    const withWarnings: HOPEValidationResult = {
      completenessScore: 90,
      blockingErrors: [],
      warnings: [
        {
          field: "sectionJ.J0100A",
          code: "CLINICAL_NOTE",
          message: "Consider documenting pain severity",
        },
      ],
      inconsistencies: ["Symptom score marked 0 but follow-up required flag is set"],
      missingRequiredFields: [],
      suggestedNextActions: ["Review Section J pain assessment"],
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(withWarnings), { status: 200 }),
    );

    const result = await validateHOPEAssessment(ASSESSMENT_ID, COOKIE);
    expect(result.warnings).toHaveLength(1);
    expect(result.inconsistencies).toHaveLength(1);
    expect(result.blockingErrors).toHaveLength(0);
  });

  it("throws on non-ok response", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Assessment not found" } }), { status: 404 }),
    );

    await expect(validateHOPEAssessment(ASSESSMENT_ID, COOKIE)).rejects.toThrow(
      "Assessment not found",
    );
  });

  it("throws fallback on malformed error body", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("", { status: 500 }));

    await expect(validateHOPEAssessment(ASSESSMENT_ID, COOKIE)).rejects.toThrow(
      "Failed to validate HOPE assessment",
    );
  });
});

// ── approveHOPEAssessment ─────────────────────────────────────────────────────

describe("approveHOPEAssessment", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls POST /api/v1/hope/assessments/:id/approve", async () => {
    const approved: HOPEAssessmentResponse = {
      ...sampleAssessment,
      status: "approved_for_submission",
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(approved), { status: 200 }),
    );

    const result = await approveHOPEAssessment(ASSESSMENT_ID, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/hope/assessments/${ASSESSMENT_ID}/approve`,
      expect.objectContaining({ method: "POST", headers: { cookie: COOKIE } }),
    );
    expect(result.status).toBe("approved_for_submission");
  });

  it("throws APPROVAL_BLOCKED when blocking errors remain", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { message: "Cannot approve: 2 blocking error(s) must be resolved first" },
        }),
        { status: 422 },
      ),
    );

    await expect(approveHOPEAssessment(ASSESSMENT_ID, COOKIE)).rejects.toThrow(
      "blocking error(s) must be resolved first",
    );
  });

  it("throws FORBIDDEN when called by non-supervisor", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { message: "Only supervisors can approve HOPE assessments" } }),
        { status: 403 },
      ),
    );

    await expect(approveHOPEAssessment(ASSESSMENT_ID, COOKIE)).rejects.toThrow(
      "Only supervisors can approve",
    );
  });

  it("throws fallback on non-ok without message", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("", { status: 500 }));

    await expect(approveHOPEAssessment(ASSESSMENT_ID, COOKIE)).rejects.toThrow(
      "Failed to approve HOPE assessment",
    );
  });
});

// ── reprocessHOPESubmission ───────────────────────────────────────────────────

describe("reprocessHOPESubmission", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls POST /api/v1/hope/submissions/:id/reprocess", async () => {
    const reprocessed: HOPESubmissionRow = { ...sampleSubmission, attemptNumber: 2 };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(reprocessed), { status: 200 }),
    );

    const result = await reprocessHOPESubmission(SUBMISSION_ID, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/hope/submissions/${SUBMISSION_ID}/reprocess`,
      expect.objectContaining({ method: "POST", headers: { cookie: COOKIE } }),
    );
    expect(result.attemptNumber).toBe(2);
  });

  it("increments attemptNumber on each reprocess", async () => {
    const attempt3: HOPESubmissionRow = { ...sampleSubmission, attemptNumber: 3 };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(attempt3), { status: 200 }),
    );

    const result = await reprocessHOPESubmission(SUBMISSION_ID, COOKIE);
    expect(result.attemptNumber).toBe(3);
  });

  it("throws on not found submission", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Submission not found" } }), { status: 404 }),
    );

    await expect(
      reprocessHOPESubmission("00000000-0000-0000-0000-000000000000", COOKIE),
    ).rejects.toThrow("Submission not found");
  });

  it("throws fallback on malformed error body", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("", { status: 500 }));

    await expect(reprocessHOPESubmission(SUBMISSION_ID, COOKIE)).rejects.toThrow(
      "Failed to reprocess submission",
    );
  });
});

// ── revertHOPEToReview ────────────────────────────────────────────────────────

describe("revertHOPEToReview", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls POST /api/v1/hope/submissions/:id/revert-to-review", async () => {
    const reverted: HOPEAssessmentResponse = {
      ...sampleAssessment,
      status: "ready_for_review",
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(reverted), { status: 200 }),
    );

    const result = await revertHOPEToReview(SUBMISSION_ID, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/hope/submissions/${SUBMISSION_ID}/revert-to-review`,
      expect.objectContaining({ method: "POST", headers: { cookie: COOKIE } }),
    );
    expect(result.status).toBe("ready_for_review");
  });

  it("throws when revert is not allowed (e.g. accepted status)", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Cannot revert accepted assessment" } }), {
        status: 422,
      }),
    );

    await expect(revertHOPEToReview(SUBMISSION_ID, COOKIE)).rejects.toThrow(
      "Cannot revert accepted",
    );
  });

  it("throws fallback on malformed error body", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("", { status: 500 }));

    await expect(revertHOPEToReview(SUBMISSION_ID, COOKIE)).rejects.toThrow(
      "Failed to revert to review",
    );
  });
});

// ── fetchQualityBenchmarks ────────────────────────────────────────────────────

describe("fetchQualityBenchmarks", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls GET /api/v1/analytics/quality-benchmarks with cookie", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleBenchmark), { status: 200 }),
    );

    const result = await fetchQualityBenchmarks(COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/analytics/quality-benchmarks",
      { headers: { cookie: COOKIE } },
    );
    expect(result.measures).toHaveLength(1);
    expect(result.measures[0]?.measureCode).toBe("NQF_3235");
  });

  it("returns all 4 HQRP measures when fully seeded", async () => {
    const fullBenchmark: HOPEQualityBenchmark = {
      ...sampleBenchmark,
      measures: [
        {
          measureCode: "NQF_3235",
          measureName: "Comprehensive Assessment",
          locationRate: 0.82,
          nationalAverage: 0.79,
          targetRate: 0.85,
          atRisk: false,
          trend: [],
        },
        {
          measureCode: "NQF_3633",
          measureName: "Treatment Preferences",
          locationRate: 0.71,
          nationalAverage: 0.68,
          targetRate: 0.75,
          atRisk: false,
          trend: [],
        },
        {
          measureCode: "NQF_3634A",
          measureName: "HVLDL Part A",
          locationRate: 0.64,
          nationalAverage: 0.61,
          targetRate: 0.7,
          atRisk: false,
          trend: [],
        },
        {
          measureCode: "HCI",
          measureName: "Hospice Care Index",
          locationRate: 0.55,
          nationalAverage: 0.52,
          targetRate: 0.6,
          atRisk: false,
          trend: [],
        },
      ],
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(fullBenchmark), { status: 200 }),
    );

    const result = await fetchQualityBenchmarks(COOKIE);
    expect(result.measures).toHaveLength(4);
    const codes = result.measures.map((m) => m.measureCode);
    expect(codes).toContain("NQF_3235");
    expect(codes).toContain("NQF_3633");
    expect(codes).toContain("NQF_3634A");
    expect(codes).toContain("HCI");
  });

  it("includes locationRate vs nationalAverage for each measure", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleBenchmark), { status: 200 }),
    );

    const result = await fetchQualityBenchmarks(COOKIE);
    const measure = result.measures[0];
    expect(measure?.locationRate).toBeGreaterThan(0);
    expect(measure?.nationalAverage).toBeGreaterThan(0);
    expect(measure?.targetRate).toBeGreaterThan(0);
  });

  it("throws on non-ok response", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "No reporting period found" } }), {
        status: 404,
      }),
    );

    await expect(fetchQualityBenchmarks(COOKIE)).rejects.toThrow("No reporting period found");
  });

  it("throws fallback on malformed error body", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("", { status: 500 }));

    await expect(fetchQualityBenchmarks(COOKIE)).rejects.toThrow(
      "Failed to fetch quality benchmarks",
    );
  });
});

// ── fetchHOPEDashboard (T3-1b) ────────────────────────────────────────────────

describe("fetchHOPEDashboard", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  const sampleDashboard: HOPEDashboardResponse = {
    dueToday: 1,
    due48h: 2,
    overdue: 0,
    needsSymptomFollowUp: 1,
    rejectedByIQIES: 0,
    readyToSubmit: 3,
    hqrpPenaltyRisk: false,
    assessmentList: [
      {
        id: ASSESSMENT_ID,
        patientName: "Jane Doe",
        assessmentType: "01",
        status: "ready_for_review",
        windowDeadline: "2026-03-15",
        completenessScore: 85,
        symptomFollowUpRequired: true,
        assignedClinicianId: CLINICIAN_ID,
        nextAction: "Submit for supervisor review",
      },
    ],
  };

  it("calls GET /api/v1/hope/dashboard with cookie", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleDashboard), { status: 200 }),
    );

    const result = await fetchHOPEDashboard(COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/hope/dashboard",
      { headers: { cookie: COOKIE } },
    );
    expect(result.dueToday).toBe(1);
    expect(result.due48h).toBe(2);
    expect(result.assessmentList).toHaveLength(1);
    expect(result.assessmentList[0]?.patientName).toBe("Jane Doe");
  });

  it("returns hqrpPenaltyRisk=true when quality measures below threshold", async () => {
    const atRisk: HOPEDashboardResponse = { ...sampleDashboard, hqrpPenaltyRisk: true };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(atRisk), { status: 200 }),
    );

    const result = await fetchHOPEDashboard(COOKIE);
    expect(result.hqrpPenaltyRisk).toBe(true);
  });

  it("returns zero counts when no active assessments", async () => {
    const empty: HOPEDashboardResponse = {
      dueToday: 0,
      due48h: 0,
      overdue: 0,
      needsSymptomFollowUp: 0,
      rejectedByIQIES: 0,
      readyToSubmit: 0,
      hqrpPenaltyRisk: false,
      assessmentList: [],
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(empty), { status: 200 }),
    );

    const result = await fetchHOPEDashboard(COOKIE);
    expect(result.assessmentList).toHaveLength(0);
    expect(result.dueToday).toBe(0);
  });

  it("throws on 401 unauthorized", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Unauthorized" } }), { status: 401 }),
    );

    await expect(fetchHOPEDashboard(COOKIE)).rejects.toThrow("Unauthorized");
  });

  it("throws fallback on malformed error body", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("", { status: 500 }));

    await expect(fetchHOPEDashboard(COOKIE)).rejects.toThrow("Failed to fetch HOPE dashboard");
  });
});

// ── fetchHOPEPatientTimeline (T3-1b) ─────────────────────────────────────────

describe("fetchHOPEPatientTimeline", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  const sampleTimeline: HOPEPatientTimeline = {
    patientId: PATIENT_ID,
    hopeA: {
      required: true,
      windowDeadline: "2026-03-08",
      status: "accepted",
      assessmentId: ASSESSMENT_ID,
    },
    hopeUV: {
      count: 3,
      lastFiledAt: "2026-03-01",
      nextDue: "2026-05-01",
    },
    hopeD: {
      required: false,
      windowDeadline: null,
      status: null,
      assessmentId: null,
    },
    symptomFollowUp: {
      required: false,
      dueAt: null,
      completed: true,
    },
    penaltyExposure: {
      atRisk: false,
      measureShortfalls: [],
    },
  };

  it("calls GET /api/v1/hope/patients/:id/timeline with cookie", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleTimeline), { status: 200 }),
    );

    const result = await fetchHOPEPatientTimeline(PATIENT_ID, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/hope/patients/${PATIENT_ID}/timeline`,
      { headers: { cookie: COOKIE } },
    );
    expect(result.patientId).toBe(PATIENT_ID);
    expect(result.hopeA.status).toBe("accepted");
    expect(result.hopeUV.count).toBe(3);
  });

  it("returns penalty exposure when measures below threshold", async () => {
    const atRisk: HOPEPatientTimeline = {
      ...sampleTimeline,
      penaltyExposure: { atRisk: true, measureShortfalls: ["NQF3235", "HCI"] },
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(atRisk), { status: 200 }),
    );

    const result = await fetchHOPEPatientTimeline(PATIENT_ID, COOKIE);
    expect(result.penaltyExposure.atRisk).toBe(true);
    expect(result.penaltyExposure.measureShortfalls).toContain("NQF3235");
  });

  it("returns symptom follow-up required when UV has high symptom burden", async () => {
    const withFollowUp: HOPEPatientTimeline = {
      ...sampleTimeline,
      symptomFollowUp: { required: true, dueAt: "2026-03-10", completed: false },
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(withFollowUp), { status: 200 }),
    );

    const result = await fetchHOPEPatientTimeline(PATIENT_ID, COOKIE);
    expect(result.symptomFollowUp.required).toBe(true);
    expect(result.symptomFollowUp.dueAt).toBe("2026-03-10");
  });

  it("throws on patient not found", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Patient not found" } }), { status: 404 }),
    );

    await expect(
      fetchHOPEPatientTimeline("00000000-0000-0000-0000-000000000000", COOKIE),
    ).rejects.toThrow("Patient not found");
  });

  it("throws fallback on malformed error body", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("", { status: 500 }));

    await expect(fetchHOPEPatientTimeline(PATIENT_ID, COOKIE)).rejects.toThrow(
      "Failed to fetch HOPE patient timeline",
    );
  });
});

// ── fetchHOPESubmissionsByAssessment (T3-1b) ──────────────────────────────────

describe("fetchHOPESubmissionsByAssessment", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  const sampleSubmissionList: HOPESubmissionListResponse = {
    assessmentId: ASSESSMENT_ID,
    data: [
      {
        ...sampleSubmission,
        attemptNumber: 1,
        submissionStatus: "rejected",
        rejectionCodes: ["WINDOW_VIOLATION"],
      },
      {
        ...sampleSubmission,
        id: "ffffffff-0000-0000-0000-000000000001",
        attemptNumber: 2,
        submissionStatus: "accepted",
      },
    ],
  };

  it("calls GET /api/v1/hope/assessments/:id/submissions with cookie", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleSubmissionList), { status: 200 }),
    );

    const result = await fetchHOPESubmissionsByAssessment(ASSESSMENT_ID, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/hope/assessments/${ASSESSMENT_ID}/submissions`,
      { headers: { cookie: COOKIE } },
    );
    expect(result.assessmentId).toBe(ASSESSMENT_ID);
    expect(result.data).toHaveLength(2);
  });

  it("returns rejection codes on failed submissions", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleSubmissionList), { status: 200 }),
    );

    const result = await fetchHOPESubmissionsByAssessment(ASSESSMENT_ID, COOKIE);
    expect(result.data[0]?.rejectionCodes).toContain("WINDOW_VIOLATION");
    expect(result.data[1]?.submissionStatus).toBe("accepted");
  });

  it("returns empty data array when no submissions yet", async () => {
    const empty: HOPESubmissionListResponse = { assessmentId: ASSESSMENT_ID, data: [] };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(empty), { status: 200 }),
    );

    const result = await fetchHOPESubmissionsByAssessment(ASSESSMENT_ID, COOKIE);
    expect(result.data).toHaveLength(0);
  });

  it("throws on non-ok response", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Assessment not found" } }), { status: 404 }),
    );

    await expect(
      fetchHOPESubmissionsByAssessment("00000000-0000-0000-0000-000000000000", COOKIE),
    ).rejects.toThrow("Assessment not found");
  });

  it("throws fallback on malformed error body", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("", { status: 500 }));

    await expect(fetchHOPESubmissionsByAssessment(ASSESSMENT_ID, COOKIE)).rejects.toThrow(
      "Failed to fetch HOPE submissions",
    );
  });
});
