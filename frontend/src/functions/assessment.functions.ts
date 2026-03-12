// functions/assessment.functions.ts
// Assessment server functions — wired to the backend assessment API

import { env } from "@/lib/env.server.js";
import type { TrajectoryResponse } from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

// ── Internal handlers (exported for contract testing) ─────────────────────────

export async function fetchTrajectory(
  patientId: string,
  cookieHeader: string,
): Promise<TrajectoryResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}/trajectory`, {
    headers: { cookie: cookieHeader },
  });

  if (response.status === 404) {
    throw new Error("Patient not found");
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to fetch trajectory");
  }

  return (await response.json()) as TrajectoryResponse;
}

// ── Server functions ──────────────────────────────────────────────────────────

export const getTrajectoryFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => data as { patientId: string })
  .handler(async ({ data }) => {
    const request = getRequest();
    return fetchTrajectory(data.patientId, request.headers.get("cookie") ?? "");
  });
