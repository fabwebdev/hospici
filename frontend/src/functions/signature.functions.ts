// functions/signature.functions.ts
// Electronic signature server functions — wired to the backend signature API

import { env } from "@/lib/env.server.js";
import type {
  CountersignBody,
  CreateSignatureRequestBody,
  MarkExceptionBody,
  OutstandingSignaturesResponse,
  RejectSignatureBody,
  SignDocumentBody,
  SignatureListQuery,
  SignatureRequestWithSignatures,
  SignatureVerificationResult,
  VoidSignatureBody,
} from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

// JSON-safe wrapper types — TanStack server functions require serializable return types.
// SignatureEvent.eventData is typed as Record<string, unknown> in shared-types but at
// runtime it is always JSON-serializable. We cast through unknown at the boundaries.

type JsonSignatureEvent = {
  id: string;
  signatureRequestId: string;
  eventType: string;
  eventData: Record<string, string | number | boolean | null>;
  actorUserId: string | null;
  actorName: string | null;
  createdAt: string;
};

type JsonSignatureRequestWithSignatures = Omit<SignatureRequestWithSignatures, "events"> & {
  events: JsonSignatureEvent[];
};

type JsonSignatureListResponse = {
  items: JsonSignatureRequestWithSignatures[];
  total: number;
  page: number;
};

// ── Internal handlers (exported for contract testing) ─────────────────────────

export async function fetchSignatures(
  query: SignatureListQuery,
  cookieHeader: string,
): Promise<JsonSignatureListResponse> {
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.documentType) params.set("documentType", query.documentType);
  if (query.patientId) params.set("patientId", query.patientId);
  if (query.overdue !== undefined) params.set("overdue", String(query.overdue));
  if (query.page) params.set("page", String(query.page));
  if (query.limit) params.set("limit", String(query.limit));

  const response = await fetch(`${env.apiUrl}/api/v1/signatures?${params}`, {
    headers: { cookie: cookieHeader },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      message?: string;
    };
    throw new Error(body.message ?? body.error?.message ?? "Failed to fetch signatures");
  }

  return (await response.json()) as JsonSignatureListResponse;
}

export async function fetchOutstandingSignatures(
  cookieHeader: string,
): Promise<OutstandingSignaturesResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/signatures/outstanding`, {
    headers: { cookie: cookieHeader },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      message?: string;
    };
    throw new Error(
      body.message ?? body.error?.message ?? "Failed to fetch outstanding signatures",
    );
  }

  return (await response.json()) as OutstandingSignaturesResponse;
}

export async function fetchSignatureRequest(
  requestId: string,
  cookieHeader: string,
): Promise<JsonSignatureRequestWithSignatures> {
  const response = await fetch(`${env.apiUrl}/api/v1/signatures/${requestId}`, {
    headers: { cookie: cookieHeader },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      message?: string;
    };
    throw new Error(body.message ?? body.error?.message ?? "Failed to fetch signature request");
  }

  return (await response.json()) as JsonSignatureRequestWithSignatures;
}

export async function fetchCreateSignatureRequest(
  input: CreateSignatureRequestBody,
  cookieHeader: string,
): Promise<JsonSignatureRequestWithSignatures> {
  const response = await fetch(`${env.apiUrl}/api/v1/signatures`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: cookieHeader,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      message?: string;
    };
    throw new Error(body.message ?? body.error?.message ?? "Failed to create signature request");
  }

  return (await response.json()) as JsonSignatureRequestWithSignatures;
}

export async function fetchSendForSignature(
  requestId: string,
  cookieHeader: string,
): Promise<JsonSignatureRequestWithSignatures> {
  const response = await fetch(`${env.apiUrl}/api/v1/signatures/${requestId}/send`, {
    method: "POST",
    headers: { cookie: cookieHeader },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      message?: string;
    };
    throw new Error(body.message ?? body.error?.message ?? "Failed to send for signature");
  }

  return (await response.json()) as JsonSignatureRequestWithSignatures;
}

export async function fetchMarkViewed(
  requestId: string,
  cookieHeader: string,
): Promise<JsonSignatureRequestWithSignatures> {
  const response = await fetch(`${env.apiUrl}/api/v1/signatures/${requestId}/viewed`, {
    method: "POST",
    headers: { cookie: cookieHeader },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      message?: string;
    };
    throw new Error(body.message ?? body.error?.message ?? "Failed to mark as viewed");
  }

  return (await response.json()) as JsonSignatureRequestWithSignatures;
}

export async function fetchSignDocument(
  requestId: string,
  input: SignDocumentBody,
  cookieHeader: string,
): Promise<JsonSignatureRequestWithSignatures> {
  const response = await fetch(`${env.apiUrl}/api/v1/signatures/${requestId}/sign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: cookieHeader,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      message?: string;
    };
    throw new Error(body.message ?? body.error?.message ?? "Failed to sign document");
  }

  return (await response.json()) as JsonSignatureRequestWithSignatures;
}

export async function fetchCountersign(
  requestId: string,
  input: CountersignBody,
  cookieHeader: string,
): Promise<JsonSignatureRequestWithSignatures> {
  const response = await fetch(`${env.apiUrl}/api/v1/signatures/${requestId}/countersign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: cookieHeader,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      message?: string;
    };
    throw new Error(body.message ?? body.error?.message ?? "Failed to countersign");
  }

  return (await response.json()) as JsonSignatureRequestWithSignatures;
}

export async function fetchRejectSignature(
  requestId: string,
  input: RejectSignatureBody,
  cookieHeader: string,
): Promise<JsonSignatureRequestWithSignatures> {
  const response = await fetch(`${env.apiUrl}/api/v1/signatures/${requestId}/reject`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: cookieHeader,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      message?: string;
    };
    throw new Error(body.message ?? body.error?.message ?? "Failed to reject signature");
  }

  return (await response.json()) as JsonSignatureRequestWithSignatures;
}

export async function fetchVoidSignature(
  requestId: string,
  input: VoidSignatureBody,
  cookieHeader: string,
): Promise<JsonSignatureRequestWithSignatures> {
  const response = await fetch(`${env.apiUrl}/api/v1/signatures/${requestId}/void`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: cookieHeader,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      message?: string;
    };
    throw new Error(body.message ?? body.error?.message ?? "Failed to void signature");
  }

  return (await response.json()) as JsonSignatureRequestWithSignatures;
}

export async function fetchMarkException(
  requestId: string,
  input: MarkExceptionBody,
  cookieHeader: string,
): Promise<JsonSignatureRequestWithSignatures> {
  const response = await fetch(`${env.apiUrl}/api/v1/signatures/${requestId}/exception`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      cookie: cookieHeader,
    },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      message?: string;
    };
    throw new Error(body.message ?? body.error?.message ?? "Failed to mark exception");
  }

  return (await response.json()) as JsonSignatureRequestWithSignatures;
}

export async function fetchVerifySignature(
  signatureId: string,
  cookieHeader: string,
): Promise<SignatureVerificationResult> {
  const response = await fetch(`${env.apiUrl}/api/v1/signatures/verify/${signatureId}`, {
    headers: { cookie: cookieHeader },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      message?: string;
    };
    throw new Error(body.message ?? body.error?.message ?? "Failed to verify signature");
  }

  return (await response.json()) as SignatureVerificationResult;
}

// ── Server functions ──────────────────────────────────────────────────────────

export const getSignaturesFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { query: SignatureListQuery })
  .handler(async ({ data }) => {
    return fetchSignatures(data.query, getRequestHeader("cookie") ?? "");
  });

export const getOutstandingSignaturesFn = createServerFn({ method: "GET" })
  .validator(() => ({}))
  .handler(async () => {
    return fetchOutstandingSignatures(getRequestHeader("cookie") ?? "");
  });

export const getSignatureRequestFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { requestId: string })
  .handler(async ({ data }) => {
    return fetchSignatureRequest(data.requestId, getRequestHeader("cookie") ?? "");
  });

export const createSignatureRequestFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { input: CreateSignatureRequestBody })
  .handler(async ({ data }) => {
    return fetchCreateSignatureRequest(data.input, getRequestHeader("cookie") ?? "");
  });

export const sendForSignatureFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { requestId: string })
  .handler(async ({ data }) => {
    return fetchSendForSignature(data.requestId, getRequestHeader("cookie") ?? "");
  });

export const markViewedFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { requestId: string })
  .handler(async ({ data }) => {
    return fetchMarkViewed(data.requestId, getRequestHeader("cookie") ?? "");
  });

export const signDocumentFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { requestId: string; input: SignDocumentBody })
  .handler(async ({ data }) => {
    return fetchSignDocument(data.requestId, data.input, getRequestHeader("cookie") ?? "");
  });

export const countersignFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { requestId: string; input: CountersignBody })
  .handler(async ({ data }) => {
    return fetchCountersign(data.requestId, data.input, getRequestHeader("cookie") ?? "");
  });

export const rejectSignatureFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { requestId: string; input: RejectSignatureBody })
  .handler(async ({ data }) => {
    return fetchRejectSignature(data.requestId, data.input, getRequestHeader("cookie") ?? "");
  });

export const voidSignatureFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { requestId: string; input: VoidSignatureBody })
  .handler(async ({ data }) => {
    return fetchVoidSignature(data.requestId, data.input, getRequestHeader("cookie") ?? "");
  });

export const markExceptionFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => data as { requestId: string; input: MarkExceptionBody })
  .handler(async ({ data }) => {
    return fetchMarkException(data.requestId, data.input, getRequestHeader("cookie") ?? "");
  });

export const verifySignatureFn = createServerFn({ method: "GET" })
  .validator((data: unknown) => data as { signatureId: string })
  .handler(async ({ data }) => {
    return fetchVerifySignature(data.signatureId, getRequestHeader("cookie") ?? "");
  });
