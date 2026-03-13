// functions/alerts.functions.ts
// Compliance alert server functions — wired to backend /api/v1/alerts

import { env } from "@/lib/env.server.js";
import type { Alert, AlertListResponse, AlertStatusPatchBody } from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

// ── Internal handlers (exported for contract testing) ─────────────────────────

export async function fetchComplianceAlerts(
  cookieHeader: string,
  filters: { status?: string; type?: string; assignedTo?: string; severity?: string } = {},
): Promise<AlertListResponse> {
  const url = new URL(`${env.apiUrl}/api/v1/alerts/compliance`);
  for (const [k, v] of Object.entries(filters)) {
    if (v) url.searchParams.set(k, v);
  }
  const response = await fetch(url.toString(), {
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to fetch compliance alerts");
  }
  return (await response.json()) as AlertListResponse;
}

export async function fetchBillingAlerts(cookieHeader: string): Promise<AlertListResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/alerts/billing`, {
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to fetch billing alerts");
  }
  return (await response.json()) as AlertListResponse;
}

export async function patchAlertStatus(
  alertId: string,
  body: AlertStatusPatchBody,
  cookieHeader: string,
): Promise<Alert> {
  const response = await fetch(`${env.apiUrl}/api/v1/alerts/${alertId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
    };
    const err = new Error(parsed.error?.message ?? "Failed to update alert status") as Error & {
      code?: string;
    };
    err.code = parsed.error?.code;
    throw err;
  }
  return (await response.json()) as Alert;
}

// ── Server functions ──────────────────────────────────────────────────────────

export const getComplianceAlertsFn = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest();
  const cookieHeader = request.headers.get("cookie") ?? "";
  return fetchComplianceAlerts(cookieHeader);
});

export const getBillingAlertsFn = createServerFn({ method: "GET" }).handler(async () => {
  const request = getRequest();
  const cookieHeader = request.headers.get("cookie") ?? "";
  return fetchBillingAlerts(cookieHeader);
});

export const patchAlertStatusFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { alertId: string; body: AlertStatusPatchBody })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookieHeader = request.headers.get("cookie") ?? "";
    return patchAlertStatus(data.alertId, data.body, cookieHeader);
  });
