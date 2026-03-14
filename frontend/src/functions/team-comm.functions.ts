// functions/team-comm.functions.ts
// Team communication server functions — HIPAA §164.530(j)

import { env } from "@/lib/env.server.js";
import type {
  CommMessageListResponse,
  CommMessageResponse,
  CommThreadListResponse,
  CommThreadResponse,
  CreateCommThreadInput,
  SendCommMessageInput,
} from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

async function cookieHeader(): Promise<string> {
  return getRequestHeader("cookie") ?? "";
}

export const getCommThreadsFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { patientId: string })
  .handler(async ({ data }) => {
    const response = await fetch(
      `${env.apiUrl}/api/v1/patients/${data.patientId}/team-comm/threads`,
      { headers: { cookie: await cookieHeader() } },
    );
    if (!response.ok) throw new Error("Failed to fetch threads");
    return response.json() as Promise<CommThreadListResponse>;
  });

export const createCommThreadFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { patientId: string } & CreateCommThreadInput)
  .handler(async ({ data }) => {
    const { patientId, ...body } = data;
    const response = await fetch(
      `${env.apiUrl}/api/v1/patients/${patientId}/team-comm/threads`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: await cookieHeader() },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) throw new Error("Failed to create thread");
    return response.json() as Promise<CommThreadResponse>;
  });

export const getCommMessagesFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { patientId: string; threadId: string })
  .handler(async ({ data }) => {
    const response = await fetch(
      `${env.apiUrl}/api/v1/patients/${data.patientId}/team-comm/threads/${data.threadId}/messages`,
      { headers: { cookie: await cookieHeader() } },
    );
    if (!response.ok) throw new Error("Failed to fetch messages");
    return response.json() as Promise<CommMessageListResponse>;
  });

export const sendCommMessageFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown) => data as { patientId: string; threadId: string } & SendCommMessageInput,
  )
  .handler(async ({ data }) => {
    const { patientId, threadId, ...body } = data;
    const response = await fetch(
      `${env.apiUrl}/api/v1/patients/${patientId}/team-comm/threads/${threadId}/messages`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: await cookieHeader() },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) throw new Error("Failed to send message");
    return response.json() as Promise<CommMessageResponse>;
  });
