/**
 * F2F Deadline Check Worker — T3-2b
 *
 * CMS rules:
 *   - Period 3+: F2F required within 30 days prior to recert date (42 CFR §418.22)
 *
 * Runs daily at 07:30 UTC and checks patients in period >= 3:
 *   Day 10: create physician task (F2F_DOCUMENTATION order)
 *   Day 5:  upsert F2F_MISSING compliance alert (severity: warning)
 *   Day 0:  upsert F2F_MISSING alert (severity: critical); emit f2f:overdue Socket.IO
 */

import { env } from "@/config/env.js";
import { createLoggingConfig } from "@/config/logging.config.js";
import { AlertService } from "@/contexts/compliance/services/alert.service.js";
import { F2FTaskService } from "@/contexts/f2f/services/f2fTask.service.js";
import { db } from "@/db/client.js";
import { benefitPeriods } from "@/db/schema/benefit-periods.table.js";
import { faceToFaceEncounters } from "@/db/schema/face-to-face-encounters.table.js";
import { complianceEvents } from "@/events/compliance-events.js";
import { Worker } from "bullmq";
import { and, eq, notInArray, sql } from "drizzle-orm";
import type Valkey from "iovalkey";
import pino from "pino";
import { QUEUE_NAMES, createBullMQConnection } from "../queue.js";

const log = pino(createLoggingConfig({ logLevel: env.logLevel, isDev: env.isDev }));

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

export type F2FDeadlineJobResult = {
  checkedAt: string;
  taskCreatedCount: number;
  warningAlertCount: number;
  criticalAlertCount: number;
};

export async function runF2FDeadlineCheck(valkey: Valkey): Promise<F2FDeadlineJobResult> {
  const alertService = new AlertService(valkey);
  const taskService = new F2FTaskService(
    log as unknown as import("fastify").FastifyBaseLogger,
    valkey,
  );

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0] as string;

  let taskCreatedCount = 0;
  let warningAlertCount = 0;
  let criticalAlertCount = 0;

  // Find all active periods with period_number >= 3
  const activePeriods = await db
    .select()
    .from(benefitPeriods)
    .where(
      and(
        notInArray(benefitPeriods.status, ["closed", "revoked", "discharged", "transferred_out"]),
        sql`${benefitPeriods.periodNumber} >= 3`,
      ),
    );

  for (const period of activePeriods) {
    const recertDate = new Date(period.endDate);
    const daysUntilRecert = Math.ceil(
      (recertDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Only act if recert is within 10 days or already past
    if (daysUntilRecert > 10) continue;

    // Check if a valid F2F already exists for this period
    const [validF2F] = await db
      .select({ id: faceToFaceEncounters.id })
      .from(faceToFaceEncounters)
      .where(
        and(
          eq(faceToFaceEncounters.benefitPeriodId, period.id),
          eq(faceToFaceEncounters.isValidForRecert, true),
        ),
      )
      .limit(1);

    if (validF2F) continue; // F2F documented and valid — no action needed

    // Check if physician task already exists
    const [existingTaskStub] = await db
      .select({ physicianTaskId: faceToFaceEncounters.physicianTaskId })
      .from(faceToFaceEncounters)
      .where(eq(faceToFaceEncounters.benefitPeriodId, period.id))
      .limit(1);

    const patientName = `Patient:${period.patientId}`;

    // Day 10: create physician task (if not already created)
    if (daysUntilRecert <= 10 && daysUntilRecert > 5 && !existingTaskStub?.physicianTaskId) {
      try {
        await taskService.createPhysicianTask(
          period.patientId,
          period.id,
          SYSTEM_USER_ID,
          period.locationId,
          SYSTEM_USER_ID,
        );
        taskCreatedCount++;
        log.info(
          { patientId: period.patientId, periodId: period.id, daysUntilRecert },
          "F2F physician task created by deadline worker",
        );
      } catch (err) {
        log.error({ err, patientId: period.patientId }, "Failed to create F2F physician task");
      }
    }

    // Day 5: upsert WARNING alert
    if (daysUntilRecert <= 5 && daysUntilRecert > 0) {
      await alertService
        .upsertAlert({
          locationId: period.locationId,
          patientId: period.patientId,
          type: "F2F_MISSING",
          severity: "warning",
          patientName,
          dueDate: period.endDate,
          daysRemaining: daysUntilRecert,
          description: `F2F encounter not yet documented for period ${period.periodNumber} recertification`,
          rootCause: `No valid face-to-face encounter on record within 30 days prior to recert date ${period.endDate}`,
          nextAction: "Document face-to-face encounter before recertification date",
        })
        .catch((err: unknown) =>
          log.error(
            { err, patientId: period.patientId },
            "alertService.upsertAlert failed (F2F_MISSING warning)",
          ),
        );
      warningAlertCount++;
    }

    // Day 0 (overdue): upsert CRITICAL alert + emit Socket.IO
    if (daysUntilRecert <= 0) {
      await alertService
        .upsertAlert({
          locationId: period.locationId,
          patientId: period.patientId,
          type: "F2F_MISSING",
          severity: "critical",
          patientName,
          dueDate: period.endDate,
          daysRemaining: daysUntilRecert,
          description: `OVERDUE: F2F encounter required for period ${period.periodNumber} — recertification is BLOCKED`,
          rootCause: `Recertification date ${period.endDate} passed without a valid face-to-face encounter`,
          nextAction: "Immediate: document F2F encounter to unblock recertification",
        })
        .catch((err: unknown) =>
          log.error(
            { err, patientId: period.patientId },
            "alertService.upsertAlert failed (F2F_MISSING critical)",
          ),
        );

      // Emit f2f:overdue Socket.IO event
      complianceEvents.emit("f2f:overdue", {
        patientId: period.patientId,
        benefitPeriodId: period.id,
        periodNumber: period.periodNumber,
        recertDate: period.endDate,
        daysOverdue: Math.abs(daysUntilRecert),
      });

      criticalAlertCount++;
    }
  }

  return {
    checkedAt: todayStr,
    taskCreatedCount,
    warningAlertCount,
    criticalAlertCount,
  };
}

export function createF2FDeadlineWorker(valkey: Valkey) {
  return new Worker(
    QUEUE_NAMES.F2F_DEADLINE_CHECK,
    async (job) => {
      log.info({ jobId: job.id }, "F2F deadline check started");
      const result = await runF2FDeadlineCheck(valkey);
      log.info(result, "F2F deadline check complete");
      return result;
    },
    {
      connection: createBullMQConnection(),
      concurrency: 1,
    },
  );
}
