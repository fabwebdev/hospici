// functions/conditions.functions.ts
// Patient condition (ICD-10 diagnoses) server functions

import { env } from "@/lib/env.server.js";
import type { ConditionListResponse } from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

export const getConditionsFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { patientId: string })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const response = await fetch(`${env.apiUrl}/api/v1/patients/${data.patientId}/conditions`, {
      headers: { cookie: cookieHeader },
    });
    if (!response.ok) throw new Error("Failed to fetch patient conditions");
    return response.json() as Promise<ConditionListResponse>;
  });
