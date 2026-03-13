// functions/vantage-chart.functions.ts
// VantageChart server functions — encounter CRUD + narrative generation

import { env } from "@/lib/env.server.js";
import type {
  CreateEncounterInput,
  EncounterListResponse,
  EncounterResponse,
  EnhanceNarrativeResponse,
  GenerateNarrativeResponse,
  PatchEncounterInput,
  PatientContextResponse,
  TraceabilityEntry,
  VantageChartInput,
} from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

// ── Internal handlers (exported for contract testing) ────────────────────────

export async function fetchCreateEncounter(
  patientId: string,
  body: CreateEncounterInput,
  cookieHeader: string,
): Promise<EncounterResponse> {
  const res = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}/encounters`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(err.error?.message ?? "Failed to create encounter");
  }
  return (await res.json()) as EncounterResponse;
}

export async function fetchListEncounters(
  patientId: string,
  cookieHeader: string,
): Promise<EncounterListResponse> {
  const res = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}/encounters`, {
    headers: { cookie: cookieHeader },
  });
  if (!res.ok) throw new Error("Failed to fetch encounters");
  return (await res.json()) as EncounterListResponse;
}

export async function fetchGetEncounter(
  patientId: string,
  encounterId: string,
  cookieHeader: string,
): Promise<EncounterResponse> {
  const res = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}/encounters/${encounterId}`, {
    headers: { cookie: cookieHeader },
  });
  if (res.status === 404) throw new Error("Encounter not found");
  if (!res.ok) throw new Error("Failed to fetch encounter");
  return (await res.json()) as EncounterResponse;
}

export async function fetchPatchEncounter(
  patientId: string,
  encounterId: string,
  body: PatchEncounterInput,
  cookieHeader: string,
): Promise<EncounterResponse> {
  const res = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}/encounters/${encounterId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to update encounter");
  return (await res.json()) as EncounterResponse;
}

export async function fetchPatientContext(
  patientId: string,
  encounterId: string,
  cookieHeader: string,
): Promise<PatientContextResponse> {
  const res = await fetch(
    `${env.apiUrl}/api/v1/patients/${patientId}/encounters/${encounterId}/vantage-chart/context`,
    { headers: { cookie: cookieHeader } },
  );
  if (!res.ok) throw new Error("Failed to fetch patient context");
  return (await res.json()) as PatientContextResponse;
}

export async function fetchGenerateNarrative(
  patientId: string,
  encounterId: string,
  input: VantageChartInput,
  cookieHeader: string,
): Promise<GenerateNarrativeResponse> {
  const res = await fetch(
    `${env.apiUrl}/api/v1/patients/${patientId}/encounters/${encounterId}/vantage-chart/generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({ input }),
    },
  );
  if (!res.ok) throw new Error("Failed to generate narrative");
  return (await res.json()) as GenerateNarrativeResponse;
}

export async function fetchEnhanceNarrative(
  patientId: string,
  encounterId: string,
  draft: string,
  cookieHeader: string,
): Promise<EnhanceNarrativeResponse> {
  const res = await fetch(
    `${env.apiUrl}/api/v1/patients/${patientId}/encounters/${encounterId}/vantage-chart/enhance`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({ draft }),
    },
  );
  if (res.status === 429) throw new Error("RATE_LIMIT_EXCEEDED");
  if (res.status === 503) throw new Error("FEATURE_DISABLED");
  if (!res.ok) throw new Error("Failed to enhance narrative");
  return (await res.json()) as EnhanceNarrativeResponse;
}

// ── Server functions ──────────────────────────────────────────────────────────

export const createEncounterFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { patientId: string; body: CreateEncounterInput })
  .handler(async ({ data }) => {
    return fetchCreateEncounter(data.patientId, data.body, getRequestHeader("cookie") ?? "");
  });

export const listEncountersFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { patientId: string })
  .handler(async ({ data }) => {
    return fetchListEncounters(data.patientId, getRequestHeader("cookie") ?? "");
  });

export const getEncounterFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { patientId: string; encounterId: string })
  .handler(async ({ data }) => {
    return fetchGetEncounter(data.patientId, data.encounterId, getRequestHeader("cookie") ?? "");
  });

export const patchEncounterFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as { patientId: string; encounterId: string; body: PatchEncounterInput },
  )
  .handler(async ({ data }) => {
    return fetchPatchEncounter(
      data.patientId,
      data.encounterId,
      data.body,
      getRequestHeader("cookie") ?? "",
    );
  });

export const getPatientContextFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { patientId: string; encounterId: string })
  .handler(async ({ data }) => {
    return fetchPatientContext(data.patientId, data.encounterId, getRequestHeader("cookie") ?? "");
  });

export const previewNarrativeFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) => data as { patientId: string; encounterId: string; input: VantageChartInput },
  )
  .handler(async ({ data }) => {
    return fetchGenerateNarrative(
      data.patientId,
      data.encounterId,
      data.input,
      getRequestHeader("cookie") ?? "",
    );
  });

export const finalizeNoteFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as {
        patientId: string;
        encounterId: string;
        draft: string;
        method: "TEMPLATE" | "LLM";
        traceability: unknown[];
        inputData: VantageChartInput;
      },
  )
  .handler(async ({ data }) => {
    const cookie = getRequestHeader("cookie") ?? "";
    // Accept the note: patch encounter with draft + method + accepted timestamp
    return fetchPatchEncounter(
      data.patientId,
      data.encounterId,
      {
        vantageChartDraft: data.draft,
        vantageChartMethod: data.method,
        vantageChartAcceptedAt: new Date().toISOString(),
        vantageChartTraceability: data.traceability as TraceabilityEntry[],
        data: data.inputData,
        status: "COMPLETED",
      },
      cookie,
    );
  });

export const enhanceWithLLMFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { patientId: string; encounterId: string; draft: string })
  .handler(async ({ data }) => {
    return fetchEnhanceNarrative(
      data.patientId,
      data.encounterId,
      data.draft,
      getRequestHeader("cookie") ?? "",
    );
  });
