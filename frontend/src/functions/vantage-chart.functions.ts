// functions/vantage-chart.functions.ts
// VantageChart server functions — encounter CRUD + narrative generation

import { env } from "@/lib/env.server.js";
import type {
  CreateEncounterInput,
  EnhanceNarrativeResponse,
  EncounterListResponse,
  EncounterResponse,
  GenerateNarrativeResponse,
  PatchEncounterInput,
  PatientContextResponse,
  VantageChartInput,
} from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

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
  const res = await fetch(
    `${env.apiUrl}/api/v1/patients/${patientId}/encounters/${encounterId}`,
    { headers: { cookie: cookieHeader } },
  );
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
  const res = await fetch(
    `${env.apiUrl}/api/v1/patients/${patientId}/encounters/${encounterId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: cookieHeader },
      body: JSON.stringify(body),
    },
  );
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
  .inputValidator(
    (data: unknown) => data as { patientId: string; body: CreateEncounterInput },
  )
  .handler(async ({ data }) => {
    const req = getRequest();
    return fetchCreateEncounter(data.patientId, data.body, req.headers.get("cookie") ?? "");
  });

export const listEncountersFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => data as { patientId: string })
  .handler(async ({ data }) => {
    const req = getRequest();
    return fetchListEncounters(data.patientId, req.headers.get("cookie") ?? "");
  });

export const getEncounterFn = createServerFn({ method: "GET" })
  .inputValidator(
    (data: unknown) => data as { patientId: string; encounterId: string },
  )
  .handler(async ({ data }) => {
    const req = getRequest();
    return fetchGetEncounter(
      data.patientId,
      data.encounterId,
      req.headers.get("cookie") ?? "",
    );
  });

export const patchEncounterFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: unknown) =>
      data as { patientId: string; encounterId: string; body: PatchEncounterInput },
  )
  .handler(async ({ data }) => {
    const req = getRequest();
    return fetchPatchEncounter(
      data.patientId,
      data.encounterId,
      data.body,
      req.headers.get("cookie") ?? "",
    );
  });

export const getPatientContextFn = createServerFn({ method: "GET" })
  .inputValidator(
    (data: unknown) => data as { patientId: string; encounterId: string },
  )
  .handler(async ({ data }) => {
    const req = getRequest();
    return fetchPatientContext(
      data.patientId,
      data.encounterId,
      req.headers.get("cookie") ?? "",
    );
  });

export const previewNarrativeFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: unknown) =>
      data as { patientId: string; encounterId: string; input: VantageChartInput },
  )
  .handler(async ({ data }) => {
    const req = getRequest();
    return fetchGenerateNarrative(
      data.patientId,
      data.encounterId,
      data.input,
      req.headers.get("cookie") ?? "",
    );
  });

export const finalizeNoteFn = createServerFn({ method: "POST" })
  .inputValidator(
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
    const req = getRequest();
    const cookie = req.headers.get("cookie") ?? "";
    // Accept the note: patch encounter with draft + method + accepted timestamp
    return fetchPatchEncounter(
      data.patientId,
      data.encounterId,
      {
        vantageChartDraft: data.draft,
        vantageChartMethod: data.method,
        vantageChartAcceptedAt: new Date().toISOString(),
        vantageChartTraceability: data.traceability as import("@hospici/shared-types").TraceabilityEntry[],
        data: data.inputData,
        status: "COMPLETED",
      },
      cookie,
    );
  });

export const enhanceWithLLMFn = createServerFn({ method: "POST" })
  .inputValidator(
    (data: unknown) =>
      data as { patientId: string; encounterId: string; draft: string },
  )
  .handler(async ({ data }) => {
    const req = getRequest();
    return fetchEnhanceNarrative(
      data.patientId,
      data.encounterId,
      data.draft,
      req.headers.get("cookie") ?? "",
    );
  });
