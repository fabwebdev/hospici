/**
 * VantageChart contract tests — verify server function signatures
 * and that the API integration points are correct.
 *
 * Uses msw or direct fetch mocking via vi.mock.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

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

import {
  fetchCreateEncounter,
  fetchListEncounters,
  fetchGetEncounter,
  fetchPatchEncounter,
  fetchPatientContext,
  fetchGenerateNarrative,
  fetchEnhanceNarrative,
} from "../../src/functions/vantage-chart.functions.js";

// Mock the global fetch
const mockFetch = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
});
afterEach(() => {
  vi.unstubAllGlobals();
  mockFetch.mockReset();
});

const PATIENT_ID = "00000000-0000-0000-0000-000000000001";
const ENCOUNTER_ID = "00000000-0000-0000-0000-000000000002";
const COOKIE = "session=test";

const mockEncounterResponse = {
  id: ENCOUNTER_ID,
  patientId: PATIENT_ID,
  locationId: "00000000-0000-0000-0000-000000000003",
  clinicianId: "00000000-0000-0000-0000-000000000004",
  visitType: "routine_rn",
  status: "DRAFT",
  visitedAt: "2026-03-12T10:00:00.000Z",
  createdAt: "2026-03-12T10:00:00.000Z",
  updatedAt: "2026-03-12T10:00:00.000Z",
};

function okJson(body: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response);
}

function errorJson(status: number, body: unknown) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.resolve(body),
  } as Response);
}

describe("fetchCreateEncounter", () => {
  it("POSTs to /patients/:id/encounters and returns encounter", async () => {
    mockFetch.mockReturnValueOnce(
      Promise.resolve({ ok: true, status: 201, json: () => Promise.resolve(mockEncounterResponse) } as Response),
    );
    const result = await fetchCreateEncounter(
      PATIENT_ID,
      { visitType: "routine_rn" },
      COOKIE,
    );
    expect(result.id).toBe(ENCOUNTER_ID);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining(`/patients/${PATIENT_ID}/encounters`),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("throws on error response", async () => {
    mockFetch.mockReturnValueOnce(
      errorJson(400, { error: { message: "Validation error" } }),
    );
    await expect(
      fetchCreateEncounter(PATIENT_ID, { visitType: "routine_rn" }, COOKIE),
    ).rejects.toThrow("Validation error");
  });
});

describe("fetchListEncounters", () => {
  it("GETs encounter list", async () => {
    mockFetch.mockReturnValueOnce(
      okJson({ encounters: [mockEncounterResponse], total: 1 }),
    );
    const result = await fetchListEncounters(PATIENT_ID, COOKIE);
    expect(result.encounters).toHaveLength(1);
    expect(result.total).toBe(1);
  });
});

describe("fetchGetEncounter", () => {
  it("GETs a single encounter", async () => {
    mockFetch.mockReturnValueOnce(okJson(mockEncounterResponse));
    const result = await fetchGetEncounter(PATIENT_ID, ENCOUNTER_ID, COOKIE);
    expect(result.id).toBe(ENCOUNTER_ID);
  });

  it("throws NOT_FOUND on 404", async () => {
    mockFetch.mockReturnValueOnce(
      Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) } as Response),
    );
    await expect(
      fetchGetEncounter(PATIENT_ID, ENCOUNTER_ID, COOKIE),
    ).rejects.toThrow("not found");
  });
});

describe("fetchPatchEncounter", () => {
  it("PATCHes encounter and returns updated record", async () => {
    const updated = { ...mockEncounterResponse, status: "COMPLETED" };
    mockFetch.mockReturnValueOnce(okJson(updated));
    const result = await fetchPatchEncounter(
      PATIENT_ID,
      ENCOUNTER_ID,
      { status: "COMPLETED" },
      COOKIE,
    );
    expect(result.status).toBe("COMPLETED");
  });
});

describe("fetchPatientContext", () => {
  it("GETs patient context from vantage-chart/context", async () => {
    const ctx = {
      suggestions: {},
      trends: { painTrend: "stable", symptomBurdenScore: 3.2, functionalDeclineRate: 0 },
      alerts: [],
      idgRelevance: { significantChanges: false, topicsForDiscussion: [] },
      lastAcceptedDraft: null,
      lastAcceptedInput: null,
    };
    mockFetch.mockReturnValueOnce(okJson(ctx));
    const result = await fetchPatientContext(PATIENT_ID, ENCOUNTER_ID, COOKIE);
    expect(result.trends.painTrend).toBe("stable");
  });
});

describe("fetchGenerateNarrative", () => {
  const input = {
    visitType: "routine_rn" as const,
    patientStatus: { overallCondition: "stable" as const, isAlertAndOriented: true },
    painAssessment: { hasPain: false },
    symptoms: [],
    interventions: [],
    psychosocial: { caregiverCoping: "well" as const, patientMood: "calm" as const },
    carePlan: { frequenciesFollowed: true, medicationCompliance: "compliant" as const },
    safety: { fallRisk: "low" as const },
    planChanges: [],
    recordedAt: "2026-03-12T10:00:00.000Z",
    inputMethod: "touch" as const,
  };

  it("POSTs to vantage-chart/generate and returns draft", async () => {
    const response = {
      draft: "Routine RN visit conducted. Patient is stable.",
      method: "TEMPLATE",
      metadata: { sectionCount: 5, fragmentCount: 10, wordCount: 50, completenessPercent: 85 },
      traceability: [],
      similarityWarning: false,
    };
    mockFetch.mockReturnValueOnce(okJson(response));
    const result = await fetchGenerateNarrative(PATIENT_ID, ENCOUNTER_ID, input, COOKIE);
    expect(result.method).toBe("TEMPLATE");
    expect(result.draft.length).toBeGreaterThan(0);
    expect(result.similarityWarning).toBe(false);
  });
});

describe("fetchEnhanceNarrative", () => {
  it("POSTs draft to vantage-chart/enhance and returns enhanced text", async () => {
    const response = {
      enhanced: "An RN visit was conducted. The patient's condition is stable.",
      original: "Routine RN visit conducted. Patient is stable.",
      method: "LLM",
      tokensUsed: 120,
    };
    mockFetch.mockReturnValueOnce(okJson(response));
    const result = await fetchEnhanceNarrative(
      PATIENT_ID,
      ENCOUNTER_ID,
      "Routine RN visit conducted. Patient is stable.",
      COOKIE,
    );
    expect(result.method).toBe("LLM");
    expect(result.tokensUsed).toBeGreaterThan(0);
  });

  it("throws RATE_LIMIT_EXCEEDED on 429", async () => {
    mockFetch.mockReturnValueOnce(
      Promise.resolve({ ok: false, status: 429, json: () => Promise.resolve({}) } as Response),
    );
    await expect(
      fetchEnhanceNarrative(PATIENT_ID, ENCOUNTER_ID, "draft", COOKIE),
    ).rejects.toThrow("RATE_LIMIT_EXCEEDED");
  });

  it("throws FEATURE_DISABLED on 503", async () => {
    mockFetch.mockReturnValueOnce(
      Promise.resolve({ ok: false, status: 503, json: () => Promise.resolve({}) } as Response),
    );
    await expect(
      fetchEnhanceNarrative(PATIENT_ID, ENCOUNTER_ID, "draft", COOKIE),
    ).rejects.toThrow("FEATURE_DISABLED");
  });
});
