// functions/carePlan.functions.ts
// Care plan server functions — wired to the backend care plan API

import { env } from "@/lib/env.server.js";
import type {
  CarePlanResponse,
  CreateCarePlanInput,
  DisciplineType,
  PatchCarePlanInput,
  PhysicianReviewInput,
} from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

// ── Internal handlers (exported for contract testing) ─────────────────────────

export async function fetchCarePlan(
  patientId: string,
  cookieHeader: string,
): Promise<CarePlanResponse | null> {
  const response = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}/care-plan`, {
    headers: { cookie: cookieHeader },
  });

  if (response.status === 404) return null;

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to fetch care plan");
  }

  return (await response.json()) as CarePlanResponse;
}

export async function postCarePlan(
  patientId: string,
  input: CreateCarePlanInput,
  cookieHeader: string,
): Promise<CarePlanResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}/care-plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to create care plan");
  }

  return (await response.json()) as CarePlanResponse;
}

export async function patchCarePlanDiscipline(
  patientId: string,
  discipline: DisciplineType,
  input: PatchCarePlanInput,
  cookieHeader: string,
): Promise<CarePlanResponse> {
  const response = await fetch(
    `${env.apiUrl}/api/v1/patients/${patientId}/care-plan/${discipline}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", cookie: cookieHeader },
      body: JSON.stringify(input),
    },
  );

  if (response.status === 403) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Permission denied: role does not match discipline");
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to update care plan");
  }

  return (await response.json()) as CarePlanResponse;
}

export async function postPhysicianReview(
  patientId: string,
  input: PhysicianReviewInput,
  cookieHeader: string,
): Promise<CarePlanResponse> {
  const response = await fetch(
    `${env.apiUrl}/api/v1/patients/${patientId}/care-plan/physician-review`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader },
      body: JSON.stringify(input),
    },
  );

  if (response.status === 403) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? "Permission denied: physician role required");
  }

  if (response.status === 409) {
    throw new Error("Initial physician review has already been completed for this care plan");
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
    throw new Error(body.error?.message ?? "Failed to record physician review");
  }

  return (await response.json()) as CarePlanResponse;
}

// ── Server functions (TanStack Start createServerFn) ─────────────────────────

export const getCarePlanFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { patientId: string })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return fetchCarePlan(data.patientId, cookieHeader);
  });

export const createCarePlanFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { patientId: string; input: CreateCarePlanInput })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return postCarePlan(data.patientId, data.input, cookieHeader);
  });

export const physicianReviewFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { patientId: string; input: PhysicianReviewInput })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return postPhysicianReview(data.patientId, data.input, cookieHeader);
  });

export const patchCarePlanFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) =>
      data as { patientId: string; discipline: DisciplineType; input: PatchCarePlanInput },
  )
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return patchCarePlanDiscipline(data.patientId, data.discipline, data.input, cookieHeader);
  });
