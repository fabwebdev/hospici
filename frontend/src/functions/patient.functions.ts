// functions/patient.functions.ts
// Patient server functions — wired to the backend patient API

import { env } from "@/lib/env.server.js";
import type {
  PatientListResponse,
  PatientListSummaryResponse,
  PatientResponse,
} from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

// ── Internal handlers (exported for contract testing) ─────────────────────────

export async function fetchPatients(
  cookieHeader: string,
  query?: { page?: number; limit?: number; careModel?: string },
): Promise<PatientListResponse> {
  const params = new URLSearchParams();
  if (query?.page) params.set("page", String(query.page));
  if (query?.limit) params.set("limit", String(query.limit));
  if (query?.careModel) params.set("careModel", query.careModel);

  const qs = params.toString();
  const url = `${env.apiUrl}/api/v1/patients${qs ? `?${qs}` : ""}`;

  const response = await fetch(url, {
    headers: { cookie: cookieHeader },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to fetch patients");
  }

  return (await response.json()) as PatientListResponse;
}

export async function fetchPatient(
  patientId: string,
  cookieHeader: string,
): Promise<PatientResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}`, {
    headers: { cookie: cookieHeader },
  });

  if (response.status === 404) {
    throw new Error("Patient not found");
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to fetch patient");
  }

  return (await response.json()) as PatientResponse;
}

// ── Server functions ──────────────────────────────────────────────────────────

export const getPatientsFn = createServerFn({ method: "GET" })
  .validator(
    (data: unknown) => data as { page?: number; limit?: number; careModel?: string } | undefined,
  )
  .handler(async ({ data }) => {
    return fetchPatients(getRequestHeader("cookie") ?? "", data ?? {});
  });

export const getPatientFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { patientId: string })
  .handler(async ({ data }) => {
    return fetchPatient(data.patientId, getRequestHeader("cookie") ?? "");
  });

// ── Patient list summary (bulk enrichment) ──────────────────────────────────

export async function fetchPatientListSummary(
  cookieHeader: string,
): Promise<PatientListSummaryResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/patients/list-summary`, {
    headers: { cookie: cookieHeader },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to fetch patient list summary");
  }

  return (await response.json()) as PatientListSummaryResponse;
}

export const getPatientListSummaryFn = createServerFn({ method: "GET" }).handler(async () => {
  return fetchPatientListSummary(getRequestHeader("cookie") ?? "");
});
