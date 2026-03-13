// tests/contract/assessment.functions.test.ts
// Contract tests: verify fetchTrajectory handler logic against API shape

import type { TrajectoryResponse } from "@hospici/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock env.server before importing functions
vi.mock("@/lib/env.server.js", () => ({
  env: { apiUrl: "http://localhost:3000", betterAuthSecret: "test" },
}));

// Mock vinxi/http (required by createServerFn at module load)
vi.mock("vinxi/http", () => ({ getEvent: vi.fn(() => ({})) }));

// Mock TanStack Start server context
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: vi.fn(() => ({
    headers: { get: (key: string) => (key === "cookie" ? "session=test" : null) },
  })),
}));

// Import handler after mocks
const { fetchTrajectory } = await import("@/functions/assessment.functions.js");

const COOKIE = "session=test";
const PATIENT_ID = "00000000-0000-0000-0000-000000000001";

const sampleTrajectory: TrajectoryResponse = {
  patientId: PATIENT_ID,
  dataPoints: [
    {
      id: "00000000-0000-0000-0000-000000000010",
      assessedAt: "2026-03-01T10:00:00.000Z",
      assessmentType: "NRS",
      pain: 7,
      dyspnea: null,
      nausea: null,
      functionalStatus: null,
    },
    {
      id: "00000000-0000-0000-0000-000000000011",
      assessedAt: "2026-03-08T10:00:00.000Z",
      assessmentType: "ESAS",
      pain: 5,
      dyspnea: 3,
      nausea: 2,
      functionalStatus: null,
    },
  ],
};

describe("fetchTrajectory", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls GET /api/v1/patients/:id/trajectory with cookie header", async () => {
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(sampleTrajectory), { status: 200 }),
    );

    const result = await fetchTrajectory(PATIENT_ID, COOKIE);

    expect(mockFetch).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/patients/${PATIENT_ID}/trajectory`,
      { headers: { cookie: COOKIE } },
    );
    expect(result.patientId).toBe(PATIENT_ID);
    expect(result.dataPoints).toHaveLength(2);
  });

  it("returns trajectory with expected shape including mixed scale types", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleTrajectory), { status: 200 }),
    );

    const result = await fetchTrajectory(PATIENT_ID, COOKIE);
    const first = result.dataPoints[0];
    const second = result.dataPoints[1];

    expect(first?.assessmentType).toBe("NRS");
    expect(first?.pain).toBe(7);
    expect(first?.dyspnea).toBeNull();

    expect(second?.assessmentType).toBe("ESAS");
    expect(second?.pain).toBe(5);
    expect(second?.dyspnea).toBe(3);
    expect(second?.nausea).toBe(2);
  });

  it("returns empty dataPoints for patient with no assessments", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ patientId: PATIENT_ID, dataPoints: [] }), { status: 200 }),
    );

    const result = await fetchTrajectory(PATIENT_ID, COOKIE);
    expect(result.dataPoints).toHaveLength(0);
  });

  it("throws 'Patient not found' on 404", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("", { status: 404 }));

    await expect(fetchTrajectory(PATIENT_ID, COOKIE)).rejects.toThrow("Patient not found");
  });

  it("throws with error message on non-ok response", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Unauthorized" } }), { status: 401 }),
    );

    await expect(fetchTrajectory(PATIENT_ID, COOKIE)).rejects.toThrow("Unauthorized");
  });

  it("throws with fallback message on malformed error body", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("not json", { status: 500 }));

    await expect(fetchTrajectory(PATIENT_ID, COOKIE)).rejects.toThrow("Failed to fetch trajectory");
  });
});
