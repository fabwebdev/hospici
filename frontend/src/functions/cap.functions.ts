// functions/cap.functions.ts
// Cap Intelligence server functions — T3-3

import { env } from "@/lib/env.server.js";
import type {
  CapPatientListQuery,
  CapPatientListResponse,
  CapSnapshotResponse,
  CapSummaryResponse,
  CapTrendResponse,
  RecalculateCapResponse,
} from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

// ── Internal fetch helpers ────────────────────────────────────────────────────

export async function fetchCapSummary(
  cookieHeader: string,
  capYear?: number,
): Promise<CapSummaryResponse> {
  const url = new URL(`${env.apiUrl}/api/v1/cap/summary`);
  if (capYear !== undefined) url.searchParams.set("capYear", String(capYear));
  const res = await fetch(url.toString(), { headers: { cookie: cookieHeader } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? "Failed to fetch cap summary");
  }
  return (await res.json()) as CapSummaryResponse;
}

export async function fetchCapPatients(
  cookieHeader: string,
  query: CapPatientListQuery = {},
): Promise<CapPatientListResponse> {
  const url = new URL(`${env.apiUrl}/api/v1/cap/patients`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), { headers: { cookie: cookieHeader } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? "Failed to fetch cap patients");
  }
  return (await res.json()) as CapPatientListResponse;
}

export async function fetchCapTrends(
  cookieHeader: string,
  capYear?: number,
): Promise<CapTrendResponse> {
  const url = new URL(`${env.apiUrl}/api/v1/cap/trends`);
  if (capYear !== undefined) url.searchParams.set("capYear", String(capYear));
  const res = await fetch(url.toString(), { headers: { cookie: cookieHeader } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? "Failed to fetch cap trends");
  }
  return (await res.json()) as CapTrendResponse;
}

export async function fetchCapSnapshot(
  cookieHeader: string,
  snapshotId: string,
): Promise<CapSnapshotResponse> {
  const res = await fetch(`${env.apiUrl}/api/v1/cap/snapshots/${snapshotId}`, {
    headers: { cookie: cookieHeader },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? "Failed to fetch cap snapshot");
  }
  return (await res.json()) as CapSnapshotResponse;
}

export async function postCapRecalculate(cookieHeader: string): Promise<RecalculateCapResponse> {
  const res = await fetch(`${env.apiUrl}/api/v1/cap/recalculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? "Failed to trigger cap recalculation");
  }
  return (await res.json()) as RecalculateCapResponse;
}

// ── Server functions ──────────────────────────────────────────────────────────

export const getCapSummaryFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => data as { capYear?: number } | undefined)
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookieHeader = request.headers.get("cookie") ?? "";
    return fetchCapSummary(cookieHeader, data?.capYear);
  });

export const getCapPatientsFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => data as CapPatientListQuery | undefined)
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookieHeader = request.headers.get("cookie") ?? "";
    return fetchCapPatients(cookieHeader, data ?? {});
  });

export const getCapTrendsFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => data as { capYear?: number } | undefined)
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookieHeader = request.headers.get("cookie") ?? "";
    return fetchCapTrends(cookieHeader, data?.capYear);
  });

export const getCapSnapshotFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => data as { snapshotId: string })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookieHeader = request.headers.get("cookie") ?? "";
    return fetchCapSnapshot(cookieHeader, data.snapshotId);
  });

export const recalculateCapFn = createServerFn({ method: "POST" }).handler(async () => {
  const request = getRequest();
  const cookieHeader = request.headers.get("cookie") ?? "";
  return postCapRecalculate(cookieHeader);
});
