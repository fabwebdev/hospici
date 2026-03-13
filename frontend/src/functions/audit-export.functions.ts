// functions/audit-export.functions.ts
// T3-10: ADR / TPE / Survey Record Packet Export — createServerFn wrappers.

import { env } from "@/lib/env.server.js";
import type {
  AuditRecordExport,
  AuditRecordExportDownloadResponse,
  AuditRecordExportListResponse,
  CreateAuditRecordExportInput,
} from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

// ── Create Export ─────────────────────────────────────────────────────────────

export const createAuditExportFn = createServerFn({ method: "POST" })
  .validator(
    (
      data: unknown,
    ): { patientId: string; body: CreateAuditRecordExportInput } =>
      data as { patientId: string; body: CreateAuditRecordExportInput },
  )
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const res = await fetch(
      `${env.apiUrl}/api/v1/patients/${data.patientId}/audit-exports`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader },
        body: JSON.stringify({ patientId: data.patientId, ...data.body }),
      },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to create audit export");
    }
    return (await res.json()) as { exportId: string };
  });

// ── List Exports ──────────────────────────────────────────────────────────────

export const listAuditExportsFn = createServerFn({ method: "GET" })
  .validator(
    (
      data: unknown,
    ): { patientId: string; limit?: number; offset?: number } =>
      data as { patientId: string; limit?: number; offset?: number },
  )
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const query = new URLSearchParams();
    if (data.limit !== undefined) query.set("limit", String(data.limit));
    if (data.offset !== undefined) query.set("offset", String(data.offset));
    const res = await fetch(
      `${env.apiUrl}/api/v1/patients/${data.patientId}/audit-exports?${query.toString()}`,
      { headers: { cookie: cookieHeader } },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to load audit exports");
    }
    return (await res.json()) as AuditRecordExportListResponse;
  });

// ── Get Single Export ─────────────────────────────────────────────────────────

export const getAuditExportFn = createServerFn({ method: "GET" })
  .validator(
    (
      data: unknown,
    ): { patientId: string; exportId: string } =>
      data as { patientId: string; exportId: string },
  )
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const res = await fetch(
      `${env.apiUrl}/api/v1/patients/${data.patientId}/audit-exports/${data.exportId}`,
      { headers: { cookie: cookieHeader } },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Audit export not found");
    }
    return (await res.json()) as AuditRecordExport;
  });

// ── Get Download URL ──────────────────────────────────────────────────────────

export const getAuditExportDownloadUrlFn = createServerFn({ method: "GET" })
  .validator(
    (
      data: unknown,
    ): { patientId: string; exportId: string; format: "pdf" | "zip" } =>
      data as { patientId: string; exportId: string; format: "pdf" | "zip" },
  )
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const res = await fetch(
      `${env.apiUrl}/api/v1/patients/${data.patientId}/audit-exports/${data.exportId}/download?format=${data.format}`,
      { headers: { cookie: cookieHeader } },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to get download URL");
    }
    return (await res.json()) as AuditRecordExportDownloadResponse;
  });
