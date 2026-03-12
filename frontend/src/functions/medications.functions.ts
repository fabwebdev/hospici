// functions/medications.functions.ts
// Medication server functions — wired to the backend medication management API

import { env } from "@/lib/env.server.js";
import type {
  AdministrationListResponse,
  AllergyListResponse,
  CreateAllergyInput,
  CreateMedicationInput,
  MedicationAdministration,
  MedicationListResponse,
  MedicationResponse,
  PatchAllergyInput,
  PatchMedicationInput,
  PatientAllergy,
  RecordAdministrationInput,
} from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

// ── Internal handlers (exported for contract testing) ─────────────────────────

export async function fetchMedications(
  patientId: string,
  cookieHeader: string,
): Promise<MedicationListResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}/medications`, {
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to fetch medications");
  }
  return (await response.json()) as MedicationListResponse;
}

export async function postMedication(
  patientId: string,
  input: CreateMedicationInput,
  cookieHeader: string,
): Promise<MedicationResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}/medications`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to create medication");
  }
  return (await response.json()) as MedicationResponse;
}

export async function patchMedication(
  patientId: string,
  medId: string,
  input: PatchMedicationInput,
  cookieHeader: string,
): Promise<MedicationResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}/medications/${medId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(input),
  });
  if (response.status === 404) throw new Error("Medication not found");
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to update medication");
  }
  return (await response.json()) as MedicationResponse;
}

// ── MAR (Medication Administration Record) ────────────────────────────────────

export async function fetchAdministrations(
  patientId: string,
  medId: string,
  cookieHeader: string,
): Promise<AdministrationListResponse> {
  const response = await fetch(
    `${env.apiUrl}/api/v1/patients/${patientId}/medications/${medId}/administrations`,
    { headers: { cookie: cookieHeader } },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to fetch administrations");
  }
  return (await response.json()) as AdministrationListResponse;
}

export async function postAdministration(
  patientId: string,
  medId: string,
  input: RecordAdministrationInput,
  cookieHeader: string,
): Promise<MedicationAdministration> {
  const response = await fetch(
    `${env.apiUrl}/api/v1/patients/${patientId}/medications/${medId}/administer`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader },
      body: JSON.stringify(input),
    },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to record administration");
  }
  return (await response.json()) as MedicationAdministration;
}

// ── Allergies ─────────────────────────────────────────────────────────────────

export async function fetchAllergies(
  patientId: string,
  cookieHeader: string,
): Promise<AllergyListResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}/allergies`, {
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to fetch allergies");
  }
  return (await response.json()) as AllergyListResponse;
}

export async function postAllergy(
  patientId: string,
  input: CreateAllergyInput,
  cookieHeader: string,
): Promise<PatientAllergy> {
  const response = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}/allergies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to create allergy");
  }
  return (await response.json()) as PatientAllergy;
}

export async function patchAllergy(
  patientId: string,
  allergyId: string,
  input: PatchAllergyInput,
  cookieHeader: string,
): Promise<PatientAllergy> {
  const response = await fetch(
    `${env.apiUrl}/api/v1/patients/${patientId}/allergies/${allergyId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: cookieHeader },
      body: JSON.stringify(input),
    },
  );
  if (response.status === 404) throw new Error("Allergy not found");
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to update allergy");
  }
  return (await response.json()) as PatientAllergy;
}

// ── Server functions (TanStack Start createServerFn) ─────────────────────────

export const getMedicationsFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => data as { patientId: string })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookieHeader = request.headers.get("cookie") ?? "";
    return fetchMedications(data.patientId, cookieHeader);
  });

export const createMedicationFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { patientId: string; input: CreateMedicationInput })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookieHeader = request.headers.get("cookie") ?? "";
    return postMedication(data.patientId, data.input, cookieHeader);
  });

export const updateMedicationFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: unknown) => data as { patientId: string; medId: string; input: PatchMedicationInput },
  )
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookieHeader = request.headers.get("cookie") ?? "";
    return patchMedication(data.patientId, data.medId, data.input, cookieHeader);
  });

export const getAdministrationsFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => data as { patientId: string; medId: string })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookieHeader = request.headers.get("cookie") ?? "";
    return fetchAdministrations(data.patientId, data.medId, cookieHeader);
  });

export const recordAdministrationFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: unknown) =>
      data as { patientId: string; medId: string; input: RecordAdministrationInput },
  )
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookieHeader = request.headers.get("cookie") ?? "";
    return postAdministration(data.patientId, data.medId, data.input, cookieHeader);
  });

export const getAllergiesFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => data as { patientId: string })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookieHeader = request.headers.get("cookie") ?? "";
    return fetchAllergies(data.patientId, cookieHeader);
  });

export const createAllergyFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { patientId: string; input: CreateAllergyInput })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookieHeader = request.headers.get("cookie") ?? "";
    return postAllergy(data.patientId, data.input, cookieHeader);
  });

export const updateAllergyFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: unknown) => data as { patientId: string; allergyId: string; input: PatchAllergyInput },
  )
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookieHeader = request.headers.get("cookie") ?? "";
    return patchAllergy(data.patientId, data.allergyId, data.input, cookieHeader);
  });
