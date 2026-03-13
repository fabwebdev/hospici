// functions/visitSchedule.functions.ts
// Visit scheduling server functions — wired to backend /api/v1/patients/:id/scheduled-visits
// and /api/v1/scheduled-visits/:id/status

import { env } from "@/lib/env.server.js";
import type {
  CreateScheduledVisitInput,
  PatchScheduledVisitStatusInput,
  ScheduledVisitListResponse,
  ScheduledVisitResponse,
} from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

// ── Internal handlers (exported for contract testing) ─────────────────────────

export async function fetchScheduledVisits(
  patientId: string,
  cookieHeader: string,
): Promise<ScheduledVisitListResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}/scheduled-visits`, {
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to fetch scheduled visits");
  }
  return (await response.json()) as ScheduledVisitListResponse;
}

export async function createScheduledVisit(
  patientId: string,
  body: CreateScheduledVisitInput,
  cookieHeader: string,
): Promise<ScheduledVisitResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}/scheduled-visits`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
    };
    const err = new Error(parsed.error?.message ?? "Failed to create scheduled visit") as Error & {
      code?: string;
    };
    err.code = parsed.error?.code;
    throw err;
  }
  return (await response.json()) as ScheduledVisitResponse;
}

export async function patchVisitStatus(
  visitId: string,
  body: PatchScheduledVisitStatusInput,
  cookieHeader: string,
): Promise<ScheduledVisitResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/scheduled-visits/${visitId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
    };
    const err = new Error(parsed.error?.message ?? "Failed to update visit status") as Error & {
      code?: string;
    };
    err.code = parsed.error?.code;
    throw err;
  }
  return (await response.json()) as ScheduledVisitResponse;
}

// ── Server functions ───────────────────────────────────────────────────────────

export const getScheduledVisitsFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => data as { patientId: string })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookieHeader = request.headers.get("cookie") ?? "";
    return fetchScheduledVisits(data.patientId, cookieHeader);
  });

export const createScheduledVisitFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { patientId: string; body: CreateScheduledVisitInput })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookieHeader = request.headers.get("cookie") ?? "";
    return createScheduledVisit(data.patientId, data.body, cookieHeader);
  });

export const patchVisitStatusFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: unknown) => data as { visitId: string; body: PatchScheduledVisitStatusInput },
  )
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookieHeader = request.headers.get("cookie") ?? "";
    return patchVisitStatus(data.visitId, data.body, cookieHeader);
  });
