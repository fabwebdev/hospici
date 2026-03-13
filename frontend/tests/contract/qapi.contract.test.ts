// tests/contract/qapi.contract.test.ts
// T3-11: QAPI Management + Clinician Quality Scorecards — contract tests

import { describe, expect, it } from "vitest";
import type {
  ClinicianQualityScorecard,
  DeficiencyTrendPoint,
  DeficiencyTrendReport,
  QAPIActionItem,
  QAPICloseBody,
  QAPICreateBody,
  QAPIEvent,
  QAPIEventListResponse,
  QualityOutlier,
  QualityOutlierListResponse,
  ScorecardListResponse,
} from "@hospici/shared-types";

// ── Fixtures ───────────────────────────────────────────────────────────────────

const UUID_1 = "00000000-0000-0000-0000-000000000001";
const UUID_2 = "00000000-0000-0000-0000-000000000002";
const UUID_3 = "00000000-0000-0000-0000-000000000003";
const UUID_4 = "00000000-0000-0000-0000-000000000004";

function makeActionItem(overrides: Partial<QAPIActionItem> = {}): QAPIActionItem {
  return {
    id: UUID_1,
    eventId: UUID_2,
    locationId: UUID_3,
    action: "Review clinician documentation checklist",
    assignedToId: UUID_4,
    assignedToName: "Jane Supervisor",
    dueDate: "2026-04-01",
    completedAt: null,
    completedById: null,
    createdAt: "2026-03-13T08:00:00.000Z",
    ...overrides,
  };
}

function makeQAPIEvent(overrides: Partial<QAPIEvent> = {}): QAPIEvent {
  return {
    id: UUID_1,
    locationId: UUID_2,
    eventType: "QUALITY_TREND",
    patientId: null,
    reportedById: UUID_3,
    reportedByName: "Dr. Smith",
    occurredAt: "2026-03-10T09:00:00.000Z",
    description: "First-pass approval rate dropped below 70% in Branch East for RN discipline",
    rootCauseAnalysis: null,
    linkedTrendContext: {
      metric: "firstPassRate",
      value: 0.68,
      threshold: 0.78,
    },
    status: "OPEN",
    closedAt: null,
    closedById: null,
    closureEvidence: null,
    actionItems: [],
    createdAt: "2026-03-13T08:00:00.000Z",
    updatedAt: "2026-03-13T08:00:00.000Z",
    ...overrides,
  };
}

function makeScorecard(overrides: Partial<ClinicianQualityScorecard> = {}): ClinicianQualityScorecard {
  return {
    clinicianId: UUID_1,
    clinicianName: "Alice Clinician",
    discipline: "RN",
    period: { from: "2026-01-01", to: "2026-03-13" },
    totalNotes: 42,
    firstPassApprovalRate: 0.786,
    averageRevisionCount: 0.71,
    medianTurnaroundHours: 18.5,
    overdueReviewRate: 0.048,
    billingImpactRate: 0.12,
    complianceImpactRate: 0.095,
    deficiencyBreakdown: {
      CLINICAL_SUPPORT: 8,
      SIGNATURE_MISSING: 5,
      CARE_PLAN_MISMATCH: 2,
    },
    commonDeficiencyTypes: [
      { type: "CLINICAL_SUPPORT", count: 8 },
      { type: "SIGNATURE_MISSING", count: 5 },
      { type: "CARE_PLAN_MISMATCH", count: 2 },
    ],
    revisionTrend: [
      { week: "2026-W01", count: 3 },
      { week: "2026-W02", count: 2 },
      { week: "2026-W03", count: 4 },
    ],
    ...overrides,
  };
}

function makeTrendPoint(week: string): DeficiencyTrendPoint {
  return {
    week,
    byType: { CLINICAL_SUPPORT: 4, SIGNATURE_MISSING: 2 },
    totalDeficiencies: 6,
    firstPassRate: 0.82,
  };
}

function makeDeficiencyReport(overrides: Partial<DeficiencyTrendReport> = {}): DeficiencyTrendReport {
  return {
    locationId: null,
    discipline: null,
    period: { from: "2026-01-01", to: "2026-03-13" },
    topDeficiencyTypes: [
      { type: "CLINICAL_SUPPORT", count: 42 },
      { type: "SIGNATURE_MISSING", count: 28 },
    ],
    trend: [makeTrendPoint("2026-W08"), makeTrendPoint("2026-W09"), makeTrendPoint("2026-W10")],
    branchComparison: [
      { locationId: UUID_1, locationName: "Branch East", firstPassRate: 0.82, totalDeficiencies: 15 },
      { locationId: UUID_2, locationName: "Branch West", firstPassRate: 0.71, totalDeficiencies: 24 },
    ],
    disciplineComparison: [
      { discipline: "RN", firstPassRate: 0.79, topDeficiency: "CLINICAL_SUPPORT" },
    ],
    branchDisciplineMatrix: [
      { locationId: UUID_1, discipline: "RN", firstPassRate: 0.82, deficiencyCount: 15 },
    ],
    reviewerWorkload: [
      { reviewerId: UUID_3, reviewerName: "Jane Supervisor", assigned: 80, resolved: 75, overdueCount: 3 },
    ],
    ...overrides,
  };
}

function makeOutlier(overrides: Partial<QualityOutlier> = {}): QualityOutlier {
  return {
    subjectType: "BRANCH",
    subjectId: UUID_1,
    subjectName: "Branch East",
    metric: "firstPassRate",
    value: 0.68,
    threshold: 0.78,
    detectedAt: "2026-03-13T08:00:00.000Z",
    ...overrides,
  };
}

// ── QAPI CreateBody validation ─────────────────────────────────────────────────

describe("QAPICreateBody", () => {
  it("accepts valid body", () => {
    const body: QAPICreateBody = {
      eventType: "QUALITY_TREND",
      occurredAt: "2026-03-10T09:00:00.000Z",
      description: "First-pass rate declined sharply",
    };
    expect(body.eventType).toBe("QUALITY_TREND");
    expect(body.description).toBeTruthy();
  });

  it("accepts all event types", () => {
    const types: QAPICreateBody["eventType"][] = [
      "ADVERSE_EVENT",
      "NEAR_MISS",
      "COMPLAINT",
      "GRIEVANCE",
      "QUALITY_TREND",
    ];
    for (const eventType of types) {
      const body: QAPICreateBody = {
        eventType,
        occurredAt: "2026-03-10T09:00:00.000Z",
        description: "Test",
      };
      expect(body.eventType).toBe(eventType);
    }
  });

  it("accepts optional linkedTrendContext", () => {
    const body: QAPICreateBody = {
      eventType: "QUALITY_TREND",
      occurredAt: "2026-03-10T09:00:00.000Z",
      description: "Trend anomaly detected",
      linkedTrendContext: { metric: "firstPassRate", value: 0.68, threshold: 0.78 },
    };
    expect(body.linkedTrendContext).toBeDefined();
  });
});

// ── QAPICloseBody validation ───────────────────────────────────────────────────

describe("QAPICloseBody", () => {
  it("accepts valid closure body", () => {
    const body: QAPICloseBody = {
      closureEvidence:
        "Root cause identified as training gap. Weekly coaching sessions implemented. First-pass rate returned to 82% over 4 weeks.",
    };
    expect(body.closureEvidence.length).toBeGreaterThanOrEqual(50);
  });
});

// ── QAPIEvent shape ────────────────────────────────────────────────────────────

describe("QAPIEvent", () => {
  it("has correct shape for OPEN event", () => {
    const event = makeQAPIEvent();
    expect(event.status).toBe("OPEN");
    expect(event.closedAt).toBeNull();
    expect(event.closedById).toBeNull();
    expect(event.closureEvidence).toBeNull();
    expect(Array.isArray(event.actionItems)).toBe(true);
  });

  it("has correct shape for CLOSED event", () => {
    const event = makeQAPIEvent({
      status: "CLOSED",
      closedAt: "2026-03-20T10:00:00.000Z",
      closedById: UUID_4,
      closureEvidence:
        "All corrective actions completed and verified. Training updated, QA metrics improved above threshold.",
    });
    expect(event.status).toBe("CLOSED");
    expect(event.closedAt).toBeTruthy();
    expect(typeof event.closureEvidence).toBe("string");
  });

  it("embeds action items correctly", () => {
    const event = makeQAPIEvent({
      status: "IN_PROGRESS",
      actionItems: [
        makeActionItem(),
        makeActionItem({ id: UUID_2, action: "Update training manual", completedAt: "2026-03-15T09:00:00.000Z" }),
      ],
    });
    expect(event.actionItems).toHaveLength(2);
    expect(event.actionItems[0]!.completedAt).toBeNull();
    expect(event.actionItems[1]!.completedAt).toBeTruthy();
  });
});

// ── QAPIEventListResponse ─────────────────────────────────────────────────────

describe("QAPIEventListResponse", () => {
  it("has correct pagination shape", () => {
    const response: QAPIEventListResponse = {
      data: [makeQAPIEvent(), makeQAPIEvent({ id: UUID_2, status: "IN_PROGRESS" })],
      total: 2,
    };
    expect(response.data).toHaveLength(2);
    expect(response.total).toBe(2);
  });
});

// ── ClinicianQualityScorecard ─────────────────────────────────────────────────

describe("ClinicianQualityScorecard", () => {
  it("has all 8 required metrics", () => {
    const sc = makeScorecard();
    expect(typeof sc.firstPassApprovalRate).toBe("number");
    expect(typeof sc.averageRevisionCount).toBe("number");
    expect(typeof sc.medianTurnaroundHours).toBe("number");
    expect(typeof sc.overdueReviewRate).toBe("number");
    expect(typeof sc.billingImpactRate).toBe("number");
    expect(typeof sc.complianceImpactRate).toBe("number");
    expect(typeof sc.deficiencyBreakdown).toBe("object");
    expect(Array.isArray(sc.revisionTrend)).toBe(true);
  });

  it("rates are within [0, 1]", () => {
    const sc = makeScorecard();
    expect(sc.firstPassApprovalRate).toBeGreaterThanOrEqual(0);
    expect(sc.firstPassApprovalRate).toBeLessThanOrEqual(1);
    expect(sc.overdueReviewRate).toBeGreaterThanOrEqual(0);
    expect(sc.overdueReviewRate).toBeLessThanOrEqual(1);
    expect(sc.billingImpactRate).toBeGreaterThanOrEqual(0);
    expect(sc.billingImpactRate).toBeLessThanOrEqual(1);
    expect(sc.complianceImpactRate).toBeGreaterThanOrEqual(0);
    expect(sc.complianceImpactRate).toBeLessThanOrEqual(1);
  });

  it("commonDeficiencyTypes is sorted descending by count", () => {
    const sc = makeScorecard();
    const counts = sc.commonDeficiencyTypes.map((d) => d.count);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]!).toBeLessThanOrEqual(counts[i - 1]!);
    }
  });

  it("accepts all discipline values", () => {
    const disciplines = ["RN", "SW", "CHAPLAIN", "THERAPY", "AIDE"] as const;
    for (const discipline of disciplines) {
      const sc = makeScorecard({ discipline });
      expect(sc.discipline).toBe(discipline);
    }
  });
});

// ── ScorecardListResponse ─────────────────────────────────────────────────────

describe("ScorecardListResponse", () => {
  it("includes period metadata", () => {
    const response: ScorecardListResponse = {
      data: [makeScorecard()],
      period: { from: "2026-01-01", to: "2026-03-13" },
    };
    expect(response.period.from).toBeTruthy();
    expect(response.period.to).toBeTruthy();
  });
});

// ── DeficiencyTrendReport ─────────────────────────────────────────────────────

describe("DeficiencyTrendReport", () => {
  it("has all required sections", () => {
    const report = makeDeficiencyReport();
    expect(Array.isArray(report.topDeficiencyTypes)).toBe(true);
    expect(Array.isArray(report.trend)).toBe(true);
    expect(Array.isArray(report.branchComparison)).toBe(true);
    expect(Array.isArray(report.disciplineComparison)).toBe(true);
    expect(Array.isArray(report.branchDisciplineMatrix)).toBe(true);
    expect(Array.isArray(report.reviewerWorkload)).toBe(true);
  });

  it("trend points have firstPassRate in [0,1]", () => {
    const report = makeDeficiencyReport();
    for (const pt of report.trend) {
      expect(pt.firstPassRate).toBeGreaterThanOrEqual(0);
      expect(pt.firstPassRate).toBeLessThanOrEqual(1);
    }
  });

  it("branch comparison has locationId and firstPassRate", () => {
    const report = makeDeficiencyReport();
    for (const b of report.branchComparison) {
      expect(b.locationId).toBeTruthy();
      expect(typeof b.firstPassRate).toBe("number");
      expect(typeof b.totalDeficiencies).toBe("number");
    }
  });

  it("accepts null locationId and discipline (global view)", () => {
    const report = makeDeficiencyReport({ locationId: null, discipline: null });
    expect(report.locationId).toBeNull();
    expect(report.discipline).toBeNull();
  });
});

// ── QualityOutlier ────────────────────────────────────────────────────────────

describe("QualityOutlier", () => {
  it("has correct shape for BRANCH outlier", () => {
    const outlier = makeOutlier();
    expect(outlier.subjectType).toBe("BRANCH");
    expect(outlier.metric).toBe("firstPassRate");
    expect(outlier.value).toBeLessThan(outlier.threshold);
  });

  it("has correct shape for CLINICIAN outlier", () => {
    const outlier = makeOutlier({
      subjectType: "CLINICIAN",
      subjectName: "Alice Clinician",
      metric: "billingImpactRate",
      value: 0.35,
      threshold: 0.2,
    });
    expect(outlier.subjectType).toBe("CLINICIAN");
    expect(outlier.value).toBeGreaterThan(outlier.threshold);
  });

  it("list response has period", () => {
    const response: QualityOutlierListResponse = {
      data: [makeOutlier()],
      period: { from: "2026-01-20", to: "2026-03-13" },
    };
    expect(response.period.from).toBeTruthy();
    expect(response.data[0]!.detectedAt).toBeTruthy();
  });
});

// ── Immutability invariant ─────────────────────────────────────────────────────

describe("QAPI event immutability", () => {
  it("CLOSED event has closure evidence and closedAt", () => {
    const event = makeQAPIEvent({
      status: "CLOSED",
      closedAt: "2026-03-20T10:00:00.000Z",
      closedById: UUID_4,
      closureEvidence:
        "All corrective actions completed and verified. Training updated, QA metrics improved above threshold.",
    });
    // Closed event must have evidence ≥ 50 chars
    expect(event.closureEvidence!.length).toBeGreaterThanOrEqual(50);
    expect(event.closedAt).not.toBeNull();
    expect(event.closedById).not.toBeNull();
  });
});
