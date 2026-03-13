// tests/contract/claimAudit.contract.test.ts
// Contract tests for Claim Audit Rules Engine server functions — T3-12

import type {
  AuditDashboardResponse,
  AuditResult,
  AuditSnapshotResponse,
} from "@hospici/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.server.js", () => ({
  env: { apiUrl: "http://localhost:3000", betterAuthSecret: "test" },
}));
vi.mock("vinxi/http", () => ({ getEvent: vi.fn(() => ({})) }));
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeader: vi.fn().mockReturnValue("session=test"),
}));

const chainable = {
  inputValidator: () => chainable,
  validator: () => chainable,
  handler: () => {},
};
vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => chainable,
}));

const {
  fetchAuditDashboard,
  fetchLatestAuditSnapshot,
  fetchAuditSnapshotHistory,
  runClaimAudit,
  overrideWarnFailure,
  bulkHoldClaims,
  bulkReleaseClaims,
} = await import("@/functions/claimAudit.functions.js");

const COOKIE = "session=test";
const CLAIM_ID = "00000000-0000-0000-0000-000000000002";

// ── Stub fixtures ─────────────────────────────────────────────────────────────

const DASHBOARD_STUB: AuditDashboardResponse = {
  claimStatusSummary: {
    readyToBill: 5,
    auditFailed: 2,
    onHold: 1,
    draft: 0,
    queued: 0,
    submitted: 3,
  },
  agingByRuleGroup: [
    {
      ruleGroup: "F2F_AND_CERTIFICATION",
      claimCount: 2,
      aging: { d0_2: 1, d3_7: 1, d8_14: 0, d14plus: 0 },
    },
  ],
  agingByHoldReason: [],
  agingByBranch: [],
  ownerLaneQueue: [
    { ownerRole: "billing", claimCount: 2, oldestAuditedAt: "2026-03-10T08:00:00Z" },
  ],
  topDenialDrivers: { data: [], availableAfter: "T3-7b" },
  warnOverrideVolume: [{ date: "2026-03-12", count: 1 }],
};

const AUDIT_RESULT_STUB: AuditResult = {
  snapshotId: "00000000-0000-0000-0000-000000000001",
  claimId: CLAIM_ID,
  locationId: "00000000-0000-0000-0000-000000000003",
  auditedAt: "2026-03-13T08:00:00Z",
  passed: false,
  blockCount: 1,
  warnCount: 0,
  failures: [
    {
      ruleGroup: "F2F_AND_CERTIFICATION",
      ruleCode: "F2F_DOC_BEFORE_RECERT_DATE",
      severity: "BLOCK",
      message: "Face-to-face not documented before recertification date.",
      sourceObject: "face_to_face_encounters",
      remediationCTA: "Record F2F documentation in Benefit Periods.",
      ownerRole: "clinician",
      claimBlocking: true,
    },
  ],
};

const SNAPSHOT_STUB: AuditSnapshotResponse = {
  id: "00000000-0000-0000-0000-000000000001",
  claimId: CLAIM_ID,
  claimRevisionId: null,
  locationId: "00000000-0000-0000-0000-000000000003",
  auditedAt: "2026-03-13T08:00:00Z",
  passed: false,
  blockCount: 1,
  warnCount: 0,
  failures: AUDIT_RESULT_STUB.failures,
  overrideTrail: [],
  auditedBy: null,
  createdAt: "2026-03-13T08:00:00Z",
};

// ── fetchAuditDashboard ───────────────────────────────────────────────────────

describe("fetchAuditDashboard", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => DASHBOARD_STUB,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns all 7 dashboard sections", async () => {
    const result = await fetchAuditDashboard(COOKIE);
    expect(result.claimStatusSummary.readyToBill).toBe(5);
    expect(result.claimStatusSummary.auditFailed).toBe(2);
    expect(result.agingByRuleGroup).toHaveLength(1);
    expect(result.topDenialDrivers.availableAfter).toBe("T3-7b");
    expect(result.warnOverrideVolume[0]?.date).toBe("2026-03-12");
  });

  it("throws with server error message on non-ok", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "Unauthorized" } }),
    });
    await expect(fetchAuditDashboard(COOKIE)).rejects.toThrow("Unauthorized");
  });

  it("throws generic message when no error body", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      json: async () => ({}),
    });
    await expect(fetchAuditDashboard(COOKIE)).rejects.toThrow(
      "Failed to fetch audit dashboard",
    );
  });
});

// ── runClaimAudit ─────────────────────────────────────────────────────────────

describe("runClaimAudit", () => {
  it("returns AuditResult with BLOCK failures", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => AUDIT_RESULT_STUB,
    });

    const result = await runClaimAudit(CLAIM_ID, COOKIE);

    expect(result.passed).toBe(false);
    expect(result.blockCount).toBe(1);
    expect(result.warnCount).toBe(0);
    expect(result.failures[0]?.severity).toBe("BLOCK");
    expect(result.failures[0]?.claimBlocking).toBe(true);
  });

  it("throws on claim not found", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "Claim not found" } }),
    });

    await expect(runClaimAudit("bad-id", COOKIE)).rejects.toThrow("Claim not found");
  });
});

// ── fetchLatestAuditSnapshot ──────────────────────────────────────────────────

describe("fetchLatestAuditSnapshot", () => {
  it("returns latest snapshot", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => SNAPSHOT_STUB,
    });

    const result = await fetchLatestAuditSnapshot(CLAIM_ID, COOKIE);

    expect(result.passed).toBe(false);
    expect(result.overrideTrail).toHaveLength(0);
    expect(result.failures).toHaveLength(1);
  });
});

// ── fetchAuditSnapshotHistory ─────────────────────────────────────────────────

describe("fetchAuditSnapshotHistory", () => {
  it("returns array of historical snapshots", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [SNAPSHOT_STUB],
    });

    const result = await fetchAuditSnapshotHistory(CLAIM_ID, COOKIE);

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]?.blockCount).toBe(1);
  });
});

// ── overrideWarnFailure ───────────────────────────────────────────────────────

describe("overrideWarnFailure", () => {
  it("returns updated snapshot with override trail entry", async () => {
    const updated: AuditSnapshotResponse = {
      ...SNAPSHOT_STUB,
      overrideTrail: [
        {
          ruleCode: "VISIT_COMPLETENESS",
          reason: "Visit was completed but documentation delayed",
          overriddenBy: "00000000-0000-0000-0000-000000000010",
          overriddenAt: "2026-03-13T09:00:00Z",
        },
      ],
    };

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => updated,
    });

    const result = await overrideWarnFailure(
      CLAIM_ID,
      { ruleCode: "VISIT_COMPLETENESS", reason: "Visit was completed but documentation delayed" },
      COOKIE,
    );

    expect(result.overrideTrail).toHaveLength(1);
    expect(result.overrideTrail[0]?.ruleCode).toBe("VISIT_COMPLETENESS");
  });
});

// ── bulkHoldClaims ────────────────────────────────────────────────────────────

describe("bulkHoldClaims", () => {
  it("returns heldCount on atomic success", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ heldCount: 3 }),
    });

    const result = await bulkHoldClaims(
      { claimIds: ["id1", "id2", "id3"], holdReason: "COMPLIANCE_BLOCK" },
      COOKIE,
    );

    expect(result.heldCount).toBe(3);
  });

  it("throws and rolls back on failure (atomic)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "Transaction rolled back" } }),
    });

    await expect(
      bulkHoldClaims({ claimIds: ["id1", "id2"], holdReason: "MANUAL_REVIEW" }, COOKIE),
    ).rejects.toThrow("Transaction rolled back");
  });
});

// ── bulkReleaseClaims ──────────────────────────────────────────────────────────

describe("bulkReleaseClaims", () => {
  it("returns releasedCount on success", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ releasedCount: 2 }),
    });

    const result = await bulkReleaseClaims({ claimIds: ["id1", "id2"] }, COOKIE);

    expect(result.releasedCount).toBe(2);
  });
});
