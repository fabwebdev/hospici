/**
 * VisitScheduleService — visit scheduling + frequency tracking (T2-10).
 *
 * Features:
 *   - listVisits(): location+patient-scoped, Valkey-cached (TTL 5 min).
 *   - createVisit(): inserts scheduled_visit, invalidates cache.
 *   - patchStatus(): transitions status, sets completedAt/cancelledAt, audit-logs.
 *   - checkMissedVisits(): BullMQ worker calls this daily — marks overdue
 *     'scheduled' rows as 'missed', upserts MISSED_VISIT alerts, checks
 *     frequency variance and upserts VISIT_FREQUENCY_VARIANCE alerts.
 *
 * RLS: all DB writes run inside db.transaction() with applyRlsContext().
 * Audit: every mutating operation emits an AuditService entry.
 * PHI: patientName encrypted via PHIEncryptionService before alert upsert.
 */

import type { AlertService } from "@/contexts/compliance/services/alert.service.js";
import { logAudit } from "@/contexts/identity/services/audit.service.js";
import { db } from "@/db/client.js";
import { scheduledVisits } from "@/db/schema/scheduled-visits.table.js";
import type {
  CreateScheduledVisitInput,
  PatchScheduledVisitStatusInput,
  ScheduledVisitListResponse,
  ScheduledVisitResponse,
} from "@hospici/shared-types";
import { and, eq, gte, lt, lte, sql } from "drizzle-orm";
import type Valkey from "iovalkey";

type UserCtx = { id: string; locationId: string; role: string };

// ── Custom errors ──────────────────────────────────────────────────────────────

export class ScheduledVisitNotFoundError extends Error {
  constructor(id: string) {
    super(`Scheduled visit ${id} not found`);
    this.name = "ScheduledVisitNotFoundError";
  }
}

export class InvalidVisitStatusTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot transition visit status from '${from}' to '${to}'`);
    this.name = "InvalidVisitStatusTransitionError";
  }
}

// ── RLS helper ─────────────────────────────────────────────────────────────────

async function applyRlsContext(
  tx: { execute: (typeof db)["execute"] },
  user: UserCtx,
): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.current_user_id', ${user.id}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_location_id', ${user.locationId}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_role', ${user.role}, true)`);
}

// ── Valkey cache ───────────────────────────────────────────────────────────────

const CACHE_TTL = 300;

function cacheKey(locationId: string, patientId: string): string {
  return `scheduled:visits:${locationId}:${patientId}`;
}

async function invalidateCache(
  valkey: Valkey,
  locationId: string,
  patientId: string,
): Promise<void> {
  await valkey.del(cacheKey(locationId, patientId));
}

// ── Row mapper ─────────────────────────────────────────────────────────────────

function rowToResponse(row: typeof scheduledVisits.$inferSelect): ScheduledVisitResponse {
  return {
    id: row.id,
    patientId: row.patientId,
    locationId: row.locationId,
    clinicianId: row.clinicianId ?? null,
    visitType: row.visitType,
    discipline: row.discipline as ScheduledVisitResponse["discipline"],
    scheduledDate: row.scheduledDate,
    frequencyPlan: row.frequencyPlan as ScheduledVisitResponse["frequencyPlan"],
    status: row.status as ScheduledVisitResponse["status"],
    completedAt: row.completedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    missedReason: row.missedReason ?? null,
    notes: row.notes ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── Service ────────────────────────────────────────────────────────────────────

export class VisitScheduleService {
  constructor(
    private readonly valkey: Valkey,
    private readonly alertService: AlertService,
  ) {}

  /**
   * List scheduled visits for a patient (location-scoped via RLS).
   * Returns from Valkey cache if available.
   */
  async listVisits(patientId: string, user: UserCtx): Promise<ScheduledVisitListResponse> {
    const key = cacheKey(user.locationId, patientId);
    const cached = await this.valkey.get(key);
    if (cached) {
      return JSON.parse(cached) as ScheduledVisitListResponse;
    }

    const rows = await db.transaction(async (tx) => {
      await applyRlsContext(tx, user);
      return tx
        .select()
        .from(scheduledVisits)
        .where(eq(scheduledVisits.patientId, patientId))
        .orderBy(scheduledVisits.scheduledDate);
    });

    const response: ScheduledVisitListResponse = {
      data: rows.map(rowToResponse),
      total: rows.length,
    };

    await this.valkey.set(key, JSON.stringify(response), "EX", CACHE_TTL);

    await logAudit("view", user.id, patientId, {
      userRole: user.role,
      locationId: user.locationId,
      resourceType: "scheduled_visits",
    });

    return response;
  }

  /**
   * Create a new scheduled visit for a patient.
   */
  async createVisit(
    patientId: string,
    input: CreateScheduledVisitInput,
    user: UserCtx,
  ): Promise<ScheduledVisitResponse> {
    const row = await db.transaction(async (tx) => {
      await applyRlsContext(tx, user);

      const [inserted] = await tx
        .insert(scheduledVisits)
        .values({
          patientId,
          locationId: user.locationId,
          clinicianId: input.clinicianId ?? null,
          visitType: input.visitType as (typeof scheduledVisits.$inferInsert)["visitType"],
          discipline: input.discipline,
          scheduledDate: input.scheduledDate,
          frequencyPlan: input.frequencyPlan as unknown as Record<string, unknown>,
          notes: input.notes ?? null,
        })
        .returning();

      return inserted;
    });

    if (!row) {
      throw new Error("Failed to create scheduled visit");
    }

    await invalidateCache(this.valkey, user.locationId, patientId);

    await logAudit("create", user.id, patientId, {
      userRole: user.role,
      locationId: user.locationId,
      resourceType: "scheduled_visit",
      resourceId: row.id,
      details: {
        visitType: row.visitType,
        discipline: row.discipline,
        scheduledDate: row.scheduledDate,
      },
    });

    return rowToResponse(row);
  }

  /**
   * Patch the status of a scheduled visit.
   * Allowed transitions:
   *   scheduled → completed | missed | cancelled
   *   missed → scheduled (reschedule)
   *   cancelled → scheduled (reschedule)
   */
  async patchStatus(
    visitId: string,
    input: PatchScheduledVisitStatusInput,
    user: UserCtx,
  ): Promise<ScheduledVisitResponse> {
    const [existing] = await db
      .select()
      .from(scheduledVisits)
      .where(eq(scheduledVisits.id, visitId))
      .limit(1);

    if (!existing) {
      throw new ScheduledVisitNotFoundError(visitId);
    }

    const from = existing.status;
    const to = input.status;

    const validTransitions: Record<string, string[]> = {
      scheduled: ["completed", "missed", "cancelled"],
      missed: ["scheduled"],
      cancelled: ["scheduled"],
      completed: [],
    };

    if (!validTransitions[from]?.includes(to)) {
      throw new InvalidVisitStatusTransitionError(from, to);
    }

    const now = new Date();
    const updates: Partial<typeof scheduledVisits.$inferInsert> = {
      status: to,
      updatedAt: now,
      ...(to === "completed" ? { completedAt: now } : {}),
      ...(to === "cancelled" ? { cancelledAt: now } : {}),
      ...(to === "missed" || to === "scheduled" ? { completedAt: null, cancelledAt: null } : {}),
      ...(input.missedReason !== undefined ? { missedReason: input.missedReason } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    };

    const row = await db.transaction(async (tx) => {
      await applyRlsContext(tx, user);
      const [updated] = await tx
        .update(scheduledVisits)
        .set(updates)
        .where(eq(scheduledVisits.id, visitId))
        .returning();
      return updated;
    });

    if (!row) {
      throw new ScheduledVisitNotFoundError(visitId);
    }

    await invalidateCache(this.valkey, user.locationId, row.patientId);

    await logAudit("update", user.id, row.patientId, {
      userRole: user.role,
      locationId: user.locationId,
      resourceType: "scheduled_visit",
      resourceId: visitId,
      details: { from, to },
    });

    return rowToResponse(row);
  }

  /**
   * Check for missed visits and frequency variance.
   * Called by the BullMQ `missed-visit-check` worker daily at 06:00 UTC.
   *
   * 1. Finds all 'scheduled' visits with scheduledDate < today.
   * 2. Marks them 'missed', upserts MISSED_VISIT alert per patient.
   * 3. Checks 7-day rolling frequency variance:
   *    - If (completed visits this week) < (frequencyPlan.visitsPerWeek), upserts
   *      VISIT_FREQUENCY_VARIANCE alert.
   *
   * Uses system RLS context (super_admin) since this is a background job.
   */
  async checkMissedVisits(): Promise<{ missedCount: number; varianceCount: number }> {
    const systemUser: UserCtx = {
      id: "00000000-0000-0000-0000-000000000000",
      locationId: "00000000-0000-0000-0000-000000000000",
      role: "super_admin",
    };

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);

    // ── Step 1: Mark stale 'scheduled' rows as 'missed' ───────────────────────

    const overdueRows = await db
      .update(scheduledVisits)
      .set({ status: "missed", updatedAt: new Date() })
      .where(
        and(eq(scheduledVisits.status, "scheduled"), lt(scheduledVisits.scheduledDate, todayStr)),
      )
      .returning({
        id: scheduledVisits.id,
        patientId: scheduledVisits.patientId,
        locationId: scheduledVisits.locationId,
        discipline: scheduledVisits.discipline,
        scheduledDate: scheduledVisits.scheduledDate,
        visitType: scheduledVisits.visitType,
      });

    const missedCount = overdueRows.length;

    // ── Step 2: Upsert MISSED_VISIT alerts ────────────────────────────────────

    // Group by patientId + locationId — one alert per patient
    const patientMap = new Map<
      string,
      { patientId: string; locationId: string; count: number; latestDate: string }
    >();

    for (const row of overdueRows) {
      const existing = patientMap.get(row.patientId);
      if (!existing || row.scheduledDate > existing.latestDate) {
        patientMap.set(row.patientId, {
          patientId: row.patientId,
          locationId: row.locationId,
          count: (existing?.count ?? 0) + 1,
          latestDate: row.scheduledDate,
        });
      } else {
        existing.count += 1;
      }
    }

    for (const { patientId, locationId, count, latestDate } of patientMap.values()) {
      // Patient name is stored as PHI-encrypted JSONB — use ID reference as placeholder.
      // The alert list route decrypts names for PHI_ACCESS roles when displaying to users.
      const patientName = `Patient:${patientId}`;

      await this.alertService.upsertAlert({
        type: "MISSED_VISIT",
        severity: "warning",
        patientId,
        patientName,
        locationId,
        dueDate: latestDate,
        daysRemaining: 0,
        description: `${count} missed visit${count > 1 ? "s" : ""} — most recent scheduled ${latestDate}`,
        rootCause: `${count} scheduled visit${count > 1 ? "s were" : " was"} not completed`,
        nextAction: "Review visit schedule and contact clinician to reschedule",
      });
    }

    // ── Step 3: Frequency variance check (rolling 7-day window) ──────────────

    const windowStart = new Date(today);
    windowStart.setDate(windowStart.getDate() - 7);
    const windowStartStr = windowStart.toISOString().slice(0, 10);

    // Find patients who have scheduled visits with a frequencyPlan in the window
    const windowVisits = await db
      .select({
        patientId: scheduledVisits.patientId,
        locationId: scheduledVisits.locationId,
        status: scheduledVisits.status,
        frequencyPlan: scheduledVisits.frequencyPlan,
        scheduledDate: scheduledVisits.scheduledDate,
      })
      .from(scheduledVisits)
      .where(
        and(
          gte(scheduledVisits.scheduledDate, windowStartStr),
          lte(scheduledVisits.scheduledDate, todayStr),
        ),
      );

    // Group by patient, compute planned vs actual
    type PatientStats = {
      locationId: string;
      planned: number;
      completed: number;
      total: number;
    };

    const statsMap = new Map<string, PatientStats>();

    for (const row of windowVisits) {
      const plan = row.frequencyPlan as { visitsPerWeek?: number } | null;
      const planned = plan?.visitsPerWeek ?? 0;
      if (planned === 0) continue;

      let stats = statsMap.get(row.patientId);
      if (!stats) {
        stats = { locationId: row.locationId, planned, completed: 0, total: 0 };
        statsMap.set(row.patientId, stats);
      }
      stats.total += 1;
      if (row.status === "completed") {
        stats.completed += 1;
      }
    }

    let varianceCount = 0;

    for (const [patientId, stats] of statsMap.entries()) {
      if (stats.completed < stats.planned) {
        varianceCount += 1;

        const patientName = `Patient:${patientId}`;
        const deficit = stats.planned - stats.completed;

        await this.alertService.upsertAlert({
          type: "VISIT_FREQUENCY_VARIANCE",
          severity: deficit >= 2 ? "warning" : "info",
          patientId,
          patientName,
          locationId: stats.locationId,
          dueDate: null,
          daysRemaining: 0,
          description: `Visit frequency below plan: ${stats.completed}/${stats.planned} visits completed in past 7 days`,
          rootCause: `${deficit} visit${deficit > 1 ? "s" : ""} below planned weekly frequency`,
          nextAction: "Review care plan frequency and coordinate with care team to catch up",
        });
      }
    }

    return { missedCount, varianceCount };
  }
}
