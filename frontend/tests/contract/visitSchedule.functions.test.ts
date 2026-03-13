// tests/contract/visitSchedule.functions.test.ts
// Contract tests for visit schedule server function handlers

import type { ScheduledVisitListResponse, ScheduledVisitResponse } from "@hospici/shared-types";
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

const { fetchScheduledVisits, createScheduledVisit, patchVisitStatus } = await import(
  "@/functions/visitSchedule.functions.js"
);

const COOKIE = "session=test";
const PATIENT_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const VISIT_ID = "bbbbbbbb-0000-0000-0000-000000000001";
const LOCATION_ID = "cccccccc-0000-0000-0000-000000000001";

const sampleVisit: ScheduledVisitResponse = {
  id: VISIT_ID,
  patientId: PATIENT_ID,
  locationId: LOCATION_ID,
  clinicianId: null,
  visitType: "routine_rn",
  discipline: "RN",
  scheduledDate: "2026-03-20",
  frequencyPlan: { visitsPerWeek: 3 },
  status: "scheduled",
  completedAt: null,
  cancelledAt: null,
  missedReason: null,
  notes: null,
  createdAt: "2026-03-12T10:00:00.000Z",
  updatedAt: "2026-03-12T10:00:00.000Z",
};

const sampleList: ScheduledVisitListResponse = {
  data: [sampleVisit],
  total: 1,
};

// ── fetchScheduledVisits ──────────────────────────────────────────────────────

describe("fetchScheduledVisits", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls GET /api/v1/patients/:id/scheduled-visits with cookie", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleList), { status: 200 }),
    );

    const result = await fetchScheduledVisits(PATIENT_ID, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/patients/${PATIENT_ID}/scheduled-visits`,
      { headers: { cookie: COOKIE } },
    );
    expect(result.total).toBe(1);
    expect(result.data[0]?.id).toBe(VISIT_ID);
  });

  it("returns empty list when no visits", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [], total: 0 }), { status: 200 }),
    );

    const result = await fetchScheduledVisits(PATIENT_ID, COOKIE);

    expect(result.total).toBe(0);
    expect(result.data).toHaveLength(0);
  });

  it("throws on non-ok response", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Forbidden" } }), { status: 403 }),
    );

    await expect(fetchScheduledVisits(PATIENT_ID, COOKIE)).rejects.toThrow("Forbidden");
  });

  it("throws with fallback on malformed error body", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("bad", { status: 500 }));

    await expect(fetchScheduledVisits(PATIENT_ID, COOKIE)).rejects.toThrow(
      "Failed to fetch scheduled visits",
    );
  });
});

// ── createScheduledVisit ──────────────────────────────────────────────────────

describe("createScheduledVisit", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  const createBody = {
    visitType: "routine_rn",
    discipline: "RN" as const,
    scheduledDate: "2026-03-20",
    frequencyPlan: { visitsPerWeek: 3 },
  };

  it("calls POST /api/v1/patients/:id/scheduled-visits with body", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleVisit), { status: 201 }),
    );

    const result = await createScheduledVisit(PATIENT_ID, createBody, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/patients/${PATIENT_ID}/scheduled-visits`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
        body: expect.stringContaining('"visitType":"routine_rn"'),
      }),
    );
    expect(result.id).toBe(VISIT_ID);
    expect(result.status).toBe("scheduled");
  });

  it("creates visit with optional clinicianId and notes", async () => {
    const withOptionals: ScheduledVisitResponse = {
      ...sampleVisit,
      clinicianId: "dddddddd-0000-0000-0000-000000000001",
      notes: "Per POC order",
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(withOptionals), { status: 201 }),
    );

    const result = await createScheduledVisit(
      PATIENT_ID,
      {
        ...createBody,
        clinicianId: "dddddddd-0000-0000-0000-000000000001",
        notes: "Per POC order",
      },
      COOKIE,
    );

    expect(result.clinicianId).toBe("dddddddd-0000-0000-0000-000000000001");
    expect(result.notes).toBe("Per POC order");
  });

  it("throws with error code on 422", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { message: "Invalid discipline", code: "VALIDATION_ERROR" } }),
        { status: 422 },
      ),
    );

    const err = (await createScheduledVisit(PATIENT_ID, createBody, COOKIE).catch(
      (e: unknown) => e,
    )) as Error & { code?: string };
    expect(err.code).toBe("VALIDATION_ERROR");
  });
});

// ── patchVisitStatus ──────────────────────────────────────────────────────────

describe("patchVisitStatus", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("marks visit as completed", async () => {
    const completed: ScheduledVisitResponse = {
      ...sampleVisit,
      status: "completed",
      completedAt: "2026-03-20T10:00:00.000Z",
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(completed), { status: 200 }),
    );

    const result = await patchVisitStatus(VISIT_ID, { status: "completed" }, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/scheduled-visits/${VISIT_ID}/status`,
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining('"status":"completed"'),
      }),
    );
    expect(result.status).toBe("completed");
  });

  it("marks visit as missed with reason", async () => {
    const missed: ScheduledVisitResponse = {
      ...sampleVisit,
      status: "missed",
      missedReason: "Patient hospitalized",
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(missed), { status: 200 }),
    );

    const result = await patchVisitStatus(
      VISIT_ID,
      { status: "missed", missedReason: "Patient hospitalized" },
      COOKIE,
    );

    expect(result.status).toBe("missed");
    expect(result.missedReason).toBe("Patient hospitalized");
  });

  it("reschedules a missed visit", async () => {
    const rescheduled = { ...sampleVisit, status: "scheduled" as const };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(rescheduled), { status: 200 }),
    );

    const result = await patchVisitStatus(VISIT_ID, { status: "scheduled" }, COOKIE);
    expect(result.status).toBe("scheduled");
  });

  it("throws INVALID_TRANSITION on invalid status change", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message: "Cannot transition visit status from 'completed' to 'scheduled'",
            code: "INVALID_TRANSITION",
          },
        }),
        { status: 422 },
      ),
    );

    const err = (await patchVisitStatus(VISIT_ID, { status: "scheduled" }, COOKIE).catch(
      (e: unknown) => e,
    )) as Error & { code?: string };

    expect(err.code).toBe("INVALID_TRANSITION");
    expect(err.message).toContain("Cannot transition");
  });

  it("throws NOT_FOUND on missing visit", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { message: "Scheduled visit not found", code: "NOT_FOUND" } }),
        { status: 404 },
      ),
    );

    const err = (await patchVisitStatus(
      "00000000-0000-0000-0000-000000000000",
      { status: "completed" },
      COOKIE,
    ).catch((e: unknown) => e)) as Error & { code?: string };

    expect(err.code).toBe("NOT_FOUND");
  });
});
