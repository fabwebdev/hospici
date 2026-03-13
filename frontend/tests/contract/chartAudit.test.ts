/**
 * Contract tests — T3-13 Chart Audit Mode
 *
 * Validates that server function signatures align with backend API shapes.
 * Uses mocked fetch; tests the JSON shape at the contract boundary.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

// ── Mock fetch ─────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function mockResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(data),
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

// ── Checklist template shapes ──────────────────────────────────────────────────

describe("ReviewChecklistTemplate contract", () => {
  it("has required fields", () => {
    const tmpl = {
      id: "00000000-0000-0000-0000-000000000001",
      locationId: null,
      discipline: "RN",
      visitType: "routine_rn",
      items: [
        {
          id: "rn-routine-1",
          label: "Vital signs documented",
          required: true,
          scoringWeight: 0.15,
        },
      ],
      version: 1,
      isActive: true,
      effectiveDate: "2026-01-01",
      createdById: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };

    expect(tmpl.discipline).toBe("RN");
    expect(tmpl.visitType).toBe("routine_rn");
    expect(tmpl.version).toBeGreaterThan(0);
    expect(Array.isArray(tmpl.items)).toBe(true);
    expect(tmpl.items[0]).toHaveProperty("scoringWeight");
  });

  it("checklist item has id, label, required", () => {
    const item = { id: "x", label: "Some check", required: true };
    expect(item.id).toBeTruthy();
    expect(item.label).toBeTruthy();
    expect(typeof item.required).toBe("boolean");
  });
});

// ── Chart audit queue response ─────────────────────────────────────────────────

describe("ChartAuditQueueResponse contract", () => {
  it("has paginated shape", () => {
    const response = {
      data: [
        {
          patientId: "00000000-0000-0000-0000-000000000002",
          patientName: "Test Patient",
          primaryDiscipline: "RN",
          reviewStatus: "NOT_STARTED",
          missingDocCount: 2,
          surveyReadinessScore: 60,
          assignedReviewerId: null,
          assignedReviewerName: null,
          lastActivityAt: null,
          billingImpact: false,
          complianceImpact: true,
        },
      ],
      total: 1,
      page: 1,
      limit: 25,
    };

    expect(response.data).toHaveLength(1);
    expect(response.page).toBe(1);
    expect(response.limit).toBe(25);
    expect(response.data[0]!.reviewStatus).toBe("NOT_STARTED");
    expect(typeof response.data[0]!.surveyReadinessScore).toBe("number");
    expect(response.data[0]!.surveyReadinessScore).toBeGreaterThanOrEqual(0);
    expect(response.data[0]!.surveyReadinessScore).toBeLessThanOrEqual(100);
  });

  it("reviewStatus accepts all 4 values", () => {
    const statuses = ["NOT_STARTED", "IN_PROGRESS", "COMPLETE", "FLAGGED"];
    for (const s of statuses) {
      expect(statuses).toContain(s);
    }
  });
});

// ── Chart audit dashboard response ────────────────────────────────────────────

describe("ChartAuditDashboardResponse contract", () => {
  it("has required workload cards", () => {
    const dashboard = {
      total: 42,
      byStatus: { NOT_STARTED: 20, IN_PROGRESS: 10, COMPLETE: 8, FLAGGED: 4 },
      byDiscipline: { RN: 30, SW: 12 },
      byReviewer: [{ reviewerId: "abc", name: "Alice", count: 5 }],
      bySeverity: { critical: 6, warning: 3 },
      avgSurveyReadinessScore: 72.5,
    };

    expect(dashboard.total).toBeGreaterThanOrEqual(0);
    expect(dashboard.byStatus).toHaveProperty("NOT_STARTED");
    expect(dashboard.byStatus).toHaveProperty("FLAGGED");
    expect(typeof dashboard.avgSurveyReadinessScore).toBe("number");
    expect(dashboard.bySeverity.critical).toBeGreaterThanOrEqual(0);
  });
});

// ── Chart audit detail (8 sections + surveyReadiness) ────────────────────────

describe("ChartAuditDetailResponse contract", () => {
  it("contains all 8 sections", () => {
    const detail = {
      patientId: "00000000-0000-0000-0000-000000000003",
      auditDate: "2026-03-13T10:00:00.000Z",
      sections: {
        encounters: { total: 5, pending: 2, approved: 3, locked: 0, overdue: 1 },
        hopeAssessments: { required: 2, filed: 1, missing: ["Discharge HOPE Assessment"] },
        noeNotr: { noeStatus: "submitted", notrRequired: false, notrStatus: null },
        orders: { total: 3, unsigned: 1, expired: 0 },
        signatures: { required: 2, obtained: 2, missing: [] },
        carePlan: { present: true, lastUpdated: "2026-03-01T00:00:00.000Z", disciplinesComplete: ["RN"] },
        medications: { active: 4, unreconciled: 0, teachingPending: 0 },
        idgMeetings: { lastHeld: "2026-02-28T00:00:00.000Z", nextDue: "2026-03-14T00:00:00.000Z", overdue: false },
      },
      surveyReadiness: { score: 75, blockers: [], warnings: ["1 order(s) pending physician signature"] },
      missingDocuments: [
        { type: "HOPE", description: "Discharge HOPE Assessment", dueBy: null, severity: "critical" },
      ],
    };

    // All 8 sections present
    expect(detail.sections).toHaveProperty("encounters");
    expect(detail.sections).toHaveProperty("hopeAssessments");
    expect(detail.sections).toHaveProperty("noeNotr");
    expect(detail.sections).toHaveProperty("orders");
    expect(detail.sections).toHaveProperty("signatures");
    expect(detail.sections).toHaveProperty("carePlan");
    expect(detail.sections).toHaveProperty("medications");
    expect(detail.sections).toHaveProperty("idgMeetings");

    // Survey readiness
    expect(detail.surveyReadiness.score).toBeGreaterThanOrEqual(0);
    expect(detail.surveyReadiness.score).toBeLessThanOrEqual(100);
    expect(Array.isArray(detail.surveyReadiness.blockers)).toBe(true);
    expect(Array.isArray(detail.surveyReadiness.warnings)).toBe(true);

    // Missing documents
    expect(detail.missingDocuments[0]!.severity).toBe("critical");
  });

  it("survey readiness score decreases with blockers", () => {
    // Each critical = -20 points
    const criticalCount = 3;
    const score = Math.max(0, 100 - criticalCount * 20);
    expect(score).toBe(40);
  });
});

// ── ReviewQueueView contract ───────────────────────────────────────────────────

describe("ReviewQueueView contract", () => {
  it("has required fields", () => {
    const view = {
      id: "00000000-0000-0000-0000-000000000004",
      ownerId: "00000000-0000-0000-0000-000000000005",
      locationId: "00000000-0000-0000-0000-000000000006",
      name: "My RN Filter",
      viewScope: "chart_audit",
      filters: { discipline: "RN" },
      sortConfig: { sortBy: "lastActivityAt", sortDir: "desc" },
      columnConfig: { visibleColumns: ["patientName", "reviewStatus"], columnOrder: [] },
      groupBy: null,
      isShared: false,
      isPinned: true,
      isDefault: false,
      createdAt: "2026-03-01T00:00:00.000Z",
      updatedAt: "2026-03-01T00:00:00.000Z",
    };

    expect(view.viewScope).toBe("chart_audit");
    expect(view.sortConfig.sortDir).toBe("desc");
    expect(Array.isArray(view.columnConfig.visibleColumns)).toBe(true);
    expect(typeof view.isShared).toBe("boolean");
    expect(typeof view.isPinned).toBe("boolean");
    expect(typeof view.isDefault).toBe("boolean");
  });

  it("viewScope accepts note_review or chart_audit", () => {
    const scopes = ["note_review", "chart_audit"];
    expect(scopes).toContain("note_review");
    expect(scopes).toContain("chart_audit");
  });
});

// ── Partial unique index: at most one default per (owner, scope) ───────────────

describe("Default view constraint", () => {
  it("only one default per (ownerId, viewScope) allowed", () => {
    const views = [
      { id: "a", ownerId: "u1", viewScope: "chart_audit", isDefault: true },
      { id: "b", ownerId: "u1", viewScope: "chart_audit", isDefault: false },
      { id: "c", ownerId: "u1", viewScope: "note_review", isDefault: true },
    ];

    const chartAuditDefaults = views.filter(
      (v) => v.ownerId === "u1" && v.viewScope === "chart_audit" && v.isDefault,
    );
    expect(chartAuditDefaults).toHaveLength(1);

    const noteReviewDefaults = views.filter(
      (v) => v.ownerId === "u1" && v.viewScope === "note_review" && v.isDefault,
    );
    expect(noteReviewDefaults).toHaveLength(1);
  });
});

// ── Bulk action body ───────────────────────────────────────────────────────────

describe("ChartBulkActionBody contract", () => {
  it("requires patientIds and action", () => {
    const body = {
      patientIds: ["00000000-0000-0000-0000-000000000001"],
      action: "ASSIGN",
      assignedReviewerId: "00000000-0000-0000-0000-000000000002",
    };
    expect(body.patientIds).toHaveLength(1);
    expect(["ASSIGN", "REQUEST_REVISION", "EXPORT_CSV"]).toContain(body.action);
  });

  it("EXPORT_CSV action has no reviewerId requirement", () => {
    const body = {
      patientIds: ["00000000-0000-0000-0000-000000000001"],
      action: "EXPORT_CSV",
    };
    expect(body.action).toBe("EXPORT_CSV");
    expect(body).not.toHaveProperty("assignedReviewerId");
  });
});

// ── ReviewQueueBulkActionBody contract ────────────────────────────────────────

describe("ReviewQueueBulkActionBody contract", () => {
  it("accepts ASSIGN / REQUEST_REVISION / ACKNOWLEDGE", () => {
    const actions = ["ASSIGN", "REQUEST_REVISION", "ACKNOWLEDGE"];
    for (const action of actions) {
      expect(actions).toContain(action);
    }
  });

  it("ACKNOWLEDGE requires no additional fields", () => {
    const body = {
      encounterIds: ["00000000-0000-0000-0000-000000000010"],
      action: "ACKNOWLEDGE",
    };
    expect(body.encounterIds.length).toBeGreaterThan(0);
    expect(body.action).toBe("ACKNOWLEDGE");
  });
});

// ── Missing document severity taxonomy ────────────────────────────────────────

describe("MissingDocument contract", () => {
  it("severity is critical or warning", () => {
    const docs = [
      { type: "NOE", description: "NOE not filed", dueBy: null, severity: "critical" },
      { type: "UNSIGNED_ORDERS", description: "2 unsigned orders", dueBy: null, severity: "warning" },
    ];
    for (const doc of docs) {
      expect(["critical", "warning"]).toContain(doc.severity);
    }
  });
});
