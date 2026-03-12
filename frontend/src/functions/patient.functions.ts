// functions/patient.functions.ts
// Patient server functions — wired to the backend patient API

import { env } from "@/lib/env.server.js";
import type { PatientListResponse, PatientResponse } from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

// ── Internal handlers (exported for contract testing) ─────────────────────────

export async function fetchPatients(cookieHeader: string): Promise<PatientListResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/patients`, {
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

export const getPatientsFn = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest();
  return fetchPatients(request.headers.get("cookie") ?? "");
});

export const getPatientFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => data as { patientId: string })
  .handler(async ({ data }) => {
    const request = getRequest();
    return fetchPatient(data.patientId, request.headers.get("cookie") ?? "");
  });
