// tests/contract/noteReview.functions.test.ts
// Contract tests for note review server function handlers

import type { ReviewQueueItem, ReviewQueueResponse } from "@hospici/shared-types";
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

const {
  fetchReviewQueue,
  submitReview,
  assignReviewer,
  escalateReview,
  fetchReviewHistory,
  bulkAcknowledge,
} = await import("@/functions/noteReview.functions.js");

const COOKIE = "session=test";
const ENCOUNTER_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const PATIENT_ID = "bbbbbbbb-0000-0000-0000-000000000001";
const LOCATION_ID = "cccccccc-0000-0000-0000-000000000001";
const CLINICIAN_ID = "dddddddd-0000-0000-0000-000000000001";
const REVIEWER_ID = "eeeeeeee-0000-0000-0000-000000000001";

const sampleItem: ReviewQueueItem = {
  encounterId: ENCOUNTER_ID,
  patientId: PATIENT_ID,
  patientName: "Jane Smith",
  locationId: LOCATION_ID,
  clinicianId: CLINICIAN_ID,
  visitType: "routine_rn",
  visitedAt: "2026-03-10T10:00:00.000Z",
  reviewStatus: "PENDING",
  reviewerId: null,
  reviewedAt: null,
  escalatedAt: null,
  escalationReason: null,
  revisionRequests: [],
  priority: 0,
  assignedReviewerId: null,
  dueBy: null,
  billingImpact: false,
  complianceImpact: false,
  firstPassApproved: false,
  revisionCount: 0,
  vantageChartDraft: "Patient reported stable pain at 3/10.",
  createdAt: "2026-03-10T10:00:00.000Z",
  updatedAt: "2026-03-10T10:00:00.000Z",
};

const sampleQueue: ReviewQueueResponse = {
  data: [sampleItem],
  total: 1,
};

// ── fetchReviewQueue ──────────────────────────────────────────────────────────

describe("fetchReviewQueue", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls GET /api/v1/review-queue with cookie", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleQueue), { status: 200 }),
    );

    const result = await fetchReviewQueue(COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/review-queue",
      { headers: { cookie: COOKIE } },
    );
    expect(result.total).toBe(1);
    expect(result.data[0]?.encounterId).toBe(ENCOUNTER_ID);
  });

  it("passes filter params as query string", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [], total: 0 }), { status: 200 }),
    );

    await fetchReviewQueue(COOKIE, { status: "PENDING", billingImpact: true });

    const url = vi.mocked(global.fetch).mock.calls[0]?.[0] as string;
    expect(url).toContain("status=PENDING");
    expect(url).toContain("billingImpact=true");
  });

  it("throws on non-ok response", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Forbidden" } }), { status: 403 }),
    );

    await expect(fetchReviewQueue(COOKIE)).rejects.toThrow("Forbidden");
  });

  it("throws with fallback on malformed error body", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("bad", { status: 500 }));

    await expect(fetchReviewQueue(COOKIE)).rejects.toThrow("Failed to fetch review queue");
  });
});

// ── submitReview ──────────────────────────────────────────────────────────────

describe("submitReview", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls POST /encounters/:id/review with status body", async () => {
    const approved = { ...sampleItem, reviewStatus: "APPROVED" as const };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(approved), { status: 200 }),
    );

    const result = await submitReview(ENCOUNTER_ID, { status: "APPROVED" }, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/encounters/${ENCOUNTER_ID}/review`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: expect.stringContaining('"status":"APPROVED"'),
      }),
    );
    expect(result.reviewStatus).toBe("APPROVED");
  });

  it("submits revision request with deficiency list", async () => {
    const withRevision = {
      ...sampleItem,
      reviewStatus: "REVISION_REQUESTED" as const,
      revisionCount: 1,
      revisionRequests: [
        {
          id: "ffffffff-0000-0000-0000-000000000001",
          deficiencyType: "CLINICAL_SUPPORT" as const,
          comment: "Missing pain assessment detail",
          severity: "medium" as const,
          dueBy: "2026-03-17",
          resolvedAt: null,
          resolvedComment: null,
        },
      ],
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(withRevision), { status: 200 }),
    );

    const result = await submitReview(
      ENCOUNTER_ID,
      {
        status: "REVISION_REQUESTED",
        revisionRequests: withRevision.revisionRequests,
      },
      COOKIE,
    );

    expect(result.reviewStatus).toBe("REVISION_REQUESTED");
    expect(result.revisionRequests).toHaveLength(1);
    expect(result.revisionRequests[0]?.deficiencyType).toBe("CLINICAL_SUPPORT");
  });

  it("throws INVALID_TRANSITION error with code", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message: "Invalid transition: APPROVED → IN_REVIEW",
            code: "INVALID_TRANSITION",
          },
        }),
        { status: 422 },
      ),
    );

    const err = (await submitReview(ENCOUNTER_ID, { status: "IN_REVIEW" }, COOKIE).catch(
      (e: unknown) => e,
    )) as Error & { code?: string };
    expect(err.message).toContain("Invalid transition");
    expect(err.code).toBe("INVALID_TRANSITION");
  });

  it("throws NOTE_LOCKED on attempt to edit approved note", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { message: "APPROVED and LOCKED notes cannot be edited", code: "NOTE_LOCKED" },
        }),
        { status: 422 },
      ),
    );

    const err = (await submitReview(ENCOUNTER_ID, { status: "IN_REVIEW" }, COOKIE).catch(
      (e: unknown) => e,
    )) as Error & { code?: string };
    expect(err.code).toBe("NOTE_LOCKED");
  });
});

// ── assignReviewer ────────────────────────────────────────────────────────────

describe("assignReviewer", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls PATCH /review-queue/:id/assign", async () => {
    const assigned = { ...sampleItem, assignedReviewerId: REVIEWER_ID };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(assigned), { status: 200 }),
    );

    const result = await assignReviewer(ENCOUNTER_ID, { assignedReviewerId: REVIEWER_ID }, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/review-queue/${ENCOUNTER_ID}/assign`,
      expect.objectContaining({ method: "PATCH" }),
    );
    expect(result.assignedReviewerId).toBe(REVIEWER_ID);
  });

  it("throws 404 when encounter not found", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Encounter not found" } }), { status: 404 }),
    );

    await expect(
      assignReviewer(ENCOUNTER_ID, { assignedReviewerId: REVIEWER_ID }, COOKIE),
    ).rejects.toThrow("Encounter not found");
  });
});

// ── escalateReview ────────────────────────────────────────────────────────────

describe("escalateReview", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls POST /encounters/:id/review/escalate with reason", async () => {
    const escalated = { ...sampleItem, reviewStatus: "ESCALATED" as const };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(escalated), { status: 200 }),
    );

    const result = await escalateReview(
      ENCOUNTER_ID,
      { escalationReason: "Compliance risk — immediate DON review required" },
      COOKIE,
    );

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/encounters/${ENCOUNTER_ID}/review/escalate`,
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("escalationReason"),
      }),
    );
    expect(result.reviewStatus).toBe("ESCALATED");
  });

  it("throws ESCALATION_REASON_REQUIRED when reason is empty", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { message: "escalationReason is required", code: "ESCALATION_REASON_REQUIRED" },
        }),
        { status: 400 },
      ),
    );

    const err = (await escalateReview(ENCOUNTER_ID, { escalationReason: "" }, COOKIE).catch(
      (e: unknown) => e,
    )) as Error & { code?: string };
    expect(err.code).toBe("ESCALATION_REASON_REQUIRED");
  });
});

// ── bulkAcknowledge ───────────────────────────────────────────────────────────

describe("bulkAcknowledge", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls POST /review-queue/acknowledge with encounterIds array", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ acknowledged: 3 }), { status: 200 }),
    );

    const ids = [
      ENCOUNTER_ID,
      "aaaaaaaa-0000-0000-0000-000000000002",
      "aaaaaaaa-0000-0000-0000-000000000003",
    ];
    const result = await bulkAcknowledge({ encounterIds: ids }, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/review-queue/acknowledge",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("encounterIds"),
      }),
    );
    expect(result.acknowledged).toBe(3);
  });

  it("throws on non-ok response", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Bad request" } }), { status: 400 }),
    );

    await expect(bulkAcknowledge({ encounterIds: [ENCOUNTER_ID] }, COOKIE)).rejects.toThrow(
      "Bad request",
    );
  });
});

// ── fetchReviewHistory ────────────────────────────────────────────────────────

describe("fetchReviewHistory", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls GET /encounters/:id/review/history", async () => {
    const historyResponse = {
      encounterId: ENCOUNTER_ID,
      currentStatus: "IN_REVIEW",
      currentDraft: "Patient stable.",
      history: [],
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(historyResponse), { status: 200 }),
    );

    const result = await fetchReviewHistory(ENCOUNTER_ID, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/encounters/${ENCOUNTER_ID}/review/history`,
      { headers: { cookie: COOKIE } },
    );
    expect(result.encounterId).toBe(ENCOUNTER_ID);
    expect(result.currentStatus).toBe("IN_REVIEW");
  });

  it("throws 404 when encounter not found", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Encounter not found" } }), { status: 404 }),
    );

    await expect(fetchReviewHistory(ENCOUNTER_ID, COOKIE)).rejects.toThrow("Encounter not found");
  });
});
