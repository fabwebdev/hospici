// tests/contract/noe.functions.test.ts
// Contract tests for NOE/NOTR filing workbench server function handlers — T3-2a

import type {
  FilingQueueResponse,
  FilingHistoryEvent,
  NOEResponse,
  NOEWithHistoryResponse,
  NOTRResponse,
  ReadinessResponse,
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

const {
  fetchNOE,
  createNOE,
  submitNOE,
  correctNOE,
  lateOverrideNOE,
  fetchNOEReadiness,
  fetchNOEHistory,
  fetchNOTR,
  createNOTR,
  submitNOTR,
  fetchFilingQueue,
} = await import("@/functions/noe.functions.js");

const COOKIE = "session=test";
const PATIENT_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const NOE_ID = "bbbbbbbb-0000-0000-0000-000000000001";
const NOTR_ID = "cccccccc-0000-0000-0000-000000000001";
const LOCATION_ID = "dddddddd-0000-0000-0000-000000000001";
const USER_ID = "eeeeeeee-0000-0000-0000-000000000001";

const sampleNOE: NOEResponse = {
  id: NOE_ID,
  patientId: PATIENT_ID,
  locationId: LOCATION_ID,
  status: "draft",
  electionDate: "2026-03-10",
  deadlineDate: "2026-03-17",
  isLate: false,
  lateReason: null,
  overrideApprovedBy: null,
  overrideApprovedAt: null,
  overrideReason: null,
  submittedAt: null,
  submittedByUserId: null,
  responseCode: null,
  responseMessage: null,
  attemptCount: 1,
  correctedFromId: null,
  isClaimBlocking: false,
  createdAt: "2026-03-10T10:00:00.000Z",
  updatedAt: "2026-03-10T10:00:00.000Z",
};

const sampleHistoryEvent: FilingHistoryEvent = {
  event: "NOE_CREATED",
  timestamp: "2026-03-10T10:00:00.000Z",
  userId: USER_ID,
};

const sampleNOEWithHistory: NOEWithHistoryResponse = {
  noe: sampleNOE,
  history: [sampleHistoryEvent],
};

const sampleNOTR: NOTRResponse = {
  id: NOTR_ID,
  noeId: NOE_ID,
  patientId: PATIENT_ID,
  locationId: LOCATION_ID,
  status: "draft",
  revocationDate: "2026-03-20",
  revocationReason: "patient_revoked",
  deadlineDate: "2026-03-27",
  isLate: false,
  lateReason: null,
  overrideApprovedBy: null,
  overrideApprovedAt: null,
  overrideReason: null,
  receivingHospiceId: null,
  receivingHospiceName: null,
  transferDate: null,
  submittedAt: null,
  submittedByUserId: null,
  responseCode: null,
  responseMessage: null,
  attemptCount: 1,
  correctedFromId: null,
  isClaimBlocking: false,
  createdAt: "2026-03-20T10:00:00.000Z",
  updatedAt: "2026-03-20T10:00:00.000Z",
};

const sampleReadiness: ReadinessResponse = {
  ready: true,
  checklist: [
    { check: "Election date set", passed: true },
    { check: "No existing accepted NOE for this period", passed: true },
  ],
};

const sampleQueue: FilingQueueResponse = {
  data: [
    {
      id: NOE_ID,
      type: "NOE",
      patientId: PATIENT_ID,
      locationId: LOCATION_ID,
      status: "ready_for_submission",
      deadlineDate: "2026-03-17",
      isLate: false,
      isClaimBlocking: false,
      attemptCount: 1,
      createdAt: "2026-03-10T10:00:00.000Z",
      updatedAt: "2026-03-10T10:00:00.000Z",
    },
  ],
  total: 1,
};

// ── fetchNOE ──────────────────────────────────────────────────────────────────

describe("fetchNOE", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls GET /api/v1/patients/:id/noe with cookie", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleNOEWithHistory), { status: 200 }),
    );

    const result = await fetchNOE(PATIENT_ID, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/patients/${PATIENT_ID}/noe`,
      { headers: { cookie: COOKIE } },
    );
    expect(result.noe.id).toBe(NOE_ID);
    expect(result.history).toHaveLength(1);
  });

  it("throws on non-ok response", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Not Found" } }), { status: 404 }),
    );

    await expect(fetchNOE(PATIENT_ID, COOKIE)).rejects.toThrow("Not Found");
  });

  it("throws with fallback message on malformed error", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("bad", { status: 500 }));

    await expect(fetchNOE(PATIENT_ID, COOKIE)).rejects.toThrow("Failed to fetch NOE");
  });
});

// ── createNOE ─────────────────────────────────────────────────────────────────

describe("createNOE", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls POST /api/v1/patients/:id/noe with electionDate", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleNOE), { status: 201 }),
    );

    const result = await createNOE(PATIENT_ID, { electionDate: "2026-03-10" }, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/patients/${PATIENT_ID}/noe`,
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"electionDate":"2026-03-10"'),
      }),
    );
    expect(result.status).toBe("draft");
    expect(result.deadlineDate).toBe("2026-03-17");
  });

  it("throws with error code on duplicate NOE", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { message: "NOE already exists for this patient", code: "DUPLICATE_NOE" },
        }),
        { status: 409 },
      ),
    );

    const err = (await createNOE(
      PATIENT_ID,
      { electionDate: "2026-03-10" },
      COOKIE,
    ).catch((e: unknown) => e)) as Error & { code?: string };
    expect(err.code).toBe("DUPLICATE_NOE");
  });
});

// ── submitNOE ─────────────────────────────────────────────────────────────────

describe("submitNOE", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls POST /api/v1/noe/:id/submit", async () => {
    const submitted: NOEResponse = {
      ...sampleNOE,
      status: "submitted",
      submittedAt: "2026-03-12T10:00:00.000Z",
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(submitted), { status: 200 }),
    );

    const result = await submitNOE(NOE_ID, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/noe/${NOE_ID}/submit`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.status).toBe("submitted");
  });

  it("throws INVALID_TRANSITION on bad state", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message: "Cannot transition from draft to submitted",
            code: "INVALID_TRANSITION",
          },
        }),
        { status: 422 },
      ),
    );

    const err = (await submitNOE(NOE_ID, COOKIE).catch(
      (e: unknown) => e,
    )) as Error & { code?: string };
    expect(err.code).toBe("INVALID_TRANSITION");
  });
});

// ── correctNOE ────────────────────────────────────────────────────────────────

describe("correctNOE", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls POST /api/v1/noe/:id/correct with new electionDate", async () => {
    const corrected: NOEResponse = {
      ...sampleNOE,
      id: "eeeeeeee-0000-0000-0000-000000000001",
      status: "ready_for_submission",
      correctedFromId: NOE_ID,
      attemptCount: 2,
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(corrected), { status: 201 }),
    );

    const result = await correctNOE(NOE_ID, { electionDate: "2026-03-11" }, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/noe/${NOE_ID}/correct`,
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"electionDate":"2026-03-11"'),
      }),
    );
    expect(result.correctedFromId).toBe(NOE_ID);
    expect(result.attemptCount).toBe(2);
  });
});

// ── lateOverrideNOE ───────────────────────────────────────────────────────────

describe("lateOverrideNOE", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls POST /api/v1/noe/:id/late-override with reason", async () => {
    const overridden: NOEResponse = {
      ...sampleNOE,
      status: "submitted",
      overrideReason: "Weekend admission delay",
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(overridden), { status: 200 }),
    );

    const result = await lateOverrideNOE(
      NOE_ID,
      { overrideReason: "Weekend admission delay — patient transferred on Friday" },
      COOKIE,
    );

    expect(result.status).toBe("submitted");
  });

  it("throws 403 FORBIDDEN when not supervisor/admin", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { message: "Supervisor role required", code: "FORBIDDEN" },
        }),
        { status: 403 },
      ),
    );

    const err = (await lateOverrideNOE(
      NOE_ID,
      { overrideReason: "Some reason that is long enough to pass" },
      COOKIE,
    ).catch((e: unknown) => e)) as Error & { code?: string };
    expect(err.code).toBe("FORBIDDEN");
  });
});

// ── fetchNOEReadiness ─────────────────────────────────────────────────────────

describe("fetchNOEReadiness", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("returns readiness checklist", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleReadiness), { status: 200 }),
    );

    const result = await fetchNOEReadiness(NOE_ID, COOKIE);

    expect(result.ready).toBe(true);
    expect(result.checklist).toHaveLength(2);
    expect(result.checklist.every((c) => c.passed)).toBe(true);
  });

  it("returns not-ready with failed items", async () => {
    const notReady: ReadinessResponse = {
      ready: false,
      checklist: [
        { check: "Election date set", passed: false, message: "electionDate is required" },
      ],
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(notReady), { status: 200 }),
    );

    const result = await fetchNOEReadiness(NOE_ID, COOKIE);
    expect(result.ready).toBe(false);
    expect(result.checklist[0]?.passed).toBe(false);
  });
});

// ── fetchNOEHistory ───────────────────────────────────────────────────────────

describe("fetchNOEHistory", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("returns history events with event and userId fields", async () => {
    const historyResponse = {
      events: [
        { event: "NOE_CREATED", timestamp: "2026-03-10T10:00:00.000Z", userId: USER_ID },
        { event: "NOE_SUBMITTED", timestamp: "2026-03-12T10:00:00.000Z", userId: USER_ID },
      ] satisfies FilingHistoryEvent[],
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(historyResponse), { status: 200 }),
    );

    const result = await fetchNOEHistory(NOE_ID, COOKIE);

    expect(result.events).toHaveLength(2);
    expect(result.events[1]?.event).toBe("NOE_SUBMITTED");
  });
});

// ── fetchNOTR ─────────────────────────────────────────────────────────────────

describe("fetchNOTR", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls GET /api/v1/patients/:id/notr with cookie", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ notr: sampleNOTR, history: [] }),
        { status: 200 },
      ),
    );

    const result = await fetchNOTR(PATIENT_ID, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/patients/${PATIENT_ID}/notr`,
      { headers: { cookie: COOKIE } },
    );
    expect(result.notr.id).toBe(NOTR_ID);
    expect(result.notr.revocationReason).toBe("patient_revoked");
  });
});

// ── createNOTR ────────────────────────────────────────────────────────────────

describe("createNOTR", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("creates NOTR for patient_revoked reason", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleNOTR), { status: 201 }),
    );

    const result = await createNOTR(
      PATIENT_ID,
      { revocationDate: "2026-03-20", revocationReason: "patient_revoked" },
      COOKIE,
    );

    expect(result.status).toBe("draft");
    expect(result.deadlineDate).toBe("2026-03-27");
  });

  it("creates NOTR with transfer fields for patient_transferred", async () => {
    const transferNOTR: NOTRResponse = {
      ...sampleNOTR,
      revocationReason: "patient_transferred",
      receivingHospiceId: "1234567890",
      receivingHospiceName: "Valley Hospice",
      transferDate: "2026-03-21",
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(transferNOTR), { status: 201 }),
    );

    const result = await createNOTR(
      PATIENT_ID,
      {
        revocationDate: "2026-03-20",
        revocationReason: "patient_transferred",
        receivingHospiceId: "1234567890",
        receivingHospiceName: "Valley Hospice",
        transferDate: "2026-03-21",
      },
      COOKIE,
    );

    expect(result.receivingHospiceId).toBe("1234567890");
    expect(result.transferDate).toBe("2026-03-21");
  });

  it("throws TRANSFER_FIELDS_REQUIRED when missing transfer fields", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message: "Transfer NOTR requires receivingHospiceId and transferDate",
            code: "TRANSFER_FIELDS_REQUIRED",
          },
        }),
        { status: 422 },
      ),
    );

    const err = (await createNOTR(
      PATIENT_ID,
      { revocationDate: "2026-03-20", revocationReason: "patient_transferred" },
      COOKIE,
    ).catch((e: unknown) => e)) as Error & { code?: string };
    expect(err.code).toBe("TRANSFER_FIELDS_REQUIRED");
  });
});

// ── submitNOTR ────────────────────────────────────────────────────────────────

describe("submitNOTR", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls POST /api/v1/notr/:id/submit", async () => {
    const submitted: NOTRResponse = {
      ...sampleNOTR,
      status: "submitted",
      submittedAt: "2026-03-21T10:00:00.000Z",
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(submitted), { status: 200 }),
    );

    const result = await submitNOTR(NOTR_ID, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/notr/${NOTR_ID}/submit`,
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.status).toBe("submitted");
  });
});

// ── fetchFilingQueue ──────────────────────────────────────────────────────────

describe("fetchFilingQueue", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls GET /api/v1/filings/queue without params", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleQueue), { status: 200 }),
    );

    const result = await fetchFilingQueue({}, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/filings/queue",
      { headers: { cookie: COOKIE } },
    );
    expect(result.total).toBe(1);
    expect(result.data[0]?.type).toBe("NOE");
  });

  it("appends type=NOE query param", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleQueue), { status: 200 }),
    );

    await fetchFilingQueue({ type: "NOE" }, COOKIE);

    const callUrl = vi.mocked(global.fetch).mock.calls[0]?.[0] as string;
    expect(callUrl).toContain("type=NOE");
  });

  it("appends status=rejected query param", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [], total: 0 }), { status: 200 }),
    );

    await fetchFilingQueue({ status: "rejected" }, COOKIE);

    const callUrl = vi.mocked(global.fetch).mock.calls[0]?.[0] as string;
    expect(callUrl).toContain("status=rejected");
  });

  it("appends isLate=true filter", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [], total: 0 }), { status: 200 }),
    );

    await fetchFilingQueue({ isLate: true }, COOKIE);

    const callUrl = vi.mocked(global.fetch).mock.calls[0]?.[0] as string;
    expect(callUrl).toContain("isLate=true");
  });

  it("throws on non-ok response", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { message: "Unauthorized" } }),
        { status: 401 },
      ),
    );

    await expect(fetchFilingQueue({}, COOKIE)).rejects.toThrow("Unauthorized");
  });
});
