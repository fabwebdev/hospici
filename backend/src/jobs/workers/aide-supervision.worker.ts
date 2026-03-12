/**
 * Aide Supervision Check Worker
 *
 * CMS rule: Each hospice aide must be supervised in person or virtually
 * every 14 days. 42 CFR §418.76(h)(1)(i).
 *
 * This worker runs daily and:
 *  - Warns at day 12 (2 days before deadline)
 *  - Marks `isOverdue = true` once the 14-day window has passed
 *
 * Emits `aide:supervision:overdue` via Socket.IO for each overdue aide.
 */

import { env } from "@/config/env.js";
import { createLoggingConfig } from "@/config/logging.config.js";
import { AlertService } from "@/contexts/compliance/services/alert.service.js";
import { db } from "@/db/client.js";
import { aideSupervisions } from "@/db/schema/aide-supervisions.table.js";
import { users } from "@/db/schema/users.table.js";
import { complianceEvents } from "@/events/compliance-events.js";
import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { and, eq, lte, not } from "drizzle-orm";
import type Valkey from "iovalkey";
import pino from "pino";
import { QUEUE_NAMES, createBullMQConnection } from "../queue.js";

const log = pino(createLoggingConfig({ logLevel: env.logLevel, isDev: env.isDev }));

export type AideSupervisionJobResult = {
  checkedAt: string;
  approachingCount: number;
  overdueCount: number;
  markedOverdue: number;
};

let alertService: AlertService | null = null;

export function setAlertService(svc: AlertService): void {
  alertService = svc;
}

/**
 * Pure handler — separated for testability.
 */
export async function aideSupervisionHandler(_job: Job): Promise<AideSupervisionJobResult> {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0] as string;

  // Alert window: supervision due within 2 days (day 12 of 14-day cycle)
  const alertDate = new Date(today);
  alertDate.setDate(alertDate.getDate() + 2);
  const alertDateStr = alertDate.toISOString().split("T")[0] as string;

  const supervisionFields = {
    id: aideSupervisions.id,
    aideId: aideSupervisions.aideId,
    patientId: aideSupervisions.patientId,
    locationId: aideSupervisions.locationId,
    nextSupervisionDue: aideSupervisions.nextSupervisionDue,
    aideName: users.name, // Better Auth stores full name in `name` (not PHI-encrypted)
  };

  const [approaching, overdue] = await Promise.all([
    // Due within 2 days but not yet overdue
    db
      .select(supervisionFields)
      .from(aideSupervisions)
      .leftJoin(users, eq(users.id, aideSupervisions.aideId))
      .where(
        and(
          lte(aideSupervisions.nextSupervisionDue, alertDateStr),
          not(lte(aideSupervisions.nextSupervisionDue, todayStr)),
          eq(aideSupervisions.isOverdue, false),
        ),
      ),
    // Already past due — not yet marked
    db
      .select(supervisionFields)
      .from(aideSupervisions)
      .leftJoin(users, eq(users.id, aideSupervisions.aideId))
      .where(
        and(
          lte(aideSupervisions.nextSupervisionDue, todayStr),
          eq(aideSupervisions.isOverdue, false),
        ),
      ),
  ]);

  if (approaching.length > 0) {
    log.warn(
      { count: approaching.length, aideIds: approaching.map((r) => r.aideId) },
      "Aide supervision due within 2 days — 42 CFR §418.76",
    );
    for (const supervision of approaching) {
      const dueDate = supervision.nextSupervisionDue ?? todayStr;
      const daysRemaining = Math.ceil(
        (new Date(dueDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );
      const aideName = supervision.aideName ?? "Unknown Aide";

      if (alertService && supervision.locationId && supervision.patientId) {
        await alertService.upsertAlert({
          type: "AIDE_SUPERVISION_UPCOMING",
          severity: "warning",
          patientId: supervision.patientId,
          patientName: aideName,
          locationId: supervision.locationId,
          dueDate,
          daysRemaining: Math.max(0, daysRemaining),
          description: `Aide supervision due in ${Math.max(0, daysRemaining)} day(s). 42 CFR §418.76`,
          rootCause: "Aide supervision approaching 14-day deadline",
          nextAction: `Schedule in-person or virtual supervision before ${dueDate}`,
        }).catch((err) => log.error({ err, aideId: supervision.aideId }, "alertService.upsertAlert failed"));

        complianceEvents.emit("compliance:alert", {
          alertId: supervision.id,
          type: "AIDE_SUPERVISION_UPCOMING",
          severity: "warning",
          patientId: supervision.patientId,
          locationId: supervision.locationId,
          daysRemaining: Math.max(0, daysRemaining),
        });
      }
    }
  }

  // Mark overdue records
  let markedOverdue = 0;
  if (overdue.length > 0) {
    const overdueIds = overdue.map((r) => r.id);

    // Update each overdue record — db.transaction not needed (single table write)
    for (const id of overdueIds) {
      await db
        .update(aideSupervisions)
        .set({ isOverdue: true, updatedAt: new Date() })
        .where(eq(aideSupervisions.id, id));
    }
    markedOverdue = overdue.length;

    log.error(
      { count: overdue.length, aideIds: overdue.map((r) => r.aideId) },
      "Aide supervision OVERDUE — 42 CFR §418.76 violation",
    );

    for (const supervision of overdue) {
      const dueDate = supervision.nextSupervisionDue ?? todayStr;
      const daysOverdue = Math.floor(
        (today.getTime() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24),
      );
      const aideName = supervision.aideName ?? "Unknown Aide";

      complianceEvents.emit("aide:supervision:overdue", {
        aideId: supervision.aideId,
        aideName,
        patientId: supervision.patientId,
        daysOverdue: Math.max(0, daysOverdue),
      });

      if (alertService && supervision.locationId && supervision.patientId) {
        await alertService.upsertAlert({
          type: "AIDE_SUPERVISION_OVERDUE",
          severity: "critical",
          patientId: supervision.patientId,
          patientName: aideName,
          locationId: supervision.locationId,
          dueDate,
          daysRemaining: -daysOverdue,
          description: `Aide supervision OVERDUE by ${Math.max(0, daysOverdue)} day(s). 42 CFR §418.76`,
          rootCause: "14-day supervision window elapsed without documented supervision",
          nextAction: "Document supervision immediately or suspend aide visit documentation",
        }).catch((err) => log.error({ err, aideId: supervision.aideId }, "alertService.upsertAlert failed"));

        complianceEvents.emit("compliance:alert", {
          alertId: supervision.id,
          type: "AIDE_SUPERVISION_OVERDUE",
          severity: "critical",
          patientId: supervision.patientId,
          locationId: supervision.locationId,
          daysRemaining: -daysOverdue,
        });
      }
    }
  }

  return {
    checkedAt: today.toISOString(),
    approachingCount: approaching.length,
    overdueCount: overdue.length,
    markedOverdue,
  };
}

// ── Worker instance ───────────────────────────────────────────────────────────

export function createAideSupervisionWorker(valkey?: Valkey): Worker<object, AideSupervisionJobResult> {
  if (valkey && !alertService) {
    alertService = new AlertService(valkey);
  }
  const worker = new Worker(QUEUE_NAMES.AIDE_SUPERVISION_CHECK, aideSupervisionHandler, {
    connection: createBullMQConnection(),
    concurrency: 1,
  });

  worker.on("completed", (job, result) => {
    log.info({ jobId: job.id, result }, "aide-supervision-check completed");
  });

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "aide-supervision-check failed");
  });

  return worker;
}
