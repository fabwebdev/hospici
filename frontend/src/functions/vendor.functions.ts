// functions/vendor.functions.ts
// T3-8: Vendor Governance + BAA Registry — createServerFn wrappers

import { env } from "@/lib/env.server.js";
import type {
  CreateVendorInput,
  CreateVendorReviewInput,
  ExpiringBaaResponse,
  UpdateVendorInput,
  VendorDetail,
  VendorListResponse,
} from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

// ── Vendor List ───────────────────────────────────────────────────────────────

export async function fetchVendorList(
  params: { status?: string; category?: string; phiExposure?: string },
  cookieHeader: string,
): Promise<VendorListResponse> {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.category) query.set("category", params.category);
  if (params.phiExposure) query.set("phiExposure", params.phiExposure);
  const res = await fetch(`${env.apiUrl}/api/v1/vendors?${query.toString()}`, {
    headers: { cookie: cookieHeader },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to list vendors");
  }
  return (await res.json()) as VendorListResponse;
}

export const listVendorsFn = createServerFn({ method: "GET" })
  .validator(
    (
      data: unknown,
    ): { status?: string; category?: string; phiExposure?: string } =>
      (data ?? {}) as { status?: string; category?: string; phiExposure?: string },
  )
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return fetchVendorList(data, cookieHeader);
  });

// ── Create Vendor ─────────────────────────────────────────────────────────────

export const createVendorFn = createServerFn({ method: "POST" })
  .validator((data: unknown): CreateVendorInput => data as CreateVendorInput)
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const res = await fetch(`${env.apiUrl}/api/v1/vendors`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to create vendor");
    }
    return res.json();
  });

// ── Get Vendor Detail ─────────────────────────────────────────────────────────

export async function fetchVendorDetail(
  id: string,
  cookieHeader: string,
): Promise<VendorDetail> {
  const res = await fetch(`${env.apiUrl}/api/v1/vendors/${id}`, {
    headers: { cookie: cookieHeader },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Vendor not found");
  }
  return (await res.json()) as VendorDetail;
}

export const getVendorFn = createServerFn({ method: "GET" })
  .validator((data: unknown): { id: string } => data as { id: string })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return fetchVendorDetail(data.id, cookieHeader);
  });

// ── Update Vendor ─────────────────────────────────────────────────────────────

export const updateVendorFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown): { id: string; updates: UpdateVendorInput } =>
      data as { id: string; updates: UpdateVendorInput },
  )
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const res = await fetch(`${env.apiUrl}/api/v1/vendors/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: cookieHeader },
      body: JSON.stringify(data.updates),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to update vendor");
    }
    return res.json();
  });

// ── Add Review ────────────────────────────────────────────────────────────────

export const addVendorReviewFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown): { vendorId: string; review: CreateVendorReviewInput } =>
      data as { vendorId: string; review: CreateVendorReviewInput },
  )
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const res = await fetch(`${env.apiUrl}/api/v1/vendors/${data.vendorId}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader },
      body: JSON.stringify(data.review),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to add review");
    }
    return res.json();
  });

// ── Expiring BAAs ─────────────────────────────────────────────────────────────

export async function fetchExpiringBaas(
  within: number,
  cookieHeader: string,
): Promise<ExpiringBaaResponse> {
  const res = await fetch(`${env.apiUrl}/api/v1/vendors/expiring?within=${within}`, {
    headers: { cookie: cookieHeader },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to fetch expiring BAAs");
  }
  return (await res.json()) as ExpiringBaaResponse;
}

export const getExpiringBaasFn = createServerFn({ method: "GET" })
  .validator((data: unknown): { within?: number } => (data ?? {}) as { within?: number })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return fetchExpiringBaas(data.within ?? 90, cookieHeader);
  });

// ── Missing BAAs ──────────────────────────────────────────────────────────────

export const getMissingBaasFn = createServerFn({ method: "GET" }).handler(async () => {
  const cookieHeader = getRequestHeader("cookie") ?? "";
  const res = await fetch(`${env.apiUrl}/api/v1/vendors/missing-baas`, {
    headers: { cookie: cookieHeader },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to fetch missing BAAs");
  }
  return res.json();
});
