/**
 * QAPIService — QAPI event lifecycle management (T3-11).
 * Creates, updates, closes QAPI events and manages action items.
 * Closed events are immutable (enforced at DB level via RLS).
 */

import { db } from "@/db/client.js";
import { qapiActionItems } from "@/db/schema/qapi-action-items.table.js";
import { qapiEvents } from "@/db/schema/qapi-events.table.js";
import { users } from "@/db/schema/users.table.js";
import { AuditService } from "@/contexts/identity/services/audit.service.js";
import type {
  QAPIAddActionItemBodyType,
  QAPICloseBodyType,
  QAPICreateBodyType,
  QAPIEventResponseType,
  QAPIListQueryType,
  QAPIPatchBodyType,
} from "../schemas/qapi.schema.js";
import { and, count, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";

// ── Custom errors ─────────────────────────────────────────────────────────────

export class QAPIEventNotFoundError extends Error {
  constructor(id: string) {
    super(`QAPI event not found: ${id}`);
    this.name = "QAPIEventNotFoundError";
  }
}

export class QAPIEventClosedError extends Error {
  constructor() {
    super("Cannot modify a closed QAPI event");
    this.name = "QAPIEventClosedError";
  }
}

export class QAPIActionItemNotFoundError extends Error {
  constructor(id: string) {
    super(`QAPI action item not found: ${id}`);
    this.name = "QAPIActionItemNotFoundError";
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function resolveUserName(userId: string): Promise<string> {
  const [user] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  return user?.name ?? "Unknown";
}

async function buildEventResponse(
  eventRow: typeof qapiEvents.$inferSelect,
): Promise<QAPIEventResponseType> {
  const actionItemRows = await db
    .select({
      id: qapiActionItems.id,
      eventId: qapiActionItems.eventId,
      locationId: qapiActionItems.locationId,
      action: qapiActionItems.action,
      assignedToId: qapiActionItems.assignedToId,
      assignedToName: users.name,
      dueDate: qapiActionItems.dueDate,
      completedAt: qapiActionItems.completedAt,
      completedById: qapiActionItems.completedById,
      createdAt: qapiActionItems.createdAt,
    })
    .from(qapiActionItems)
    .leftJoin(users, eq(qapiActionItems.assignedToId, users.id))
    .where(eq(qapiActionItems.eventId, eventRow.id))
    .orderBy(qapiActionItems.createdAt);

  const reportedByName = await resolveUserName(eventRow.reportedById);

  return {
    id: eventRow.id,
    locationId: eventRow.locationId,
    eventType: eventRow.eventType,
    patientId: eventRow.patientId ?? null,
    reportedById: eventRow.reportedById,
    reportedByName,
    occurredAt: eventRow.occurredAt.toISOString(),
    description: eventRow.description,
    rootCauseAnalysis: eventRow.rootCauseAnalysis ?? null,
    linkedTrendContext: eventRow.linkedTrendContext ?? null,
    status: eventRow.status,
    closedAt: eventRow.closedAt?.toISOString() ?? null,
    closedById: eventRow.closedById ?? null,
    closureEvidence: eventRow.closureEvidence ?? null,
    actionItems: actionItemRows.map((a) => ({
      id: a.id,
      eventId: a.eventId,
      locationId: a.locationId,
      action: a.action,
      assignedToId: a.assignedToId,
      assignedToName: a.assignedToName ?? "Unknown",
      dueDate: a.dueDate,
      completedAt: a.completedAt?.toISOString() ?? null,
      completedById: a.completedById ?? null,
      createdAt: a.createdAt.toISOString(),
    })),
    createdAt: eventRow.createdAt.toISOString(),
    updatedAt: eventRow.updatedAt.toISOString(),
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export class QAPIService {
  static async createEvent(
    body: QAPICreateBodyType,
    locationId: string,
    userId: string,
    userRole = "clinician",
  ): Promise<QAPIEventResponseType> {
    const [row] = await db
      .insert(qapiEvents)
      .values({
        locationId,
        eventType: body.eventType,
        patientId: body.patientId ?? null,
        reportedById: userId,
        occurredAt: new Date(body.occurredAt),
        description: body.description,
        rootCauseAnalysis: body.rootCauseAnalysis ?? null,
        linkedTrendContext: body.linkedTrendContext ?? null,
        status: "OPEN",
      })
      .returning();

    if (!row) throw new Error("Failed to create QAPI event");

    await AuditService.log("create", userId, null, {
      userRole,
      locationId,
      resourceType: "qapi_events",
      resourceId: row.id,
      details: { eventType: row.eventType },
    });

    return buildEventResponse(row);
  }

  static async listEvents(
    query: QAPIListQueryType,
    locationId: string,
  ): Promise<{ data: QAPIEventResponseType[]; total: number }> {
    const conditions = [eq(qapiEvents.locationId, locationId)];

    if (query.status) conditions.push(eq(qapiEvents.status, query.status));
    if (query.eventType) conditions.push(eq(qapiEvents.eventType, query.eventType));
    if (query.from)
      conditions.push(gte(qapiEvents.occurredAt, new Date(query.from)));
    if (query.to)
      conditions.push(lte(qapiEvents.occurredAt, new Date(query.to)));

    const where = and(...conditions);
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const [rows, [countRow]] = await Promise.all([
      db
        .select()
        .from(qapiEvents)
        .where(where)
        .orderBy(desc(qapiEvents.createdAt))
        .limit(limit)
        .offset(offset),
      db.select({ c: count() }).from(qapiEvents).where(where),
    ]);

    const data = await Promise.all(rows.map(buildEventResponse));
    return { data, total: Number(countRow?.c ?? 0) };
  }

  static async getEvent(id: string, locationId: string): Promise<QAPIEventResponseType> {
    const [row] = await db
      .select()
      .from(qapiEvents)
      .where(and(eq(qapiEvents.id, id), eq(qapiEvents.locationId, locationId)));

    if (!row) throw new QAPIEventNotFoundError(id);
    return buildEventResponse(row);
  }

  static async patchEvent(
    id: string,
    body: QAPIPatchBodyType,
    locationId: string,
    userId: string,
    userRole = "clinician",
  ): Promise<QAPIEventResponseType> {
    const [existing] = await db
      .select({ status: qapiEvents.status })
      .from(qapiEvents)
      .where(and(eq(qapiEvents.id, id), eq(qapiEvents.locationId, locationId)));

    if (!existing) throw new QAPIEventNotFoundError(id);
    if (existing.status === "CLOSED") throw new QAPIEventClosedError();

    const updates: Partial<typeof qapiEvents.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (body.eventType !== undefined) updates.eventType = body.eventType;
    if (body.status !== undefined) updates.status = body.status;
    if (body.description !== undefined) updates.description = body.description;
    if (body.rootCauseAnalysis !== undefined)
      updates.rootCauseAnalysis = body.rootCauseAnalysis;

    const [updated] = await db
      .update(qapiEvents)
      .set(updates)
      .where(and(eq(qapiEvents.id, id), eq(qapiEvents.locationId, locationId)))
      .returning();

    if (!updated) throw new QAPIEventNotFoundError(id);

    await AuditService.log("update", userId, null, {
      userRole,
      locationId,
      resourceType: "qapi_events",
      resourceId: id,
      details: { changes: body as Record<string, unknown> },
    });

    return buildEventResponse(updated);
  }

  static async closeEvent(
    id: string,
    body: QAPICloseBodyType,
    locationId: string,
    userId: string,
    userRole = "clinician",
  ): Promise<QAPIEventResponseType> {
    const [existing] = await db
      .select({ status: qapiEvents.status })
      .from(qapiEvents)
      .where(and(eq(qapiEvents.id, id), eq(qapiEvents.locationId, locationId)));

    if (!existing) throw new QAPIEventNotFoundError(id);
    if (existing.status === "CLOSED") throw new QAPIEventClosedError();

    const now = new Date();
    const [closed] = await db
      .update(qapiEvents)
      .set({
        status: "CLOSED",
        closedAt: now,
        closedById: userId,
        closureEvidence: body.closureEvidence,
        updatedAt: now,
      })
      .where(and(eq(qapiEvents.id, id), eq(qapiEvents.locationId, locationId)))
      .returning();

    if (!closed) throw new QAPIEventNotFoundError(id);

    await AuditService.log("update", userId, null, {
      userRole,
      locationId,
      resourceType: "qapi_events",
      resourceId: id,
      details: { closedAt: now.toISOString() },
    });

    return buildEventResponse(closed);
  }

  static async addActionItem(
    eventId: string,
    body: QAPIAddActionItemBodyType,
    locationId: string,
    userId: string,
    userRole = "clinician",
  ): Promise<QAPIEventResponseType> {
    const [existing] = await db
      .select({ status: qapiEvents.status })
      .from(qapiEvents)
      .where(and(eq(qapiEvents.id, eventId), eq(qapiEvents.locationId, locationId)));

    if (!existing) throw new QAPIEventNotFoundError(eventId);
    if (existing.status === "CLOSED") throw new QAPIEventClosedError();

    await db.insert(qapiActionItems).values({
      eventId,
      locationId,
      action: body.action,
      assignedToId: body.assignedToId,
      dueDate: body.dueDate,
    });

    // Mark event as IN_PROGRESS if still OPEN
    await db
      .update(qapiEvents)
      .set({ status: "IN_PROGRESS", updatedAt: new Date() })
      .where(
        and(
          eq(qapiEvents.id, eventId),
          eq(qapiEvents.status, "OPEN"),
          eq(qapiEvents.locationId, locationId),
        ),
      );

    await AuditService.log("create", userId, null, {
      userRole,
      locationId,
      resourceType: "qapi_action_items",
      details: { eventId, action: body.action, assignedToId: body.assignedToId },
    });

    const [refreshed] = await db
      .select()
      .from(qapiEvents)
      .where(eq(qapiEvents.id, eventId));
    if (!refreshed) throw new QAPIEventNotFoundError(eventId);
    return buildEventResponse(refreshed);
  }

  static async completeActionItem(
    eventId: string,
    itemId: string,
    locationId: string,
    userId: string,
    userRole = "clinician",
  ): Promise<QAPIEventResponseType> {
    const [item] = await db
      .select({ id: qapiActionItems.id, completedAt: qapiActionItems.completedAt })
      .from(qapiActionItems)
      .where(
        and(eq(qapiActionItems.id, itemId), eq(qapiActionItems.locationId, locationId)),
      );

    if (!item) throw new QAPIActionItemNotFoundError(itemId);

    const now = new Date();
    await db
      .update(qapiActionItems)
      .set({ completedAt: now, completedById: userId })
      .where(eq(qapiActionItems.id, itemId));

    await AuditService.log("update", userId, null, {
      userRole,
      locationId,
      resourceType: "qapi_action_items",
      resourceId: itemId,
      details: { eventId },
    });

    const [refreshed] = await db
      .select()
      .from(qapiEvents)
      .where(eq(qapiEvents.id, eventId));
    if (!refreshed) throw new QAPIEventNotFoundError(eventId);
    return buildEventResponse(refreshed);
  }

  /** For overdue check worker — does NOT require RLS context */
  static async getOverdueActionItems(): Promise<
    { id: string; eventId: string; assignedToId: string; locationId: string; dueDate: string }[]
  > {
    const today = new Date().toISOString().split("T")[0] ?? "";
    const rows = await db
      .select({
        id: qapiActionItems.id,
        eventId: qapiActionItems.eventId,
        assignedToId: qapiActionItems.assignedToId,
        locationId: qapiActionItems.locationId,
        dueDate: qapiActionItems.dueDate,
      })
      .from(qapiActionItems)
      .innerJoin(qapiEvents, eq(qapiActionItems.eventId, qapiEvents.id))
      .where(
        and(
          isNull(qapiActionItems.completedAt),
          lte(qapiActionItems.dueDate, today),
          sql`${qapiEvents.status} != 'CLOSED'`,
        ),
      );
    return rows.map((r) => ({ ...r, dueDate: r.dueDate }));
  }
}
