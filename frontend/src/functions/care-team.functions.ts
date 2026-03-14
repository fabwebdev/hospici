// functions/care-team.functions.ts
// Care team member server functions — 42 CFR §418.56

import { env } from "@/lib/env.server.js";
import type {
  AssignCareTeamMemberInput,
  CareTeamListResponse,
  CareTeamMemberResponse,
} from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

async function cookieHeader(): Promise<string> {
  return getRequestHeader("cookie") ?? "";
}

export const getCareTeamFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { patientId: string })
  .handler(async ({ data }) => {
    const response = await fetch(
      `${env.apiUrl}/api/v1/patients/${data.patientId}/care-team`,
      { headers: { cookie: await cookieHeader() } },
    );
    if (!response.ok) throw new Error("Failed to fetch care team");
    return response.json() as Promise<CareTeamListResponse>;
  });

export const assignCareTeamMemberFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { patientId: string } & AssignCareTeamMemberInput)
  .handler(async ({ data }) => {
    const { patientId, ...body } = data;
    const response = await fetch(
      `${env.apiUrl}/api/v1/patients/${patientId}/care-team`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: await cookieHeader() },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) throw new Error("Failed to assign care team member");
    return response.json() as Promise<CareTeamMemberResponse>;
  });

export const unassignCareTeamMemberFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { patientId: string; memberId: string })
  .handler(async ({ data }) => {
    const response = await fetch(
      `${env.apiUrl}/api/v1/patients/${data.patientId}/care-team/${data.memberId}`,
      { method: "DELETE", headers: { cookie: await cookieHeader() } },
    );
    if (!response.ok) throw new Error("Failed to unassign care team member");
  });
