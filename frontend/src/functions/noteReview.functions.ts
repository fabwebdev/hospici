// functions/noteReview.functions.ts
// Note review server functions — wired to backend /api/v1/review-queue and /api/v1/encounters

import { env } from "@/lib/env.server.js";
import type {
  AssignReviewInput,
  BulkAcknowledgeInput,
  EscalateReviewInput,
  ReviewQueueResponse,
  SubmitReviewInput,
} from "@hospici/shared-types";
import type { ReviewQueueItem } from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

// ── Internal handlers (exported for contract testing) ─────────────────────────

export async function fetchReviewQueue(
  cookieHeader: string,
  filters: {
    status?: string;
    priority?: number;
    assignedReviewerId?: string;
    billingImpact?: boolean;
    complianceImpact?: boolean;
    patientId?: string;
  } = {},
): Promise<ReviewQueueResponse> {
  const url = new URL(`${env.apiUrl}/api/v1/review-queue`);
  for (const [k, v] of Object.entries(filters)) {
    if (v !== undefined) url.searchParams.set(k, String(v));
  }
  const response = await fetch(url.toString(), {
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to fetch review queue");
  }
  return (await response.json()) as ReviewQueueResponse;
}

export async function submitReview(
  encounterId: string,
  body: SubmitReviewInput,
  cookieHeader: string,
): Promise<ReviewQueueItem> {
  const response = await fetch(`${env.apiUrl}/api/v1/encounters/${encounterId}/review`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
    };
    const err = new Error(parsed.error?.message ?? "Failed to submit review") as Error & {
      code?: string;
    };
    err.code = parsed.error?.code;
    throw err;
  }
  return (await response.json()) as ReviewQueueItem;
}

export async function assignReviewer(
  encounterId: string,
  body: AssignReviewInput,
  cookieHeader: string,
): Promise<ReviewQueueItem> {
  const response = await fetch(`${env.apiUrl}/api/v1/review-queue/${encounterId}/assign`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(parsed.error?.message ?? "Failed to assign reviewer");
  }
  return (await response.json()) as ReviewQueueItem;
}

export async function escalateReview(
  encounterId: string,
  body: EscalateReviewInput,
  cookieHeader: string,
): Promise<ReviewQueueItem> {
  const response = await fetch(`${env.apiUrl}/api/v1/encounters/${encounterId}/review/escalate`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
    };
    const err = new Error(parsed.error?.message ?? "Failed to escalate review") as Error & {
      code?: string;
    };
    err.code = parsed.error?.code;
    throw err;
  }
  return (await response.json()) as ReviewQueueItem;
}

export async function fetchReviewHistory(
  encounterId: string,
  cookieHeader: string,
): Promise<{
  encounterId: string;
  currentStatus: string;
  currentDraft: string | null;
  history: object[];
}> {
  const response = await fetch(`${env.apiUrl}/api/v1/encounters/${encounterId}/review/history`, {
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to fetch review history");
  }
  return response.json();
}

export async function bulkAcknowledge(
  body: BulkAcknowledgeInput,
  cookieHeader: string,
): Promise<{ acknowledged: number }> {
  const response = await fetch(`${env.apiUrl}/api/v1/review-queue/acknowledge`, {
    method: "POST",
    headers: { "Content-Type": "application/json", cookie: cookieHeader },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const parsed = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(parsed.error?.message ?? "Failed to bulk acknowledge");
  }
  return response.json();
}

// ── Server functions ──────────────────────────────────────────────────────────

export const getReviewQueueFn = createServerFn({ method: "GET" })
  .inputValidator(
    (data: unknown) =>
      data as {
        status?: string;
        priority?: number;
        assignedReviewerId?: string;
        billingImpact?: boolean;
        complianceImpact?: boolean;
        patientId?: string;
      },
  )
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookieHeader = request.headers.get("cookie") ?? "";
    return fetchReviewQueue(cookieHeader, data);
  });

export const submitReviewFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { encounterId: string; body: SubmitReviewInput })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookieHeader = request.headers.get("cookie") ?? "";
    return submitReview(data.encounterId, data.body, cookieHeader);
  });

export const assignReviewerFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { encounterId: string; body: AssignReviewInput })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookieHeader = request.headers.get("cookie") ?? "";
    return assignReviewer(data.encounterId, data.body, cookieHeader);
  });

export const escalateReviewFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as { encounterId: string; body: EscalateReviewInput })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookieHeader = request.headers.get("cookie") ?? "";
    return escalateReview(data.encounterId, data.body, cookieHeader);
  });

export const getReviewHistoryFn = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => data as { encounterId: string })
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookieHeader = request.headers.get("cookie") ?? "";
    return fetchReviewHistory(data.encounterId, cookieHeader);
  });

export const bulkAcknowledgeFn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => data as BulkAcknowledgeInput)
  .handler(async ({ data }) => {
    const request = getRequest();
    const cookieHeader = request.headers.get("cookie") ?? "";
    return bulkAcknowledge(data, cookieHeader);
  });
