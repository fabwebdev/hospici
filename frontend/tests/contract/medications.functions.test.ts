// tests/contract/medications.functions.test.ts
// Contract tests: verify medication handler logic against API shape

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AdministrationListResponse,
  AllergyListResponse,
  MedicationListResponse,
  MedicationResponse,
  PatientAllergy,
} from "@hospici/shared-types";

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
  fetchMedications,
  postMedication,
  patchMedication,
  fetchAdministrations,
  postAdministration,
  fetchAllergies,
  postAllergy,
  patchAllergy,
} = await import("@/functions/medications.functions.js");

const COOKIE = "session=test";
const PATIENT_ID = "00000000-0000-0000-0000-000000000001";
const MED_ID = "00000000-0000-0000-0000-000000000002";
const ALLERGY_ID = "00000000-0000-0000-0000-000000000003";

const sampleMed: MedicationResponse = {
  id: MED_ID,
  patientId: PATIENT_ID,
  locationId: "00000000-0000-0000-0000-000000000099",
  name: "Morphine Sulfate",
  dosage: "5mg",
  route: "SQ",
  frequency: "Q4H PRN pain ≥4",
  frequencyType: "PRN",
  prnReason: "Pain score ≥4",
  isComfortKit: true,
  indication: "Pain management",
  startDate: "2026-03-12",
  status: "ACTIVE",
  isControlledSubstance: true,
  deaSchedule: "II",
  medicareCoverageType: "PART_A_RELATED",
  teachingCompleted: false,
  createdAt: "2026-03-12T10:00:00.000Z",
  updatedAt: "2026-03-12T10:00:00.000Z",
};

const sampleMedList: MedicationListResponse = {
  medications: [sampleMed],
  total: 1,
};

describe("fetchMedications", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("calls GET /api/v1/patients/:id/medications with cookie", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleMedList), { status: 200 }),
    );

    const result = await fetchMedications(PATIENT_ID, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/patients/${PATIENT_ID}/medications`,
      { headers: { cookie: COOKIE } },
    );
    expect(result.total).toBe(1);
    expect(result.medications[0]?.name).toBe("Morphine Sulfate");
  });

  it("returns comfort-kit medications in the list", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleMedList), { status: 200 }),
    );
    const result = await fetchMedications(PATIENT_ID, COOKIE);
    expect(result.medications[0]?.isComfortKit).toBe(true);
  });

  it("throws on non-ok response", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("", { status: 500 }));
    await expect(fetchMedications(PATIENT_ID, COOKIE)).rejects.toThrow(
      "Failed to fetch medications",
    );
  });
});

describe("postMedication", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("POSTs to /api/v1/patients/:id/medications and returns interaction warnings", async () => {
    const medWithWarning: MedicationResponse = {
      ...sampleMed,
      interactionWarnings: [
        { description: "May increase CNS depression", severity: "moderate", interactingDrug: "Lorazepam" },
      ],
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(medWithWarning), { status: 201 }),
    );

    const result = await postMedication(
      PATIENT_ID,
      {
        name: "Morphine Sulfate",
        dosage: "5mg",
        route: "SQ",
        frequency: "Q4H PRN",
        frequencyType: "PRN",
        indication: "Pain",
        startDate: "2026-03-12",
        medicareCoverageType: "PART_A_RELATED",
        isControlledSubstance: true,
        deaSchedule: "II",
        isComfortKit: true,
      },
      COOKIE,
    );

    expect(result.interactionWarnings).toHaveLength(1);
    expect(result.interactionWarnings?.[0]?.interactingDrug).toBe("Lorazepam");
  });

  it("throws on validation error (400)", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({ error: { message: "Medication validation failed" } }),
        { status: 400 },
      ),
    );
    await expect(
      postMedication(PATIENT_ID, {} as never, COOKIE),
    ).rejects.toThrow("Medication validation failed");
  });
});

describe("patchMedication", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("PATCHes medication status to DISCONTINUED", async () => {
    const discontinued: MedicationResponse = {
      ...sampleMed,
      status: "DISCONTINUED",
      discontinuedReason: "Comfort goal changed",
      discontinuedAt: "2026-03-12T12:00:00.000Z",
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(discontinued), { status: 200 }),
    );

    const result = await patchMedication(
      PATIENT_ID,
      MED_ID,
      { status: "DISCONTINUED", discontinuedReason: "Comfort goal changed" },
      COOKIE,
    );

    expect(result.status).toBe("DISCONTINUED");
    expect(result.discontinuedReason).toBe("Comfort goal changed");
  });

  it("throws 'Medication not found' on 404", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("", { status: 404 }));
    await expect(patchMedication(PATIENT_ID, MED_ID, {}, COOKIE)).rejects.toThrow(
      "Medication not found",
    );
  });

  it("marks teaching completed", async () => {
    const taught: MedicationResponse = {
      ...sampleMed,
      teachingCompleted: true,
      teachingCompletedAt: "2026-03-12T14:00:00.000Z",
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(taught), { status: 200 }),
    );

    const result = await patchMedication(PATIENT_ID, MED_ID, { teachingCompleted: true }, COOKIE);
    expect(result.teachingCompleted).toBe(true);
  });
});

describe("postAdministration (MAR)", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("records a GIVEN administration with effectiveness rating", async () => {
    const admin = {
      id: "00000000-0000-0000-0000-000000000010",
      medicationId: MED_ID,
      patientId: PATIENT_ID,
      locationId: "00000000-0000-0000-0000-000000000099",
      administeredAt: "2026-03-12T10:30:00.000Z",
      administeredBy: "00000000-0000-0000-0000-000000000020",
      administrationType: "GIVEN" as const,
      doseGiven: "5mg",
      routeGiven: "SQ",
      effectivenessRating: 4,
      adverseEffectNoted: false,
      createdAt: "2026-03-12T10:30:00.000Z",
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(admin), { status: 201 }),
    );

    const result = await postAdministration(
      PATIENT_ID,
      MED_ID,
      {
        administeredAt: "2026-03-12T10:30:00.000Z",
        administrationType: "GIVEN",
        doseGiven: "5mg",
        routeGiven: "SQ",
        effectivenessRating: 4,
      },
      COOKIE,
    );

    expect(result.administrationType).toBe("GIVEN");
    expect(result.effectivenessRating).toBe(4);
    expect(result.adverseEffectNoted).toBe(false);
  });

  it("records an OMITTED administration with reason", async () => {
    const admin = {
      id: "00000000-0000-0000-0000-000000000011",
      medicationId: MED_ID,
      patientId: PATIENT_ID,
      locationId: "00000000-0000-0000-0000-000000000099",
      administeredAt: "2026-03-12T14:00:00.000Z",
      administeredBy: "00000000-0000-0000-0000-000000000020",
      administrationType: "OMITTED" as const,
      omissionReason: "Patient sleeping",
      adverseEffectNoted: false,
      createdAt: "2026-03-12T14:00:00.000Z",
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(admin), { status: 201 }),
    );

    const result = await postAdministration(
      PATIENT_ID,
      MED_ID,
      {
        administeredAt: "2026-03-12T14:00:00.000Z",
        administrationType: "OMITTED",
        omissionReason: "Patient sleeping",
      },
      COOKIE,
    );

    expect(result.administrationType).toBe("OMITTED");
    expect(result.omissionReason).toBe("Patient sleeping");
  });
});

describe("fetchAdministrations", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("calls GET /medications/:medId/administrations", async () => {
    const listResponse: AdministrationListResponse = { administrations: [], total: 0 };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(listResponse), { status: 200 }),
    );

    const result = await fetchAdministrations(PATIENT_ID, MED_ID, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/patients/${PATIENT_ID}/medications/${MED_ID}/administrations`,
      { headers: { cookie: COOKIE } },
    );
    expect(result.total).toBe(0);
  });
});

describe("fetchAllergies / postAllergy / patchAllergy", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  const sampleAllergy: PatientAllergy = {
    id: ALLERGY_ID,
    patientId: PATIENT_ID,
    locationId: "00000000-0000-0000-0000-000000000099",
    allergen: "Penicillin",
    allergenType: "DRUG",
    reaction: "Anaphylaxis",
    severity: "LIFE_THREATENING",
    documentedBy: "00000000-0000-0000-0000-000000000020",
    documentedAt: "2026-03-12T10:00:00.000Z",
    isActive: true,
    createdAt: "2026-03-12T10:00:00.000Z",
  };

  it("fetches allergy list", async () => {
    const listResponse: AllergyListResponse = { allergies: [sampleAllergy], total: 1 };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(listResponse), { status: 200 }),
    );

    const result = await fetchAllergies(PATIENT_ID, COOKIE);
    expect(result.total).toBe(1);
    expect(result.allergies[0]?.severity).toBe("LIFE_THREATENING");
  });

  it("creates a drug allergy", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleAllergy), { status: 201 }),
    );

    const result = await postAllergy(
      PATIENT_ID,
      {
        allergen: "Penicillin",
        allergenType: "DRUG",
        reaction: "Anaphylaxis",
        severity: "LIFE_THREATENING",
      },
      COOKIE,
    );

    expect(result.allergen).toBe("Penicillin");
    expect(result.allergenType).toBe("DRUG");
  });

  it("inactivates an allergy via PATCH", async () => {
    const inactivated = { ...sampleAllergy, isActive: false };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(inactivated), { status: 200 }),
    );

    const result = await patchAllergy(PATIENT_ID, ALLERGY_ID, { isActive: false }, COOKIE);
    expect(result.isActive).toBe(false);
  });

  it("throws 'Allergy not found' on 404", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("", { status: 404 }));
    await expect(patchAllergy(PATIENT_ID, ALLERGY_ID, {}, COOKIE)).rejects.toThrow(
      "Allergy not found",
    );
  });
});
