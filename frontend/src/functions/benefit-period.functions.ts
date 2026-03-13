// functions/benefit-period.functions.ts
// Benefit Period Control System server functions — T3-4

import { env } from "@/lib/env.server.js";
import type {
  BenefitPeriodDetail,
  BenefitPeriodListQuery,
  BenefitPeriodListResponse,
  BenefitPeriodTimeline,
  RecalculationPreview,
} from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

// JSON-safe wrapper types — TanStack server functions require serializable return types.
// CorrectionEntry.oldValue/newValue are typed as `unknown` in shared-types but at
// runtime they are always JSON-serializable values returned by the API.
// We cast through `unknown` at the boundaries to satisfy TypeScript's JSON constraint.

type JsonBenefitPeriodDetail = Omit<BenefitPeriodDetail, "correctionHistory"> & {
  correctionHistory: Array<{
    correctedAt: string;
    correctedByUserId: string;
    field: string;
    oldValue: string | number | boolean | null;
    newValue: string | number | boolean | null;
    reason: string;
    previewApproved: boolean;
  }>;
};

type JsonBenefitPeriodListResponse = Omit<BenefitPeriodListResponse, "items"> & {
  items: JsonBenefitPeriodDetail[];
};

type JsonBenefitPeriodTimeline = Omit<BenefitPeriodTimeline, "periods"> & {
  periods: Array<Omit<BenefitPeriodTimeline["periods"][number], "correctionHistory"> & {
    correctionHistory: Array<{
      correctedAt: string;
      correctedByUserId: string;
      field: string;
      oldValue: string | number | boolean | null;
      newValue: string | number | boolean | null;
      reason: string;
      previewApproved: boolean;
    }>;
  }>;
};

type JsonRecalculationPreview = Omit<RecalculationPreview, "affectedPeriods"> & {
  affectedPeriods: Array<{
    id: string;
    periodNumber: number;
    field: string;
    oldValue: string | number | boolean | null;
    newValue: string | number | boolean | null;
  }>;
};

// ── Internal fetch helpers ────────────────────────────────────────────────────

async function fetchBenefitPeriods(
  cookieHeader: string,
  query: BenefitPeriodListQuery = {},
): Promise<JsonBenefitPeriodListResponse> {
  const url = new URL(`${env.apiUrl}/api/v1/benefit-periods`);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), { headers: { cookie: cookieHeader } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? "Failed to fetch benefit periods");
  }
  return (await res.json()) as JsonBenefitPeriodListResponse;
}

async function fetchPatientTimeline(
  cookieHeader: string,
  patientId: string,
): Promise<JsonBenefitPeriodTimeline> {
  const url = `${env.apiUrl}/api/v1/patients/${patientId}/benefit-periods`;
  const res = await fetch(url, { headers: { cookie: cookieHeader } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? "Failed to fetch patient benefit period timeline");
  }
  return (await res.json()) as JsonBenefitPeriodTimeline;
}

async function fetchBenefitPeriod(
  cookieHeader: string,
  id: string,
): Promise<JsonBenefitPeriodDetail> {
  const url = `${env.apiUrl}/api/v1/benefit-periods/${id}`;
  const res = await fetch(url, { headers: { cookie: cookieHeader } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? "Failed to fetch benefit period");
  }
  return (await res.json()) as JsonBenefitPeriodDetail;
}

async function postRecertify(
  cookieHeader: string,
  id: string,
  body: { physicianId: string; completedAt: string },
): Promise<JsonBenefitPeriodDetail> {
  const res = await fetch(`${env.apiUrl}/api/v1/benefit-periods/${id}/recertify`, {
    method: "POST",
    headers: { cookie: cookieHeader, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(b.error?.message ?? "Failed to record recertification");
  }
  return (await res.json()) as JsonBenefitPeriodDetail;
}

async function postCorrect(
  cookieHeader: string,
  id: string,
  body: { field: string; newValue: string | number | boolean | null; reason: string },
): Promise<JsonBenefitPeriodDetail> {
  const res = await fetch(`${env.apiUrl}/api/v1/benefit-periods/${id}/correct`, {
    method: "POST",
    headers: { cookie: cookieHeader, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(b.error?.message ?? "Failed to apply correction");
  }
  return (await res.json()) as JsonBenefitPeriodDetail;
}

async function postRecalculatePreview(
  cookieHeader: string,
  id: string,
): Promise<JsonRecalculationPreview> {
  const res = await fetch(
    `${env.apiUrl}/api/v1/benefit-periods/${id}/recalculate-from-here/preview`,
    {
      method: "POST",
      headers: { cookie: cookieHeader, "content-type": "application/json" },
      body: JSON.stringify({}),
    },
  );
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(b.error?.message ?? "Failed to generate recalculation preview");
  }
  return (await res.json()) as JsonRecalculationPreview;
}

async function postRecalculateCommit(
  cookieHeader: string,
  id: string,
  previewToken: string,
): Promise<JsonBenefitPeriodDetail> {
  const res = await fetch(`${env.apiUrl}/api/v1/benefit-periods/${id}/recalculate-from-here`, {
    method: "POST",
    headers: { cookie: cookieHeader, "content-type": "application/json" },
    body: JSON.stringify({ previewToken }),
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(b.error?.message ?? "Failed to commit recalculation");
  }
  return (await res.json()) as JsonBenefitPeriodDetail;
}

async function patchReportingPeriod(
  cookieHeader: string,
  id: string,
): Promise<JsonBenefitPeriodDetail> {
  const res = await fetch(`${env.apiUrl}/api/v1/benefit-periods/${id}/reporting`, {
    method: "PATCH",
    headers: { cookie: cookieHeader, "content-type": "application/json" },
    body: JSON.stringify({ isReportingPeriod: true }),
  });
  if (!res.ok) {
    const b = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(b.error?.message ?? "Failed to set reporting period");
  }
  return (await res.json()) as JsonBenefitPeriodDetail;
}

// ── Server functions ──────────────────────────────────────────────────────────

export const getBenefitPeriodsFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => data as { query?: BenefitPeriodListQuery })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookie = request.headers.get("cookie") ?? "";
    return fetchBenefitPeriods(cookie, data?.query ?? {});
  });

export const getPatientTimelineFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => data as { patientId: string })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookie = request.headers.get("cookie") ?? "";
    return fetchPatientTimeline(cookie, data.patientId);
  });

export const getBenefitPeriodFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookie = request.headers.get("cookie") ?? "";
    return fetchBenefitPeriod(cookie, data.id);
  });

export const recertifyFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: unknown) => data as { id: string; physicianId: string; completedAt: string },
  )
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookie = request.headers.get("cookie") ?? "";
    return postRecertify(cookie, data.id, {
      physicianId: data.physicianId,
      completedAt: data.completedAt,
    });
  });

export const correctPeriodFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: unknown) =>
      data as { id: string; field: string; newValue: string | number | boolean | null; reason: string },
  )
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookie = request.headers.get("cookie") ?? "";
    return postCorrect(cookie, data.id, {
      field: data.field,
      newValue: data.newValue,
      reason: data.reason,
    });
  });

export const recalculatePreviewFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookie = request.headers.get("cookie") ?? "";
    return postRecalculatePreview(cookie, data.id);
  });

export const recalculateCommitFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { id: string; previewToken: string })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookie = request.headers.get("cookie") ?? "";
    return postRecalculateCommit(cookie, data.id, data.previewToken);
  });

export const setReportingPeriodFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookie = request.headers.get("cookie") ?? "";
    return patchReportingPeriod(cookie, data.id);
  });
