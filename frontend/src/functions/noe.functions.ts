// functions/noe.functions.ts
// NOE/NOTR Filing Workbench server functions — T3-2a

import { env } from "@/lib/env.server.js";
import type {
  CMSResponseInput,
  CorrectNOEInput,
  CreateNOEInput,
  CreateNOTRInput,
  FilingHistoryEvent,
  FilingQueueResponse,
  LateOverrideInput,
  NOEResponse,
  NOEWithHistoryResponse,
  NOTRResponse,
  NoticeFilingStatus,
  ReadinessResponse,
} from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

// ── Internal handlers (exported for contract testing) ─────────────────────────

export async function fetchNOE(
  patientId: string,
  cookieHeader: string,
): Promise<NOEWithHistoryResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}/noe`, {
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to fetch NOE");
  }
  return (await response.json()) as NOEWithHistoryResponse;
}

export async function createNOE(
  patientId: string,
  body: CreateNOEInput,
  cookieHeader: string,
): Promise<NOEResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}/noe`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
    };
    const err = new Error(parsed.error?.message ?? "Failed to create NOE") as Error & {
      code?: string;
    };
    err.code = parsed.error?.code;
    throw err;
  }
  return (await response.json()) as NOEResponse;
}

export async function submitNOE(noeId: string, cookieHeader: string): Promise<NOEResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/noe/${noeId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
    };
    const err = new Error(parsed.error?.message ?? "Failed to submit NOE") as Error & {
      code?: string;
    };
    err.code = parsed.error?.code;
    throw err;
  }
  return (await response.json()) as NOEResponse;
}

export async function correctNOE(
  noeId: string,
  body: CorrectNOEInput,
  cookieHeader: string,
): Promise<NOEResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/noe/${noeId}/correct`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
    };
    const err = new Error(parsed.error?.message ?? "Failed to correct NOE") as Error & {
      code?: string;
    };
    err.code = parsed.error?.code;
    throw err;
  }
  return (await response.json()) as NOEResponse;
}

export async function lateOverrideNOE(
  noeId: string,
  body: LateOverrideInput,
  cookieHeader: string,
): Promise<NOEResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/noe/${noeId}/late-override`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
    };
    const err = new Error(parsed.error?.message ?? "Failed to approve late override") as Error & {
      code?: string;
    };
    err.code = parsed.error?.code;
    throw err;
  }
  return (await response.json()) as NOEResponse;
}

export async function fetchNOEReadiness(
  noeId: string,
  cookieHeader: string,
): Promise<ReadinessResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/noe/${noeId}/readiness`, {
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to fetch NOE readiness");
  }
  return (await response.json()) as ReadinessResponse;
}

export async function fetchNOEHistory(
  noeId: string,
  cookieHeader: string,
): Promise<{ events: FilingHistoryEvent[] }> {
  const response = await fetch(`${env.apiUrl}/api/v1/noe/${noeId}/history`, {
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to fetch NOE history");
  }
  return (await response.json()) as { events: FilingHistoryEvent[] };
}

// ── NOTR handlers ─────────────────────────────────────────────────────────────

export async function fetchNOTR(
  patientId: string,
  cookieHeader: string,
): Promise<{ notr: NOTRResponse; history: FilingHistoryEvent[] }> {
  const response = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}/notr`, {
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to fetch NOTR");
  }
  return (await response.json()) as { notr: NOTRResponse; history: FilingHistoryEvent[] };
}

export async function createNOTR(
  patientId: string,
  body: CreateNOTRInput,
  cookieHeader: string,
): Promise<NOTRResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}/notr`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
    };
    const err = new Error(parsed.error?.message ?? "Failed to create NOTR") as Error & {
      code?: string;
    };
    err.code = parsed.error?.code;
    throw err;
  }
  return (await response.json()) as NOTRResponse;
}

export async function submitNOTR(notrId: string, cookieHeader: string): Promise<NOTRResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/notr/${notrId}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify({}),
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
    };
    const err = new Error(parsed.error?.message ?? "Failed to submit NOTR") as Error & {
      code?: string;
    };
    err.code = parsed.error?.code;
    throw err;
  }
  return (await response.json()) as NOTRResponse;
}

export async function correctNOTR(
  notrId: string,
  body: CreateNOTRInput,
  cookieHeader: string,
): Promise<NOTRResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/notr/${notrId}/correct`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
    };
    const err = new Error(parsed.error?.message ?? "Failed to correct NOTR") as Error & {
      code?: string;
    };
    err.code = parsed.error?.code;
    throw err;
  }
  return (await response.json()) as NOTRResponse;
}

export async function lateOverrideNOTR(
  notrId: string,
  body: LateOverrideInput,
  cookieHeader: string,
): Promise<NOTRResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/notr/${notrId}/late-override`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
    };
    const err = new Error(
      parsed.error?.message ?? "Failed to approve NOTR late override",
    ) as Error & {
      code?: string;
    };
    err.code = parsed.error?.code;
    throw err;
  }
  return (await response.json()) as NOTRResponse;
}

export async function fetchNOTRReadiness(
  notrId: string,
  cookieHeader: string,
): Promise<ReadinessResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/notr/${notrId}/readiness`, {
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to fetch NOTR readiness");
  }
  return (await response.json()) as ReadinessResponse;
}

export async function fetchFilingQueue(
  params: {
    type?: "NOE" | "NOTR";
    status?: NoticeFilingStatus;
    isLate?: boolean;
    isClaimBlocking?: boolean;
  },
  cookieHeader: string,
): Promise<FilingQueueResponse> {
  const qs = new URLSearchParams();
  if (params.type) qs.set("type", params.type);
  if (params.status) qs.set("status", params.status);
  if (params.isLate) qs.set("isLate", "true");
  if (params.isClaimBlocking) qs.set("isClaimBlocking", "true");

  const url = `${env.apiUrl}/api/v1/filings/queue${qs.toString() ? `?${qs.toString()}` : ""}`;
  const response = await fetch(url, { headers: { cookie: cookieHeader } });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to fetch filing queue");
  }
  return (await response.json()) as FilingQueueResponse;
}

export async function recordCMSResponseNOE(
  noeId: string,
  body: CMSResponseInput,
  cookieHeader: string,
): Promise<NOEResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/noe/${noeId}/cms-response`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
    };
    const err = new Error(parsed.error?.message ?? "Failed to record CMS response") as Error & {
      code?: string;
    };
    err.code = parsed.error?.code;
    throw err;
  }
  return (await response.json()) as NOEResponse;
}

// ── Server functions ───────────────────────────────────────────────────────────

export const getNOEFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { patientId: string })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return fetchNOE(data.patientId, cookieHeader);
  });

export const createNOEFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { patientId: string; body: CreateNOEInput })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return createNOE(data.patientId, data.body, cookieHeader);
  });

export const submitNOEFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { noeId: string })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return submitNOE(data.noeId, cookieHeader);
  });

export const correctNOEFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { noeId: string; body: CorrectNOEInput })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return correctNOE(data.noeId, data.body, cookieHeader);
  });

export const lateOverrideNOEFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { noeId: string; body: LateOverrideInput })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return lateOverrideNOE(data.noeId, data.body, cookieHeader);
  });

export const getNOEReadinessFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { noeId: string })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return fetchNOEReadiness(data.noeId, cookieHeader);
  });

export const getNOEHistoryFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { noeId: string })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return fetchNOEHistory(data.noeId, cookieHeader);
  });

export const getNOTRFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { patientId: string })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return fetchNOTR(data.patientId, cookieHeader);
  });

export const createNOTRFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { patientId: string; body: CreateNOTRInput })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return createNOTR(data.patientId, data.body, cookieHeader);
  });

export const submitNOTRFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { notrId: string })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return submitNOTR(data.notrId, cookieHeader);
  });

export const correctNOTRFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { notrId: string; body: CreateNOTRInput })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return correctNOTR(data.notrId, data.body, cookieHeader);
  });

export const lateOverrideNOTRFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { notrId: string; body: LateOverrideInput })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return lateOverrideNOTR(data.notrId, data.body, cookieHeader);
  });

export const getNOTRReadinessFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { notrId: string })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return fetchNOTRReadiness(data.notrId, cookieHeader);
  });

export const getFilingQueueFn = createServerFn({ method: "GET" })
  .validator(
    (data: unknown) =>
      data as {
        type?: "NOE" | "NOTR";
        status?: NoticeFilingStatus;
        isLate?: boolean;
        isClaimBlocking?: boolean;
      },
  )
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return fetchFilingQueue(data, cookieHeader);
  });
