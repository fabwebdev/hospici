// functions/f2f.functions.ts
// F2F Validity Engine — createServerFn wrappers (T3-2b)

import { env } from "@/lib/env.server.js";
import type {
  CreateF2FInput,
  F2FEncounterListResponse,
  F2FEncounterResponse,
  F2FQueueResponse,
  F2FValidityResult,
  PatchF2FInput,
} from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

// ── Internal fetch helpers ────────────────────────────────────────────────────

async function apiFetch<T>(path: string, cookieHeader: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${env.apiUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      cookie: cookieHeader,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(`API error ${res.status}: ${body.error ?? res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchPatientF2F(
  patientId: string,
  cookieHeader: string,
): Promise<F2FEncounterListResponse> {
  return apiFetch<F2FEncounterListResponse>(`/api/v1/patients/${patientId}/f2f`, cookieHeader);
}

export async function createF2F(
  patientId: string,
  body: CreateF2FInput,
  cookieHeader: string,
): Promise<F2FEncounterResponse & { validity: F2FValidityResult }> {
  return apiFetch<F2FEncounterResponse & { validity: F2FValidityResult }>(
    `/api/v1/patients/${patientId}/f2f`,
    cookieHeader,
    { method: "POST", body: JSON.stringify(body) },
  );
}

export async function patchF2F(
  id: string,
  body: PatchF2FInput,
  cookieHeader: string,
): Promise<F2FEncounterResponse & { validity: F2FValidityResult }> {
  return apiFetch<F2FEncounterResponse & { validity: F2FValidityResult }>(
    `/api/v1/f2f/${id}`,
    cookieHeader,
    { method: "PATCH", body: JSON.stringify(body) },
  );
}

export async function validateF2F(id: string, cookieHeader: string): Promise<F2FValidityResult> {
  return apiFetch<F2FValidityResult>(`/api/v1/f2f/${id}/validate`, cookieHeader, {
    method: "POST",
  });
}

export async function fetchF2FQueue(cookieHeader: string): Promise<F2FQueueResponse> {
  return apiFetch<F2FQueueResponse>("/api/v1/f2f/queue", cookieHeader);
}

// ── createServerFn wrappers ───────────────────────────────────────────────────

export const getPatientF2FFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { patientId: string })
  .handler(async ({ data }) => {
    const cookie = getRequestHeader("cookie") ?? "";
    return fetchPatientF2F(data.patientId, cookie);
  });

export const createF2FFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { patientId: string; body: CreateF2FInput })
  .handler(async ({ data }) => {
    const cookie = getRequestHeader("cookie") ?? "";
    return createF2F(data.patientId, data.body, cookie);
  });

export const patchF2FFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string; body: PatchF2FInput })
  .handler(async ({ data }) => {
    const cookie = getRequestHeader("cookie") ?? "";
    return patchF2F(data.id, data.body, cookie);
  });

export const validateF2FFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const cookie = getRequestHeader("cookie") ?? "";
    return validateF2F(data.id, cookie);
  });

export const getF2FQueueFn = createServerFn({ method: "GET" }).handler(async () => {
  const cookie = getRequestHeader("cookie") ?? "";
  return fetchF2FQueue(cookie);
});
