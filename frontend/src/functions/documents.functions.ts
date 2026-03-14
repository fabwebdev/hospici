// functions/documents.functions.ts
// Patient document server functions

import { env } from "@/lib/env.server.js";
import type {
  CreateDocumentInput,
  DocumentListResponse,
  DocumentResponse,
  PatchDocumentInput,
} from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

async function cookieHeader(): Promise<string> {
  return getRequestHeader("cookie") ?? "";
}

export const getDocumentsFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { patientId: string })
  .handler(async ({ data }) => {
    const response = await fetch(
      `${env.apiUrl}/api/v1/patients/${data.patientId}/documents`,
      { headers: { cookie: await cookieHeader() } },
    );
    if (!response.ok) throw new Error("Failed to fetch documents");
    return response.json() as Promise<DocumentListResponse>;
  });

export const createDocumentFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { patientId: string } & CreateDocumentInput)
  .handler(async ({ data }) => {
    const { patientId, ...body } = data;
    const response = await fetch(
      `${env.apiUrl}/api/v1/patients/${patientId}/documents`,
      {
        method: "POST",
        headers: { "content-type": "application/json", cookie: await cookieHeader() },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) throw new Error("Failed to create document");
    return response.json() as Promise<DocumentResponse>;
  });

export const patchDocumentFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { patientId: string; docId: string } & PatchDocumentInput)
  .handler(async ({ data }) => {
    const { patientId, docId, ...body } = data;
    const response = await fetch(
      `${env.apiUrl}/api/v1/patients/${patientId}/documents/${docId}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json", cookie: await cookieHeader() },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) throw new Error("Failed to update document");
    return response.json() as Promise<DocumentResponse>;
  });
