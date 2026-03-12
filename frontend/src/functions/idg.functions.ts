// functions/idg.functions.ts
// IDG meeting server functions — wired to the backend IDG API

import { env } from "@/lib/env.server.js";
import type {
  CreateIDGMeetingInput,
  IDGComplianceStatus,
  IDGMeetingListResponse,
  IDGMeetingResponse,
} from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

// ── Internal handlers (exported for contract testing) ─────────────────────────

export async function fetchIDGMeetings(
  patientId: string,
  cookieHeader: string,
): Promise<IDGMeetingListResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}/idg-meetings`, {
    headers: { cookie: cookieHeader },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to fetch IDG meetings");
  }

  return (await response.json()) as IDGMeetingListResponse;
}

export async function fetchIDGCompliance(
  patientId: string,
  cookieHeader: string,
): Promise<IDGComplianceStatus> {
  const response = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}/idg-compliance`, {
    headers: { cookie: cookieHeader },
  });

  if (response.status === 404) {
    throw new Error("Patient not found");
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to fetch IDG compliance");
  }

  return (await response.json()) as IDGComplianceStatus;
}

export async function fetchCreateIDGMeeting(
  input: CreateIDGMeetingInput,
  cookieHeader: string,
): Promise<IDGMeetingResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/idg-meetings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: cookieHeader,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to create IDG meeting");
  }

  return (await response.json()) as IDGMeetingResponse;
}

// ── Server functions ──────────────────────────────────────────────────────────

export const getIDGMeetingsFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => data as { patientId: string })
  .handler(async ({ data }) => {
    const request = getRequest();
    return fetchIDGMeetings(data.patientId, request.headers.get("cookie") ?? "");
  });

export const getIDGComplianceFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => data as { patientId: string })
  .handler(async ({ data }) => {
    const request = getRequest();
    return fetchIDGCompliance(data.patientId, request.headers.get("cookie") ?? "");
  });

export const createIDGMeetingFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { input: CreateIDGMeetingInput })
  .handler(async ({ data }) => {
    const request = getRequest();
    return fetchCreateIDGMeeting(data.input, request.headers.get("cookie") ?? "");
  });
