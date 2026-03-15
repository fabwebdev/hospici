// functions/discharge.functions.ts
// Discharge workflow server functions — wired to POST /patients/:id/discharge

import { env } from "@/lib/env.server.js";
import type { DischargeInput, DischargeResponse } from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

// ── Internal handler ──────────────────────────────────────────────────────────

export async function postDischarge(
  patientId: string,
  input: DischargeInput,
  cookieHeader: string,
): Promise<DischargeResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/patients/${patientId}/discharge`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string };
    };
    const err = new Error(body.error?.message ?? "Discharge failed") as Error & { code?: string };
    err.code = body.error?.code;
    throw err;
  }

  return (await response.json()) as DischargeResponse;
}

// ── Server function ───────────────────────────────────────────────────────────

export const dischargeFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { patientId: string; input: DischargeInput })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    return postDischarge(data.patientId, data.input, cookieHeader);
  });
