// functions/hope.functions.ts
// HOPE assessment server functions — wired to /api/v1/hope/* and /api/v1/analytics/*

import { env } from "@/lib/env.server.js";
import type {
  CreateHOPEAssessmentInput,
  HOPEAssessmentListQuery,
  HOPEAssessmentListResponse,
  HOPEAssessmentResponse,
  HOPEDashboardResponse,
  HOPEPatientTimeline,
  HOPEQualityBenchmark,
  HOPESubmissionListResponse,
  HOPESubmissionRow,
  HOPEValidationResult,
  PatchHOPEAssessmentInput,
} from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

// ── Internal handlers (exported for contract testing) ─────────────────────────

export async function fetchHOPEAssessments(
  query: HOPEAssessmentListQuery,
  cookieHeader: string,
): Promise<HOPEAssessmentListResponse> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) params.set(k, String(v));
  }
  const qs = params.toString();
  const response = await fetch(`${env.apiUrl}/api/v1/hope/assessments${qs ? `?${qs}` : ""}`, {
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? "Failed to fetch HOPE assessments");
  }
  return (await response.json()) as HOPEAssessmentListResponse;
}

export async function fetchHOPEAssessment(
  id: string,
  cookieHeader: string,
): Promise<HOPEAssessmentResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/hope/assessments/${id}`, {
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? "Failed to fetch HOPE assessment");
  }
  return (await response.json()) as HOPEAssessmentResponse;
}

export async function createHOPEAssessment(
  body: CreateHOPEAssessmentInput,
  cookieHeader: string,
): Promise<HOPEAssessmentResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/hope/assessments`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(data.error?.message ?? "Failed to create HOPE assessment");
  }
  return (await response.json()) as HOPEAssessmentResponse;
}

export async function patchHOPEAssessment(
  id: string,
  body: PatchHOPEAssessmentInput,
  cookieHeader: string,
): Promise<HOPEAssessmentResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/hope/assessments/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(data.error?.message ?? "Failed to update HOPE assessment");
  }
  return (await response.json()) as HOPEAssessmentResponse;
}

export async function validateHOPEAssessment(
  id: string,
  cookieHeader: string,
): Promise<HOPEValidationResult> {
  const response = await fetch(`${env.apiUrl}/api/v1/hope/assessments/${id}/validate`, {
    method: "POST",
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(data.error?.message ?? "Failed to validate HOPE assessment");
  }
  return (await response.json()) as HOPEValidationResult;
}

export async function approveHOPEAssessment(
  id: string,
  cookieHeader: string,
): Promise<HOPEAssessmentResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/hope/assessments/${id}/approve`, {
    method: "POST",
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(data.error?.message ?? "Failed to approve HOPE assessment");
  }
  return (await response.json()) as HOPEAssessmentResponse;
}

export async function reprocessHOPESubmission(
  submissionId: string,
  cookieHeader: string,
): Promise<HOPESubmissionRow> {
  const response = await fetch(`${env.apiUrl}/api/v1/hope/submissions/${submissionId}/reprocess`, {
    method: "POST",
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(data.error?.message ?? "Failed to reprocess submission");
  }
  return (await response.json()) as HOPESubmissionRow;
}

export async function revertHOPEToReview(
  submissionId: string,
  cookieHeader: string,
): Promise<HOPEAssessmentResponse> {
  const response = await fetch(
    `${env.apiUrl}/api/v1/hope/submissions/${submissionId}/revert-to-review`,
    {
      method: "POST",
      headers: { cookie: cookieHeader },
    },
  );
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(data.error?.message ?? "Failed to revert to review");
  }
  return (await response.json()) as HOPEAssessmentResponse;
}

export async function fetchQualityBenchmarks(cookieHeader: string): Promise<HOPEQualityBenchmark> {
  const response = await fetch(`${env.apiUrl}/api/v1/analytics/quality-benchmarks`, {
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(data.error?.message ?? "Failed to fetch quality benchmarks");
  }
  return (await response.json()) as HOPEQualityBenchmark;
}

// ── Server functions (createServerFn wrappers) ────────────────────────────────

export const getHOPEAssessmentsFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => data as HOPEAssessmentListQuery)
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookie = request.headers.get("cookie") ?? "";
    return fetchHOPEAssessments(data, cookie);
  });

export const getHOPEAssessmentFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookie = request.headers.get("cookie") ?? "";
    return fetchHOPEAssessment(data.id, cookie);
  });

export const createHOPEAssessmentFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as CreateHOPEAssessmentInput)
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookie = request.headers.get("cookie") ?? "";
    return createHOPEAssessment(data, cookie);
  });

export const patchHOPEAssessmentFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { id: string; body: PatchHOPEAssessmentInput })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookie = request.headers.get("cookie") ?? "";
    return patchHOPEAssessment(data.id, data.body, cookie);
  });

export const validateHOPEAssessmentFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookie = request.headers.get("cookie") ?? "";
    return validateHOPEAssessment(data.id, cookie);
  });

export const approveHOPEAssessmentFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { id: string })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookie = request.headers.get("cookie") ?? "";
    return approveHOPEAssessment(data.id, cookie);
  });

export const reprocessHOPESubmissionFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { submissionId: string })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookie = request.headers.get("cookie") ?? "";
    return reprocessHOPESubmission(data.submissionId, cookie);
  });

export const revertHOPEToReviewFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { submissionId: string })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookie = request.headers.get("cookie") ?? "";
    return revertHOPEToReview(data.submissionId, cookie);
  });

export const getQualityBenchmarksFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const request = getRequest();
    const cookie = request.headers.get("cookie") ?? "";
    return fetchQualityBenchmarks(cookie);
  });

// ── T3-1b: Dashboard + Timeline + Submission history ─────────────────────────

export async function fetchHOPEDashboard(cookieHeader: string): Promise<HOPEDashboardResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/hope/dashboard`, {
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(data.error?.message ?? "Failed to fetch HOPE dashboard");
  }
  return (await response.json()) as HOPEDashboardResponse;
}

export async function fetchHOPEPatientTimeline(
  patientId: string,
  cookieHeader: string,
): Promise<HOPEPatientTimeline> {
  const response = await fetch(`${env.apiUrl}/api/v1/hope/patients/${patientId}/timeline`, {
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(data.error?.message ?? "Failed to fetch HOPE patient timeline");
  }
  return (await response.json()) as HOPEPatientTimeline;
}

export async function fetchHOPESubmissionsByAssessment(
  assessmentId: string,
  cookieHeader: string,
): Promise<HOPESubmissionListResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/hope/assessments/${assessmentId}/submissions`, {
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(data.error?.message ?? "Failed to fetch HOPE submissions");
  }
  return (await response.json()) as HOPESubmissionListResponse;
}

export const getHOPEDashboardFn = createServerFn({ method: "GET" })
  .handler(async () => {
    const request = getRequest();
    const cookie = request.headers.get("cookie") ?? "";
    return fetchHOPEDashboard(cookie);
  });

export const getHOPEPatientTimelineFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => data as { patientId: string })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookie = request.headers.get("cookie") ?? "";
    return fetchHOPEPatientTimeline(data.patientId, cookie);
  });

export const getHOPESubmissionsByAssessmentFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => data as { assessmentId: string })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookie = request.headers.get("cookie") ?? "";
    return fetchHOPESubmissionsByAssessment(data.assessmentId, cookie);
  });
