/**
 * OrderService — T3-9: Physician Order Inbox + Paperless Order Routing
 *
 * State machine + CRUD for the physician order lifecycle.
 * Emits Socket.IO events on every state transition via a module-level
 * event emitter wired in server.ts via setOrderEventEmitter().
 */

import { db } from "@/db/client.js";
import { orders } from "@/db/schema/orders.table.js";
import { logAudit } from "@/contexts/identity/services/audit.service.js";
import { and, eq, isNull, lt, lte, or, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type {
  CreateOrderBody,
  DeliveryMethod,
  ExceptionOrderBody,
  OrderInboxResponse,
  OrderListResponse,
  OrderResponse,
  OrderStatus,
  OrderType,
  ResendOrderBody,
  SignOrderBody,
} from "../schemas/order.schema.js";

// ── Socket.IO event emitter ────────────────────────────────────────────────────

type OrderEventEmitter = {
  emit(event: string, data: unknown): void;
};

let _emitter: OrderEventEmitter | null = null;

export function setOrderEventEmitter(e: OrderEventEmitter): void {
  _emitter = e;
}

function emitEvent(event: string, data: unknown): void {
  _emitter?.emit(event, data);
}

// ── State machine ─────────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  DRAFT: ["PENDING_SIGNATURE"],
  PENDING_SIGNATURE: ["VIEWED", "SIGNED", "REJECTED", "EXPIRED", "VOIDED", "NO_SIGNATURE_REQUIRED"],
  VIEWED: ["SIGNED", "REJECTED", "VOIDED"],
  SIGNED: ["COMPLETED_RETURNED"],
  REJECTED: [],
  EXPIRED: [],
  VOIDED: [],
  NO_SIGNATURE_REQUIRED: [],
  COMPLETED_RETURNED: [],
};

// ── Urgency reason by order type ──────────────────────────────────────────────

const URGENCY_REASON_BY_TYPE: Record<OrderType, string> = {
  VERBAL: "72h CMS verbal order window",
  DME: "DME delivery coordination",
  F2F_DOCUMENTATION: "Recertification blocking — F2F required",
  FREQUENCY_CHANGE: "Visit frequency update pending approval",
  MEDICATION: "Medication order awaiting physician signature",
};

// ── Custom errors ─────────────────────────────────────────────────────────────

export class OrderNotFoundError extends Error {
  readonly statusCode = 404;
  constructor(id: string) {
    super(`Order not found: ${id}`);
    this.name = "OrderNotFoundError";
  }
}

export class OrderInvalidTransitionError extends Error {
  readonly statusCode = 422;
  readonly code = "ORDER_INVALID_TRANSITION";
  constructor(from: OrderStatus, to: OrderStatus) {
    super(`Invalid order transition: ${from} → ${to}`);
    this.name = "OrderInvalidTransitionError";
  }
}

export class OrderInsufficientRoleError extends Error {
  readonly statusCode = 403;
  constructor(action: string) {
    super(`Insufficient role for action: ${action}`);
    this.name = "OrderInsufficientRoleError";
  }
}

// ── Row type ──────────────────────────────────────────────────────────────────

type OrderRow = typeof orders.$inferSelect;

// ── Downstream blocking logic ─────────────────────────────────────────────────

function computeBlockedDownstream(row: OrderRow): string | null {
  const now = new Date();
  const isActive =
    row.status === "PENDING_SIGNATURE" || row.status === "VIEWED";

  if (!isActive) return null;

  const isOverdue = row.dueAt < now;

  if (row.type === "VERBAL" && isOverdue) {
    return "Claim billing blocked until signed";
  }
  if (row.type === "F2F_DOCUMENTATION") {
    return "Recertification blocked";
  }
  return null;
}

// ── Urgency label ─────────────────────────────────────────────────────────────

type UrgencyLabel = "Due soon" | "Urgent" | "Critical" | "Overdue" | null;

function computeUrgencyLabel(row: OrderRow): UrgencyLabel {
  const terminalStatuses: OrderStatus[] = [
    "SIGNED",
    "REJECTED",
    "VOIDED",
    "NO_SIGNATURE_REQUIRED",
    "COMPLETED_RETURNED",
  ];
  if (terminalStatuses.includes(row.status as OrderStatus)) return null;

  const now = new Date();
  const dueAt = new Date(row.dueAt);

  if (dueAt < now) return "Overdue";

  const hoursRemaining = (dueAt.getTime() - now.getTime()) / (1000 * 60 * 60);

  if (hoursRemaining > 48) return "Due soon";
  if (hoursRemaining > 12) return "Urgent";
  return "Critical";
}

// ── Row mapper ────────────────────────────────────────────────────────────────

function mapOrderRow(row: OrderRow): OrderResponse {
  return {
    id: row.id,
    locationId: row.locationId,
    patientId: row.patientId,
    issuingClinicianId: row.issuingClinicianId,
    physicianId: row.physicianId ?? null,
    type: row.type as OrderType,
    content: row.content,
    status: row.status as OrderStatus,
    dueAt: row.dueAt.toISOString(),
    signedAt: row.signedAt?.toISOString() ?? null,
    rejectionReason: row.rejectionReason ?? null,
    verbalReadBackFlag: row.verbalReadBackFlag,
    verbalReadBackAt: row.verbalReadBackAt?.toISOString() ?? null,
    deliveryMethod: (row.deliveryMethod as DeliveryMethod) ?? null,
    urgencyReason: row.urgencyReason ?? null,
    linkedSignatureRequestId: row.linkedSignatureRequestId ?? null,
    groupBundleId: row.groupBundleId ?? null,
    noSignatureReason: row.noSignatureReason ?? null,
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidedByUserId: row.voidedByUserId ?? null,
    completedReturnedAt: row.completedReturnedAt?.toISOString() ?? null,
    reminderCount: row.reminderCount,
    lastReminderAt: row.lastReminderAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    urgencyLabel: computeUrgencyLabel(row),
    blockedDownstream: computeBlockedDownstream(row),
  };
}

// ── OrderService ──────────────────────────────────────────────────────────────

export class OrderService {
  constructor(private readonly log: FastifyBaseLogger) {}

  /**
   * Creates a new order. Sets urgencyReason automatically based on order type.
   */
  async createOrder(
    input: CreateOrderBody,
    userId: string,
    locationId: string,
  ): Promise<OrderResponse> {
    await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    await db.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);

    const urgencyReason = URGENCY_REASON_BY_TYPE[input.type as OrderType];

    const [row] = await db
      .insert(orders)
      .values({
        locationId,
        patientId: input.patientId,
        issuingClinicianId: userId,
        physicianId: input.physicianId ?? null,
        type: input.type,
        content: input.content,
        status: "PENDING_SIGNATURE",
        dueAt: new Date(input.dueAt),
        verbalReadBackFlag: input.verbalReadBackFlag ?? false,
        deliveryMethod: input.deliveryMethod ?? null,
        groupBundleId: input.groupBundleId ?? null,
        urgencyReason,
      })
      .returning();

    if (!row) {
      throw new Error("Failed to create order");
    }

    await logAudit("create", userId, input.patientId, {
      userRole: "clinician",
      locationId,
      resourceType: "order",
      resourceId: row.id,
      details: { type: input.type, status: "PENDING_SIGNATURE" },
    });

    emitEvent("order:created", {
      orderId: row.id,
      type: row.type,
      patientId: row.patientId,
      physicianId: row.physicianId ?? null,
      dueAt: row.dueAt.toISOString(),
      urgencyReason: row.urgencyReason ?? null,
    });

    this.log.info({ orderId: row.id, type: row.type }, "Order created");

    return mapOrderRow(row);
  }

  /**
   * Returns the physician inbox with pagination and counts.
   */
  async getInbox(
    physicianId: string,
    filters: { status?: string; page?: number; limit?: number },
    userId: string,
    locationId: string,
  ): Promise<OrderInboxResponse> {
    await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    await db.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);

    const pageSize = filters.limit ?? 25;
    const offset = ((filters.page ?? 1) - 1) * pageSize;

    const conditions = [
      eq(orders.locationId, locationId),
      eq(orders.physicianId, physicianId),
    ];

    if (filters.status) {
      conditions.push(eq(orders.status, filters.status as OrderStatus));
    }

    const rows = await db
      .select()
      .from(orders)
      .where(and(...conditions))
      .orderBy(orders.dueAt)
      .limit(pageSize)
      .offset(offset);

    const allRows = await db
      .select()
      .from(orders)
      .where(and(eq(orders.locationId, locationId), eq(orders.physicianId, physicianId)));

    const now = new Date();

    const counts = {
      pending: allRows.filter(
        (r) => r.status === "PENDING_SIGNATURE" || r.status === "VIEWED",
      ).length,
      overdue: allRows.filter(
        (r) =>
          (r.status === "PENDING_SIGNATURE" || r.status === "VIEWED") && r.dueAt < now,
      ).length,
      rejected: allRows.filter((r) => r.status === "REJECTED").length,
      exceptions: allRows.filter((r) => r.status === "NO_SIGNATURE_REQUIRED").length,
      completed: allRows.filter(
        (r) => r.status === "SIGNED" || r.status === "COMPLETED_RETURNED",
      ).length,
    };

    return {
      items: rows.map(mapOrderRow),
      counts,
      total: allRows.length,
    };
  }

  /**
   * Returns a single order by ID.
   */
  async getOrder(id: string, userId: string, locationId: string): Promise<OrderResponse> {
    await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    await db.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);

    const [row] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.locationId, locationId)));

    if (!row) {
      throw new OrderNotFoundError(id);
    }

    await logAudit("view", userId, row.patientId, {
      userRole: "user",
      locationId,
      resourceType: "order",
      resourceId: id,
    });

    return mapOrderRow(row);
  }

  /**
   * Returns all orders for a patient.
   */
  async getPatientOrders(
    patientId: string,
    userId: string,
    locationId: string,
  ): Promise<OrderListResponse> {
    await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    await db.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);

    const rows = await db
      .select()
      .from(orders)
      .where(and(eq(orders.patientId, patientId), eq(orders.locationId, locationId)))
      .orderBy(orders.dueAt);

    await logAudit("view", userId, patientId, {
      userRole: "user",
      locationId,
      resourceType: "order",
      details: { patientId, count: rows.length },
    });

    return {
      items: rows.map(mapOrderRow),
      total: rows.length,
    };
  }

  /**
   * Returns overdue orders (PENDING_SIGNATURE + VIEWED past dueAt).
   */
  async listOverdue(userId: string, locationId: string): Promise<OrderListResponse> {
    await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    await db.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);

    const now = new Date();

    const rows = await db
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.locationId, locationId),
          or(eq(orders.status, "PENDING_SIGNATURE"), eq(orders.status, "VIEWED")),
          lt(orders.dueAt, now),
        ),
      )
      .orderBy(orders.dueAt);

    return {
      items: rows.map(mapOrderRow),
      total: rows.length,
    };
  }

  /**
   * Marks an order as viewed (PENDING_SIGNATURE → VIEWED).
   */
  async markViewed(id: string, userId: string, locationId: string): Promise<OrderResponse> {
    return this.transitionState(id, "VIEWED", userId, locationId, {});
  }

  /**
   * Signs an order (PENDING_SIGNATURE | VIEWED → SIGNED).
   */
  async signOrder(
    id: string,
    input: SignOrderBody,
    userId: string,
    locationId: string,
  ): Promise<OrderResponse> {
    const extraUpdates: Partial<typeof orders.$inferInsert> = {
      signedAt: new Date(),
    };
    if (input.linkedSignatureRequestId) {
      extraUpdates.linkedSignatureRequestId = input.linkedSignatureRequestId;
    }
    return this.transitionState(id, "SIGNED", userId, locationId, extraUpdates);
  }

  /**
   * Rejects an order (PENDING_SIGNATURE | VIEWED → REJECTED).
   */
  async rejectOrder(
    id: string,
    rejectionReason: string,
    userId: string,
    locationId: string,
  ): Promise<OrderResponse> {
    return this.transitionState(id, "REJECTED", userId, locationId, { rejectionReason });
  }

  /**
   * Voids an order (supervisor/admin only).
   */
  async voidOrder(
    id: string,
    supervisorUserId: string,
    locationId: string,
  ): Promise<OrderResponse> {
    return this.transitionState(id, "VOIDED", supervisorUserId, locationId, {
      voidedAt: new Date(),
      voidedByUserId: supervisorUserId,
    });
  }

  /**
   * Marks an order as not requiring a signature (supervisor/admin only).
   */
  async markNoSignatureRequired(
    id: string,
    noSignatureReason: string,
    supervisorUserId: string,
    locationId: string,
  ): Promise<OrderResponse> {
    return this.transitionState(
      id,
      "NO_SIGNATURE_REQUIRED",
      supervisorUserId,
      locationId,
      { noSignatureReason },
    );
  }

  /**
   * Resends/reroutes an order to a different physician or delivery method.
   */
  async resendOrder(
    id: string,
    input: ResendOrderBody,
    userId: string,
    locationId: string,
  ): Promise<OrderResponse> {
    await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    await db.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);

    const [existing] = await db
      .select()
      .from(orders)
      .where(and(eq(orders.id, id), eq(orders.locationId, locationId)));

    if (!existing) {
      throw new OrderNotFoundError(id);
    }

    const updateValues: Partial<typeof orders.$inferInsert> = {
      reminderCount: 0,
      lastReminderAt: null,
      updatedAt: new Date(),
    };

    if (input.physicianId !== undefined) {
      updateValues.physicianId = input.physicianId;
    }
    if (input.deliveryMethod !== undefined) {
      updateValues.deliveryMethod = input.deliveryMethod;
    }

    const [updated] = await db
      .update(orders)
      .set(updateValues)
      .where(and(eq(orders.id, id), eq(orders.locationId, locationId)))
      .returning();

    if (!updated) {
      throw new OrderNotFoundError(id);
    }

    await logAudit("update", userId, updated.patientId, {
      userRole: "user",
      locationId,
      resourceType: "order",
      resourceId: id,
      details: { action: "resend", deliveryMethod: input.deliveryMethod, physicianId: input.physicianId },
    });

    this.log.info({ orderId: id }, "Order resent");

    return mapOrderRow(updated);
  }

  /**
   * Marks a signed order as completed/returned to chart (SIGNED → COMPLETED_RETURNED).
   */
  async markReturnedToChart(
    id: string,
    userId: string,
    locationId: string,
  ): Promise<OrderResponse> {
    return this.transitionState(id, "COMPLETED_RETURNED", userId, locationId, {
      completedReturnedAt: new Date(),
    });
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async transitionState(
    id: string,
    toStatus: OrderStatus,
    userId: string,
    locationId: string,
    extraUpdates: Partial<typeof orders.$inferInsert>,
  ): Promise<OrderResponse> {
    await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    await db.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);

    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, id), eq(orders.locationId, locationId)));

      if (!existing) {
        throw new OrderNotFoundError(id);
      }

      const currentStatus = existing.status as OrderStatus;
      const allowedNext = VALID_TRANSITIONS[currentStatus];

      if (!allowedNext.includes(toStatus)) {
        throw new OrderInvalidTransitionError(currentStatus, toStatus);
      }

      const [updated] = await tx
        .update(orders)
        .set({
          status: toStatus,
          updatedAt: new Date(),
          ...extraUpdates,
        })
        .where(and(eq(orders.id, id), eq(orders.locationId, locationId)))
        .returning();

      if (!updated) {
        throw new OrderNotFoundError(id);
      }

      await logAudit("update", userId, updated.patientId, {
        userRole: "user",
        locationId,
        resourceType: "order",
        resourceId: id,
        details: { fromStatus: currentStatus, toStatus },
      }, tx);

      return updated;
    });

    const mapped = mapOrderRow(result);

    // Emit Socket.IO event per transition
    switch (toStatus) {
      case "VIEWED":
        emitEvent("order:viewed", {
          orderId: id,
          physicianId: result.physicianId ?? userId,
        });
        break;
      case "SIGNED":
        emitEvent("order:signed", {
          orderId: id,
          signedAt: result.signedAt?.toISOString() ?? new Date().toISOString(),
        });
        break;
      case "REJECTED":
        emitEvent("order:rejected", {
          orderId: id,
          rejectionReason: result.rejectionReason ?? "",
        });
        break;
      case "EXPIRED":
        emitEvent("order:expired", {
          orderId: id,
          type: result.type,
          patientId: result.patientId,
        });
        break;
      case "NO_SIGNATURE_REQUIRED":
        emitEvent("order:exception", {
          orderId: id,
          noSignatureReason: result.noSignatureReason ?? "",
        });
        break;
      case "COMPLETED_RETURNED":
        emitEvent("order:completed_returned", {
          orderId: id,
          completedReturnedAt: result.completedReturnedAt?.toISOString() ?? new Date().toISOString(),
        });
        break;
      default:
        break;
    }

    this.log.info({ orderId: id, toStatus }, "Order state transitioned");

    return mapped;
  }
}
