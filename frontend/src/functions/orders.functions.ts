// functions/orders.functions.ts
// T3-9: Physician Order Inbox + Paperless Order Routing — createServerFn wrappers

import { env } from "@/lib/env.server.js";
import type {
  CreateOrderInput,
  ExceptionOrderBody,
  OrderInboxResponse,
  OrderListResponse,
  OrderResponse,
  RejectOrderBody,
  ResendOrderBody,
  SignOrderBody,
} from "@hospici/shared-types";
// Note: OrderDeliveryMethod is used by CreateOrderInput and ResendOrderBody (via @hospici/shared-types)
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

// ── List Order Inbox ──────────────────────────────────────────────────────────

export const listOrderInboxFn = createServerFn({ method: "GET" })
  .validator(
    (
      data: unknown,
    ): { status?: string; page?: number; limit?: number } =>
      (data ?? {}) as { status?: string; page?: number; limit?: number },
  )
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const query = new URLSearchParams();
    if (data.status) query.set("status", data.status);
    if (data.page !== undefined) query.set("page", String(data.page));
    if (data.limit !== undefined) query.set("limit", String(data.limit));
    const res = await fetch(
      `${env.apiUrl}/api/v1/orders/inbox?${query.toString()}`,
      { headers: { cookie: cookieHeader } },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to load order inbox");
    }
    return (await res.json()) as OrderInboxResponse;
  });

// ── Get Order Detail ─────────────────────────────────────────────────────────

export const getOrderFn = createServerFn({ method: "GET" })
  .validator((data: unknown): { orderId: string } => data as { orderId: string })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const res = await fetch(`${env.apiUrl}/api/v1/orders/${data.orderId}`, {
      headers: { cookie: cookieHeader },
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Order not found");
    }
    return (await res.json()) as OrderResponse;
  });

// ── Get Patient Orders ────────────────────────────────────────────────────────

export const getPatientOrdersFn = createServerFn({ method: "GET" })
  .validator((data: unknown): { patientId: string } => data as { patientId: string })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const res = await fetch(
      `${env.apiUrl}/api/v1/patients/${data.patientId}/orders`,
      { headers: { cookie: cookieHeader } },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to load patient orders");
    }
    return (await res.json()) as OrderListResponse;
  });

// ── Create Order ──────────────────────────────────────────────────────────────

export const createOrderFn = createServerFn({ method: "POST" })
  .validator((data: unknown): CreateOrderInput => data as CreateOrderInput)
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const res = await fetch(`${env.apiUrl}/api/v1/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to create order");
    }
    return (await res.json()) as OrderResponse;
  });

// ── Sign Order ────────────────────────────────────────────────────────────────

export const signOrderFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown): { orderId: string; body: SignOrderBody } =>
      data as { orderId: string; body: SignOrderBody },
  )
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const res = await fetch(`${env.apiUrl}/api/v1/orders/${data.orderId}/sign`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader },
      body: JSON.stringify(data.body),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to sign order");
    }
    return (await res.json()) as OrderResponse;
  });

// ── Reject Order ──────────────────────────────────────────────────────────────

export const rejectOrderFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown): { orderId: string; body: RejectOrderBody } =>
      data as { orderId: string; body: RejectOrderBody },
  )
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const res = await fetch(`${env.apiUrl}/api/v1/orders/${data.orderId}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader },
      body: JSON.stringify(data.body),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to reject order");
    }
    return (await res.json()) as OrderResponse;
  });

// ── Void Order ────────────────────────────────────────────────────────────────

export const voidOrderFn = createServerFn({ method: "POST" })
  .validator((data: unknown): { orderId: string } => data as { orderId: string })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const res = await fetch(`${env.apiUrl}/api/v1/orders/${data.orderId}/void`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to void order");
    }
    return (await res.json()) as OrderResponse;
  });

// ── Mark No-Signature Required ────────────────────────────────────────────────

export const markNoSigRequiredFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown): { orderId: string; body: ExceptionOrderBody } =>
      data as { orderId: string; body: ExceptionOrderBody },
  )
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const res = await fetch(
      `${env.apiUrl}/api/v1/orders/${data.orderId}/exception`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader },
        body: JSON.stringify(data.body),
      },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to mark exception");
    }
    return (await res.json()) as OrderResponse;
  });

// ── Resend / Reroute Order ────────────────────────────────────────────────────

export const resendOrderFn = createServerFn({ method: "POST" })
  .validator(
    (data: unknown): { orderId: string; body: ResendOrderBody } =>
      data as { orderId: string; body: ResendOrderBody },
  )
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const res = await fetch(`${env.apiUrl}/api/v1/orders/${data.orderId}/resend`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie: cookieHeader },
      body: JSON.stringify(data.body),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to resend order");
    }
    return (await res.json()) as OrderResponse;
  });

// ── Mark Returned to Chart ────────────────────────────────────────────────────

export const markReturnedFn = createServerFn({ method: "POST" })
  .validator((data: unknown): { orderId: string } => data as { orderId: string })
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";
    const res = await fetch(
      `${env.apiUrl}/api/v1/orders/${data.orderId}/returned`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader },
        body: JSON.stringify({}),
      },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error ?? "Failed to mark order returned");
    }
    return (await res.json()) as OrderResponse;
  });

// ── List Overdue Orders ───────────────────────────────────────────────────────

export const listOverdueOrdersFn = createServerFn({ method: "GET" }).handler(async () => {
  const cookieHeader = getRequestHeader("cookie") ?? "";
  const res = await fetch(`${env.apiUrl}/api/v1/orders/overdue`, {
    headers: { cookie: cookieHeader },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to load overdue orders");
  }
  return (await res.json()) as OrderListResponse;
});
