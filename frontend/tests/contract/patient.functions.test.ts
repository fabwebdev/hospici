// tests/contract/patient.functions.test.ts
// Contract tests: verify fetchPatients/fetchPatient handler logic against API shape

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PatientListResponse, PatientResponse } from "@hospici/shared-types";

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

// Import handlers after mocks are in place
const { fetchPatients, fetchPatient } = await import(
  "@/functions/patient.functions.js"
);

const COOKIE = "session=test";

const samplePatient: PatientResponse = {
  id: "00000000-0000-0000-0000-000000000001",
  resourceType: "Patient",
  identifier: [{ system: "urn:hospici:mrn", value: "MRN-001" }],
  name: [{ family: "Doe", given: ["John"] }],
  gender: "male",
  birthDate: "1950-03-15",
  hospiceLocationId: "00000000-0000-0000-0000-000000000099",
  admissionDate: "2026-01-10",
  careModel: "HOSPICE",
};

const sampleListResponse: PatientListResponse = {
  patients: [samplePatient],
  total: 1,
  page: 1,
  limit: 20,
};

describe("fetchPatients", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls GET /api/v1/patients with cookie header", async () => {
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(sampleListResponse), { status: 200 }),
    );

    const result = await fetchPatients(COOKIE);

    expect(mockFetch).toHaveBeenCalledWith("http://localhost:3000/api/v1/patients", {
      headers: { cookie: COOKIE },
    });
    expect(result.patients).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it("returns patients array with expected shape", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleListResponse), { status: 200 }),
    );

    const result = await fetchPatients(COOKIE);
    const patient = result.patients[0];

    expect(patient).toBeDefined();
    expect(patient?.resourceType).toBe("Patient");
    expect(patient?.name[0]?.family).toBe("Doe");
    expect(patient?.careModel).toBe("HOSPICE");
  });

  it("throws on non-ok response with error message", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Unauthorized" } }), {
        status: 401,
      }),
    );

    await expect(fetchPatients(COOKIE)).rejects.toThrow("Unauthorized");
  });

  it("throws with fallback message when error body is malformed", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response("not json", { status: 500 }),
    );

    await expect(fetchPatients(COOKIE)).rejects.toThrow("Failed to fetch patients");
  });
});

describe("fetchPatient", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls GET /api/v1/patients/:id with cookie header", async () => {
    const mockFetch = vi.mocked(global.fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(samplePatient), { status: 200 }),
    );

    const result = await fetchPatient(samplePatient.id, COOKIE);

    expect(mockFetch).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/patients/${samplePatient.id}`,
      { headers: { cookie: COOKIE } },
    );
    expect(result.id).toBe(samplePatient.id);
    expect(result.resourceType).toBe("Patient");
  });

  it("returns patient with expected FHIR shape", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(samplePatient), { status: 200 }),
    );

    const result = await fetchPatient(samplePatient.id, COOKIE);

    expect(result.identifier[0]?.system).toBe("urn:hospici:mrn");
    expect(result.name[0]?.given).toEqual(["John"]);
    expect(result.birthDate).toBe("1950-03-15");
  });

  it("throws 'Patient not found' on 404", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response("", { status: 404 }),
    );

    await expect(fetchPatient("bad-id", COOKIE)).rejects.toThrow("Patient not found");
  });

  it("throws with error message on non-404 error", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Forbidden" } }), {
        status: 403,
      }),
    );

    await expect(fetchPatient(samplePatient.id, COOKIE)).rejects.toThrow("Forbidden");
  });
});
