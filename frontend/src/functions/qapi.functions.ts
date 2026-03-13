// functions/qapi.functions.ts
// T3-11: QAPI Management + Clinician Quality Scorecards — createServerFn wrappers

import { env } from "@/lib/env.server.js";
import type {
  ClinicianQualityScorecard,
  DeficiencyTrendReport,
  QAPIAddActionItemBody,
  QAPICloseBody,
  QAPICreateBody,
  QAPIEvent,
  QAPIEventListResponse,
  QAPIListQuery,
  QAPIPatchBody,
  QualityOutlierListResponse,
  ScorecardListResponse,
  ScorecardQuery,
  TrendQuery,
} from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

// ── QAPI Events ────────────────────────────────────────────────────────────────

export const listQAPIEventsFn = createServerFn({ method: "GET" })
  .validator((data: unknown): QAPIListQuery => (data ?? {}) as QAPIListQuery)
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const query = new URLSearchParams();
    if (data.status) query.set("status", data.status);
    if (data.eventType) query.set("eventType", data.eventType);
    if (data.locationId) query.set("locationId", data.locationId);
    if (data.from) query.set("from", data.from);
    if (data.to) query.set("to", data.to);
    if (data.limit) query.set("limit", String(data.limit));
    if (data.offset) query.set("offset", String(data.offset));
    const res = await fetch(`${env.apiUrl}/api/v1/qapi/events?${query.toString()}`, {
      headers: { cookie: cookieHeader },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to list QAPI events");
    }
    return (await res.json()) as QAPIEventListResponse;
  });

export const createQAPIEventFn = createServerFn({ method: "POST" })
  .validator((data: unknown): QAPICreateBody => data as QAPICreateBody)
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const res = await fetch(`${env.apiUrl}/api/v1/qapi/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to create QAPI event");
    }
    return (await res.json()) as QAPIEvent;
  });

export const patchQAPIEventFn = createServerFn({ method: "POST" })
  .validator((data: unknown): { id: string; updates: QAPIPatchBody } => data as { id: string; updates: QAPIPatchBody })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const res = await fetch(`${env.apiUrl}/api/v1/qapi/events/${data.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: cookieHeader },
      body: JSON.stringify(data.updates),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to update QAPI event");
    }
    return (await res.json()) as QAPIEvent;
  });

export const closeQAPIEventFn = createServerFn({ method: "POST" })
  .validator((data: unknown): { id: string; body: QAPICloseBody } => data as { id: string; body: QAPICloseBody })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const res = await fetch(`${env.apiUrl}/api/v1/qapi/events/${data.id}/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader },
      body: JSON.stringify(data.body),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to close QAPI event");
    }
    return (await res.json()) as QAPIEvent;
  });

export const addActionItemFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown): { eventId: string; body: QAPIAddActionItemBody } =>
      data as { eventId: string; body: QAPIAddActionItemBody },
  )
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const res = await fetch(`${env.apiUrl}/api/v1/qapi/events/${data.eventId}/action-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader },
      body: JSON.stringify(data.body),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to add action item");
    }
    return (await res.json()) as QAPIEvent;
  });

export const completeActionItemFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown): { eventId: string; itemId: string } =>
      data as { eventId: string; itemId: string },
  )
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const res = await fetch(
      `${env.apiUrl}/api/v1/qapi/events/${data.eventId}/action-items/${data.itemId}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", cookie: cookieHeader },
        body: JSON.stringify({}),
      },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to complete action item");
    }
    return (await res.json()) as QAPIEvent;
  });

// ── Clinician Scorecards ───────────────────────────────────────────────────────

export const listScorecardsFn = createServerFn({ method: "GET" })
  .validator((data: unknown): ScorecardQuery => (data ?? {}) as ScorecardQuery)
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const query = new URLSearchParams();
    if (data.locationId) query.set("locationId", data.locationId);
    if (data.discipline) query.set("discipline", data.discipline);
    if (data.from) query.set("from", data.from);
    if (data.to) query.set("to", data.to);
    const res = await fetch(
      `${env.apiUrl}/api/v1/analytics/clinician-scorecards?${query.toString()}`,
      { headers: { cookie: cookieHeader } },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to fetch scorecards");
    }
    return (await res.json()) as ScorecardListResponse;
  });

export const getScorecardFn = createServerFn({ method: "GET" })
  .validator(
    (data: unknown): { userId: string; query?: ScorecardQuery } =>
      data as { userId: string; query?: ScorecardQuery },
  )
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const query = new URLSearchParams();
    if (data.query?.locationId) query.set("locationId", data.query.locationId);
    if (data.query?.from) query.set("from", data.query.from);
    if (data.query?.to) query.set("to", data.query.to);
    const res = await fetch(
      `${env.apiUrl}/api/v1/analytics/clinician-scorecards/${data.userId}?${query.toString()}`,
      { headers: { cookie: cookieHeader } },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Scorecard not found");
    }
    return (await res.json()) as ClinicianQualityScorecard;
  });

// ── Deficiency Trends ─────────────────────────────────────────────────────────

export const getDeficiencyTrendsFn = createServerFn({ method: "GET" })
  .validator((data: unknown): TrendQuery => (data ?? {}) as TrendQuery)
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const query = new URLSearchParams();
    if (data.locationId) query.set("locationId", data.locationId);
    if (data.discipline) query.set("discipline", data.discipline);
    if (data.from) query.set("from", data.from);
    if (data.to) query.set("to", data.to);
    if (data.deficiencyType) query.set("deficiencyType", data.deficiencyType);
    const res = await fetch(
      `${env.apiUrl}/api/v1/analytics/deficiency-trends?${query.toString()}`,
      { headers: { cookie: cookieHeader } },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to fetch deficiency trends");
    }
    return (await res.json()) as DeficiencyTrendReport;
  });

// ── Quality Outliers ──────────────────────────────────────────────────────────

export const getQualityOutliersFn = createServerFn({ method: "GET" })
  .validator((data: unknown): ScorecardQuery => (data ?? {}) as ScorecardQuery)
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const query = new URLSearchParams();
    if (data.locationId) query.set("locationId", data.locationId);
    if (data.from) query.set("from", data.from);
    if (data.to) query.set("to", data.to);
    const res = await fetch(
      `${env.apiUrl}/api/v1/analytics/quality-outliers?${query.toString()}`,
      { headers: { cookie: cookieHeader } },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to fetch quality outliers");
    }
    return (await res.json()) as QualityOutlierListResponse;
  });
