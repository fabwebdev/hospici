// chartAudit.functions.ts — T3-13 Chart Audit Mode server functions

import { createServerFn } from "@tanstack/react-start";
import type {
  ChartAuditDetailResponse,
  ChartAuditDashboardResponse,
  ChartAuditQueueResponse,
  ChartBulkActionInput,
  CreateReviewQueueViewInput,
  PatchReviewQueueViewInput,
  ReviewChecklistTemplate,
  ReviewChecklistTemplateListResponse,
  ReviewQueueBulkActionInput,
  ReviewQueueView,
  ReviewQueueViewListResponse,
} from "@hospici/shared-types";

const API = "/api/v1";

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw Object.assign(new Error((body as { error?: { message?: string } }).error?.message ?? `HTTP ${res.status}`), { statusCode: res.status });
  }
  return res.json() as Promise<T>;
}

// ── Checklist templates ────────────────────────────────────────────────────────

export const getChecklistTemplateFn = createServerFn({ method: "GET" })
  .validator((data: { discipline: string; visitType: string }) => data)
  .handler(async ({ data }) => {
    return apiFetch<ReviewChecklistTemplate>(
      `${API}/review-checklist-templates?discipline=${encodeURIComponent(data.discipline)}&visitType=${encodeURIComponent(data.visitType)}`,
    );
  });

export const getChecklistTemplateHistoryFn = createServerFn({ method: "GET" })
  .validator((data: { discipline: string; visitType: string }) => data)
  .handler(async ({ data }) => {
    return apiFetch<ReviewChecklistTemplateListResponse>(
      `${API}/review-checklist-templates/history?discipline=${encodeURIComponent(data.discipline)}&visitType=${encodeURIComponent(data.visitType)}`,
    );
  });

// ── Chart audit queue + dashboard ─────────────────────────────────────────────

export const getChartAuditQueueFn = createServerFn({ method: "GET" })
  .validator(
    (data: {
      page?: number;
      limit?: number;
      discipline?: string;
      reviewerId?: string;
      status?: string;
      billingImpact?: boolean;
      complianceImpact?: boolean;
      missingDocSeverity?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const params = new URLSearchParams();
    if (data.page) params.set("page", String(data.page));
    if (data.limit) params.set("limit", String(data.limit));
    if (data.discipline) params.set("discipline", data.discipline);
    if (data.reviewerId) params.set("reviewerId", data.reviewerId);
    if (data.status) params.set("status", data.status);
    if (data.billingImpact !== undefined) params.set("billingImpact", String(data.billingImpact));
    if (data.complianceImpact !== undefined) params.set("complianceImpact", String(data.complianceImpact));
    if (data.missingDocSeverity) params.set("missingDocSeverity", data.missingDocSeverity);
    return apiFetch<ChartAuditQueueResponse>(`${API}/chart-audit/queue?${params.toString()}`);
  });

export const getChartAuditDashboardFn = createServerFn({ method: "GET" })
  .handler(async () => {
    return apiFetch<ChartAuditDashboardResponse>(`${API}/chart-audit/dashboard`);
  });

// ── Single-patient chart audit ─────────────────────────────────────────────────

export const getPatientChartAuditFn = createServerFn({ method: "GET" })
  .validator((data: { patientId: string }) => data)
  .handler(async ({ data }) => {
    return apiFetch<ChartAuditDetailResponse>(`${API}/patients/${data.patientId}/chart-audit`);
  });

// ── Bulk actions ───────────────────────────────────────────────────────────────

export const chartBulkActionFn = createServerFn({ method: "POST" })
  .validator((data: ChartBulkActionInput) => data)
  .handler(async ({ data }) => {
    return apiFetch<{ action: string; affected: number; patientIds: string[] }>(
      `${API}/chart-audit/bulk-action`,
      { method: "POST", body: JSON.stringify(data) },
    );
  });

export const reviewQueueBulkActionFn = createServerFn({ method: "POST" })
  .validator((data: ReviewQueueBulkActionInput) => data)
  .handler(async ({ data }) => {
    return apiFetch<{ action: string; affected: number; encounterIds: string[] }>(
      `${API}/review-queue/bulk-action`,
      { method: "POST", body: JSON.stringify(data) },
    );
  });

// ── Saved views ────────────────────────────────────────────────────────────────

export const getReviewViewsFn = createServerFn({ method: "GET" })
  .validator((data: { viewScope?: string }) => data)
  .handler(async ({ data }) => {
    const params = data.viewScope ? `?viewScope=${data.viewScope}` : "";
    return apiFetch<ReviewQueueViewListResponse>(`${API}/review-queue/views${params}`);
  });

export const createReviewViewFn = createServerFn({ method: "POST" })
  .validator((data: CreateReviewQueueViewInput) => data)
  .handler(async ({ data }) => {
    return apiFetch<ReviewQueueView>(`${API}/review-queue/views`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  });

export const patchReviewViewFn = createServerFn({ method: "POST" })
  .validator((data: { id: string } & PatchReviewQueueViewInput) => data)
  .handler(async ({ data: { id, ...body } }) => {
    return apiFetch<ReviewQueueView>(`${API}/review-queue/views/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  });

export const deleteReviewViewFn = createServerFn({ method: "POST" })
  .validator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    await apiFetch<void>(`${API}/review-queue/views/${data.id}`, { method: "DELETE" });
    return { deleted: true };
  });
