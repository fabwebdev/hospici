// tests/contract/carePlan.functions.test.ts
// Contract tests for care plan server function handlers

import type { CarePlanResponse } from "@hospici/shared-types";
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

const { fetchCarePlan, postCarePlan, patchCarePlanDiscipline } = await import(
  "@/functions/carePlan.functions.js"
);

const COOKIE = "session=test";
const PATIENT_ID = "a1a1a1a1-0000-0000-1111-000000000001";
const LOCATION_ID = "a1a1a1a1-0000-0000-0000-000000000001";
const CARE_PLAN_ID = "cccccccc-0000-0000-0000-000000000001";
const USER_ID = "bbbbbbbb-0000-0000-0000-000000000001";
const now = "2026-03-12T10:00:00.000Z";
const today = "2026-04-01";

const sampleGoal = {
  id: "gggggggg-0000-0000-0000-000000000001",
  goal: "Reduce pain",
  specific: "NRS ≤ 3",
  measurable: "Daily NRS score",
  achievable: "Adjust opioids",
  relevant: "Primary comfort goal",
  timeBound: "Within 7 days",
  targetDate: today,
  status: "active" as const,
};

const sampleCarePlan: CarePlanResponse = {
  id: CARE_PLAN_ID,
  patientId: PATIENT_ID,
  locationId: LOCATION_ID,
  disciplineSections: {
    RN: {
      notes: "Patient stable on current regimen",
      goals: [sampleGoal],
      lastUpdatedBy: USER_ID,
      lastUpdatedAt: now,
    },
  },
  physicianReview: {
    initialReviewDeadline: today,
    initialReviewCompletedAt: null,
    initialReviewedBy: null,
    lastReviewAt: null,
    nextReviewDue: null,
    reviewHistory: [],
    isInitialReviewOverdue: false,
    isOngoingReviewOverdue: false,
  },
  version: 1,
  createdAt: now,
  updatedAt: now,
};

describe("fetchCarePlan", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns care plan on success", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleCarePlan), { status: 200 }),
    );
    const result = await fetchCarePlan(PATIENT_ID, COOKIE);
    expect(result).toMatchObject({ id: CARE_PLAN_ID, patientId: PATIENT_ID });
  });

  it("returns null on 404", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
    const result = await fetchCarePlan(PATIENT_ID, COOKIE);
    expect(result).toBeNull();
  });

  it("throws on non-404 error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Unauthorized" } }), { status: 401 }),
    );
    await expect(fetchCarePlan(PATIENT_ID, COOKIE)).rejects.toThrow("Unauthorized");
  });

  it("sends correct URL and cookie header", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleCarePlan), { status: 200 }),
    );
    await fetchCarePlan(PATIENT_ID, COOKIE);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/patients/${PATIENT_ID}/care-plan`,
      expect.objectContaining({ headers: expect.objectContaining({ cookie: COOKIE }) }),
    );
  });
});

describe("postCarePlan", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates care plan and returns it", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleCarePlan), { status: 201 }),
    );
    const result = await postCarePlan(PATIENT_ID, { notes: "Initial notes" }, COOKIE);
    expect(result.id).toBe(CARE_PLAN_ID);
  });

  it("sends POST with JSON body", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleCarePlan), { status: 201 }),
    );
    await postCarePlan(PATIENT_ID, { notes: "test" }, COOKIE);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining("/care-plan"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws on API error", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Patient not found" } }), { status: 404 }),
    );
    await expect(postCarePlan(PATIENT_ID, {}, COOKIE)).rejects.toThrow("Patient not found");
  });
});

describe("patchCarePlanDiscipline", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("updates RN section and returns updated care plan", async () => {
    const updated = {
      ...sampleCarePlan,
      version: 2,
      disciplineSections: {
        ...sampleCarePlan.disciplineSections,
        RN: {
          notes: "Updated RN notes",
          goals: [],
          lastUpdatedBy: USER_ID,
          lastUpdatedAt: now,
        },
      },
    };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(updated), { status: 200 }),
    );
    const result = await patchCarePlanDiscipline(
      PATIENT_ID,
      "RN",
      { notes: "Updated RN notes" },
      COOKIE,
    );
    expect(result.version).toBe(2);
    expect(result.disciplineSections.RN?.notes).toBe("Updated RN notes");
  });

  it("sends PATCH to the correct discipline URL", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleCarePlan), { status: 200 }),
    );
    await patchCarePlanDiscipline(PATIENT_ID, "SW", { notes: "SW update" }, COOKIE);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/patients/${PATIENT_ID}/care-plan/SW`,
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("throws permission error on 403", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { message: "Role 'aide' may only update the 'AIDE' section" } }),
        { status: 403 },
      ),
    );
    await expect(
      patchCarePlanDiscipline(PATIENT_ID, "RN", { notes: "unauthorized" }, COOKIE),
    ).rejects.toThrow(/AIDE/);
  });
});
