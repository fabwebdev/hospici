// functions/patient-admission.functions.ts
// Patient admission wizard server functions — multi-step patient creation
// Wraps backend endpoints: POST /patients, POST /patients/:id/conditions,
// POST /patients/:id/care-team, POST /patients/:id/noe

import { env } from "@/lib/env.server.js";
import type {
  AssignCareTeamMemberInput,
  CareTeamMemberResponse,
  CreateAllergyInput,
  CreateConditionBody,
  CreateNOEInput,
  NOEResponse,
  PatientAllergy,
  PatientConditionResponse,
  PatientResponse,
} from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

// ── Internal handlers (exported for contract testing) ────────────────────────

interface CreatePatientInput {
  identifier: { system: string; value: string }[];
  name: { use?: string; family: string; given: string[] }[];
  gender?: "male" | "female" | "other" | "unknown";
  birthDate: string;
  telecom?: { system?: string; value: string; use?: string }[];
  address?: {
    use?: string;
    line: string[];
    city: string;
    state: string;
    postalCode: string;
    country: string;
  }[];
  contact?: {
    relationship?: string[];
    name?: { family: string; given: string[] };
    telecom?: { system?: string; value: string; use?: string }[];
    isPrimary?: boolean;
  }[];
  hospiceLocationId: string;
  admissionDate?: string;
  careModel?: "HOSPICE" | "PALLIATIVE" | "CCM";
}

export async function fetchCreatePatient(
  body: CreatePatientInput,
  cookieHeader: string,
): Promise<PatientResponse> {
  const res = await fetch(`${env.apiUrl}/api/v1/patients`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; details?: { path: string; message: string }[] };
    };
    const details = err.error?.details?.map((d) => `${d.path}: ${d.message}`).join("; ");
    throw new Error(
      details
        ? `${err.error?.message}: ${details}`
        : (err.error?.message ?? "Failed to create patient"),
    );
  }
  return (await res.json()) as PatientResponse;
}

export async function fetchCreateCondition(
  patientId: string,
  body: CreateConditionBody,
  cookieHeader: string,
): Promise<PatientConditionResponse> {
  const res = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}/conditions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? "Failed to add condition");
  }
  return (await res.json()) as PatientConditionResponse;
}

export async function fetchAssignCareTeamMember(
  patientId: string,
  body: AssignCareTeamMemberInput,
  cookieHeader: string,
): Promise<CareTeamMemberResponse> {
  const res = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}/care-team`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? "Failed to assign care team member");
  }
  return (await res.json()) as CareTeamMemberResponse;
}

export async function fetchCreateNOE(
  patientId: string,
  body: CreateNOEInput,
  cookieHeader: string,
): Promise<NOEResponse> {
  const res = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}/noe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? "Failed to create NOE");
  }
  return (await res.json()) as NOEResponse;
}

// ── Server functions ──────────────────────────────────────────────────────────

export const createPatientFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { body: CreatePatientInput })
  .handler(async ({ data }) => {
    return fetchCreatePatient(data.body, getRequestHeader("cookie") ?? "");
  });

export const addConditionFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { patientId: string; body: CreateConditionBody })
  .handler(async ({ data }) => {
    return fetchCreateCondition(data.patientId, data.body, getRequestHeader("cookie") ?? "");
  });

export const assignCareTeamMemberFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { patientId: string; body: AssignCareTeamMemberInput })
  .handler(async ({ data }) => {
    return fetchAssignCareTeamMember(data.patientId, data.body, getRequestHeader("cookie") ?? "");
  });

export const createNOEFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { patientId: string; body: CreateNOEInput })
  .handler(async ({ data }) => {
    return fetchCreateNOE(data.patientId, data.body, getRequestHeader("cookie") ?? "");
  });

export async function fetchCreateAllergy(
  patientId: string,
  body: CreateAllergyInput,
  cookieHeader: string,
): Promise<PatientAllergy> {
  const res = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}/allergies`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? "Failed to add allergy");
  }
  return (await res.json()) as PatientAllergy;
}

export const addAllergyFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { patientId: string; body: CreateAllergyInput })
  .handler(async ({ data }) => {
    return fetchCreateAllergy(data.patientId, data.body, getRequestHeader("cookie") ?? "");
  });
