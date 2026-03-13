// functions/claimAudit.functions.ts
// Claim Audit Rules Engine server functions — T3-12

import { env } from "@/lib/env.server.js";
import type {
  AuditDashboardResponse,
  AuditResult,
  AuditSnapshotResponse,
  BulkHoldBody,
  BulkReleaseBody,
  WarnOverrideBody,
} from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

// ── Internal handlers (exported for contract testing) ─────────────────────────

export async function fetchAuditDashboard(cookieHeader: string): Promise<AuditDashboardResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/billing/audit-dashboard`, {
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? "Failed to fetch audit dashboard");
  }
  return (await response.json()) as AuditDashboardResponse;
}

export async function fetchLatestAuditSnapshot(
  claimId: string,
  cookieHeader: string,
): Promise<AuditSnapshotResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/claims/${claimId}/audit`, {
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? "Failed to fetch audit snapshot");
  }
  return (await response.json()) as AuditSnapshotResponse;
}

export async function fetchAuditSnapshotHistory(
  claimId: string,
  cookieHeader: string,
): Promise<AuditSnapshotResponse[]> {
  const response = await fetch(`${env.apiUrl}/api/v1/claims/${claimId}/audit/history`, {
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? "Failed to fetch audit snapshot history");
  }
  return (await response.json()) as AuditSnapshotResponse[];
}

export async function runClaimAudit(claimId: string, cookieHeader: string): Promise<AuditResult> {
  const response = await fetch(`${env.apiUrl}/api/v1/claims/${claimId}/audit`, {
    method: "POST",
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? "Failed to run claim audit");
  }
  return (await response.json()) as AuditResult;
}

export async function overrideWarnFailure(
  claimId: string,
  body: WarnOverrideBody,
  cookieHeader: string,
): Promise<AuditSnapshotResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/claims/${claimId}/audit/override`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(parsed.error?.message ?? "Failed to override audit warning");
  }
  return (await response.json()) as AuditSnapshotResponse;
}

export async function bulkHoldClaims(
  body: BulkHoldBody,
  cookieHeader: string,
): Promise<{ heldCount: number }> {
  const response = await fetch(`${env.apiUrl}/api/v1/claims/bulk-hold`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(parsed.error?.message ?? "Failed to bulk hold claims");
  }
  return (await response.json()) as { heldCount: number };
}

export async function bulkReleaseClaims(
  body: BulkReleaseBody,
  cookieHeader: string,
): Promise<{ releasedCount: number }> {
  const response = await fetch(`${env.apiUrl}/api/v1/claims/bulk-release-hold`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(parsed.error?.message ?? "Failed to bulk release claims");
  }
  return (await response.json()) as { releasedCount: number };
}

// ── Server functions ──────────────────────────────────────────────────────────

export const getAuditDashboardFn = createServerFn({ method: "GET" }).handler(async () => {
  const cookieHeader = getRequestHeader("cookie") ?? "";
  return fetchAuditDashboard(cookieHeader);
});

export const getLatestAuditSnapshotFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { claimId: string })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return fetchLatestAuditSnapshot(data.claimId, cookieHeader);
  });

export const getAuditSnapshotHistoryFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { claimId: string })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return fetchAuditSnapshotHistory(data.claimId, cookieHeader);
  });

export const runClaimAuditFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { claimId: string })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return runClaimAudit(data.claimId, cookieHeader);
  });

export const overrideWarnFailureFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { claimId: string; body: WarnOverrideBody })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return overrideWarnFailure(data.claimId, data.body, cookieHeader);
  });

export const bulkHoldClaimsFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as BulkHoldBody)
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return bulkHoldClaims(data, cookieHeader);
  });

export const bulkReleaseClaimsFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as BulkReleaseBody)
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return bulkReleaseClaims(data, cookieHeader);
  });
