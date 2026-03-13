/**
 * AlertService — compliance alert persistence + escalation workflow.
 *
 * Features:
 *   - upsertAlert(): idempotent write — one active alert per (patient, type).
 *     Called by BullMQ workers with rootCause + nextAction populated.
 *   - listAlerts(): location-scoped, Valkey-cached (TTL 5 min).
 *   - acknowledgeAlert() / assignAlert() / resolveAlert() / snoozeAlert()
 *
 * Hard-block guard: snoozeAlert() throws AlertSnoozeError for hard-block types
 * (IDG_OVERDUE, NOE_DEADLINE, NOTR_DEADLINE, HOPE_WINDOW_CLOSING).
 *
 * PHI: patientName encrypted via PHIEncryptionService.
 * RLS: all DB writes run inside db.transaction() with applyRlsContext().
 * Cache: Valkey key `compliance:alerts:{locationId}` invalidated on every write.
 */

import { logAudit } from "@/contexts/identity/services/audit.service.js";
import { db } from "@/db/client.js";
import { complianceAlerts } from "@/db/schema/compliance-alerts.table.js";
import { PhiEncryptionService } from "@/shared-kernel/services/phi-encryption.service.js";
import {
  type AlertType,
  HARD_BLOCK_ALERT_TYPES,
  type UpsertAlertInput,
} from "@hospici/shared-types";
import type { Alert, AlertListResponse, AlertStatus } from "@hospici/shared-types";
import { and, eq, ne, sql } from "drizzle-orm";
import type Valkey from "iovalkey";

type UserCtx = {
  id: string;
  locationId: string;
  role: string;
};

// ── Custom errors ─────────────────────────────────────────────────────────────

export class AlertSnoozeError extends Error {
  constructor(type: AlertType) {
    super(`Alert type ${type} is a hard-block and cannot be snoozed`);
    this.name = "AlertSnoozeError";
  }
}

export class AlertNotFoundError extends Error {
  constructor(id: string) {
    super(`Alert ${id} not found`);
    this.name = "AlertNotFoundError";
  }
}

// ── RLS helper ────────────────────────────────────────────────────────────────

async function applyRlsContext(
  tx: { execute: (typeof db)["execute"] },
  user: UserCtx,
): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.current_user_id', ${user.id}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_location_id', ${user.locationId}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_role', ${user.role}, true)`);
}

// ── Valkey cache helpers ──────────────────────────────────────────────────────

const CACHE_TTL_SECONDS = 300; // 5 min

function cacheKey(locationId: string): string {
  return `compliance:alerts:${locationId}`;
}

async function invalidateCache(valkey: Valkey, locationId: string): Promise<void> {
  await valkey.del(cacheKey(locationId));
}

// ── Row → Alert mapper ────────────────────────────────────────────────────────

function rowToAlert(row: typeof complianceAlerts.$inferSelect): Alert {
  // patientName is already decrypted before this function is called
  return {
    id: row.id,
    type: row.type as AlertType,
    severity: row.severity as Alert["severity"],
    patientId: row.patientId,
    patientName: row.patientName,
    locationId: row.locationId,
    dueDate: row.dueDate ?? null,
    daysRemaining: row.daysRemaining,
    description: row.description,
    rootCause: row.rootCause,
    nextAction: row.nextAction,
    status: row.status as AlertStatus,
    assignedTo: row.assignedTo ?? null,
    snoozedUntil: row.snoozedUntil ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export class AlertService {
  constructor(private readonly valkey: Valkey) {}

  /**
   * List alerts for the calling user's location.
   * Returns from Valkey cache if available; otherwise queries DB and caches result.
   * PHI_ACCESS roles see real patientName; others see redacted name.
   */
  async listAlerts(
    user: UserCtx,
    filters: {
      status?: AlertStatus;
      type?: AlertType;
      assignedTo?: string;
      severity?: Alert["severity"];
    } = {},
  ): Promise<AlertListResponse> {
    const cached = await this.valkey.get(cacheKey(user.locationId));
    if (cached && Object.keys(filters).length === 0) {
      const parsed = JSON.parse(cached) as AlertListResponse;
      return this.applyPhiRedaction(parsed, user);
    }

    const rows = await db.transaction(async (tx) => {
      await applyRlsContext(tx, user);

      let query = tx.select().from(complianceAlerts).$dynamic();

      if (filters.status) {
        query = query.where(eq(complianceAlerts.status, filters.status)) as typeof query;
      } else {
        // Default: exclude resolved
        query = query.where(ne(complianceAlerts.status, "resolved")) as typeof query;
      }
      if (filters.type) {
        query = query.where(eq(complianceAlerts.type, filters.type)) as typeof query;
      }
      if (filters.assignedTo) {
        query = query.where(eq(complianceAlerts.assignedTo, filters.assignedTo)) as typeof query;
      }
      if (filters.severity) {
        query = query.where(eq(complianceAlerts.severity, filters.severity)) as typeof query;
      }

      return query;
    });

    const decrypted = await Promise.all(
      rows.map(async (row) => {
        const name = await PhiEncryptionService.decrypt(row.patientName).catch(() => "[encrypted]");
        return rowToAlert({ ...row, patientName: name });
      }),
    );

    const response: AlertListResponse = {
      data: decrypted,
      total: decrypted.length,
    };

    // Cache unfiltered results only
    if (Object.keys(filters).length === 0) {
      await this.valkey.set(
        cacheKey(user.locationId),
        JSON.stringify(response),
        "EX",
        CACHE_TTL_SECONDS,
      );
    }

    await logAudit("view", user.id, null, {
      userRole: user.role,
      locationId: user.locationId,
      resourceType: "compliance_alerts",
      details: { total: response.total },
    });

    return this.applyPhiRedaction(response, user);
  }

  /**
   * Upsert an alert — idempotent per (patient_id, type).
   * Called exclusively by BullMQ workers. Uses a system-level location context.
   *
   * If a matching active alert exists: updates daysRemaining, rootCause, nextAction.
   * If not: inserts a new alert with status = 'new'.
   */
  async upsertAlert(input: UpsertAlertInput): Promise<Alert> {
    const systemUser: UserCtx = {
      id: "00000000-0000-0000-0000-000000000000", // system actor
      locationId: input.locationId,
      role: "super_admin",
    };

    const encryptedName = await PhiEncryptionService.encrypt(input.patientName);

    const row = await db.transaction(async (tx) => {
      await applyRlsContext(tx, systemUser);

      // Try to find an existing active alert for this patient + type
      const [existing] = await tx
        .select({ id: complianceAlerts.id })
        .from(complianceAlerts)
        .where(
          and(
            eq(complianceAlerts.patientId, input.patientId),
            eq(complianceAlerts.type, input.type),
            ne(complianceAlerts.status, "resolved"),
          ),
        )
        .limit(1);

      if (existing) {
        const [updated] = await tx
          .update(complianceAlerts)
          .set({
            severity: input.severity,
            dueDate: input.dueDate ?? undefined,
            daysRemaining: input.daysRemaining,
            description: input.description,
            rootCause: input.rootCause,
            nextAction: input.nextAction,
            patientName: encryptedName,
            updatedAt: new Date(),
          })
          .where(eq(complianceAlerts.id, existing.id))
          .returning();
        return updated;
      }

      const [inserted] = await tx
        .insert(complianceAlerts)
        .values({
          locationId: input.locationId,
          patientId: input.patientId,
          type: input.type,
          severity: input.severity,
          patientName: encryptedName,
          dueDate: input.dueDate ?? undefined,
          daysRemaining: input.daysRemaining,
          description: input.description,
          rootCause: input.rootCause,
          nextAction: input.nextAction,
          status: "new",
        })
        .returning();
      return inserted;
    });

    if (!row) {
      throw new Error(`upsertAlert failed for patient ${input.patientId} type ${input.type}`);
    }

    await invalidateCache(this.valkey, input.locationId);

    const decryptedName = await PhiEncryptionService.decrypt(row.patientName).catch(
      () => input.patientName,
    );
    return rowToAlert({ ...row, patientName: decryptedName });
  }

  /**
   * Acknowledge an alert — moves status from 'new' → 'acknowledged'.
   */
  async acknowledgeAlert(id: string, user: UserCtx): Promise<Alert> {
    return this.updateStatus(id, "acknowledged", user, {});
  }

  /**
   * Assign an alert to a user — sets status = 'assigned', assignedTo = userId.
   */
  async assignAlert(id: string, assignedTo: string, user: UserCtx): Promise<Alert> {
    return this.updateStatus(id, "assigned", user, { assignedTo });
  }

  /**
   * Resolve an alert — sets status = 'resolved', records resolvedAt.
   */
  async resolveAlert(id: string, user: UserCtx): Promise<Alert> {
    return this.updateStatus(id, "resolved", user, { resolvedAt: new Date() });
  }

  /**
   * Snooze an alert until a future date.
   * Throws AlertSnoozeError for hard-block types.
   */
  async snoozeAlert(id: string, snoozedUntil: string, user: UserCtx): Promise<Alert> {
    // Fetch the type first to enforce hard-block guard
    const [existing] = await db
      .select({ type: complianceAlerts.type })
      .from(complianceAlerts)
      .where(eq(complianceAlerts.id, id))
      .limit(1);

    if (!existing) {
      throw new AlertNotFoundError(id);
    }

    if (HARD_BLOCK_ALERT_TYPES.has(existing.type as AlertType)) {
      throw new AlertSnoozeError(existing.type as AlertType);
    }

    return this.updateStatus(id, "acknowledged", user, { snoozedUntil });
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private async updateStatus(
    id: string,
    status: AlertStatus,
    user: UserCtx,
    extras: {
      assignedTo?: string;
      resolvedAt?: Date;
      snoozedUntil?: string;
    },
  ): Promise<Alert> {
    const row = await db.transaction(async (tx) => {
      await applyRlsContext(tx, user);

      const [updated] = await tx
        .update(complianceAlerts)
        .set({
          status,
          ...(extras.assignedTo !== undefined ? { assignedTo: extras.assignedTo } : {}),
          ...(extras.resolvedAt !== undefined ? { resolvedAt: extras.resolvedAt } : {}),
          ...(extras.snoozedUntil !== undefined ? { snoozedUntil: extras.snoozedUntil } : {}),
          updatedAt: new Date(),
        })
        .where(eq(complianceAlerts.id, id))
        .returning();

      return updated;
    });

    if (!row) {
      throw new AlertNotFoundError(id);
    }

    await invalidateCache(this.valkey, user.locationId);

    await logAudit("update", user.id, null, {
      userRole: user.role,
      locationId: user.locationId,
      resourceType: "compliance_alert",
      resourceId: id,
      details: { status },
    });

    const decryptedName = await PhiEncryptionService.decrypt(row.patientName).catch(
      () => "[encrypted]",
    );
    return rowToAlert({ ...row, patientName: decryptedName });
  }

  /**
   * Redact PHI for users without PHI_ACCESS role.
   */
  private applyPhiRedaction(response: AlertListResponse, user: UserCtx): AlertListResponse {
    const hasPhiAccess = ["clinician", "rn", "md", "super_admin", "admin"].includes(user.role);
    if (hasPhiAccess) return response;

    return {
      ...response,
      data: response.data.map((a: Alert) => ({ ...a, patientName: "[redacted]" })),
    };
  }
}
