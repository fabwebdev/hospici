/**
 * Missed Visit Check Worker
 *
 * Runs daily at 07:00 UTC. Calls VisitScheduleService.checkMissedVisits() which:
 *   1. Marks stale 'scheduled' visits (scheduledDate < today) as 'missed'.
 *   2. Upserts a MISSED_VISIT compliance alert per affected patient.
 *   3. Checks rolling 7-day frequency variance and upserts
 *      VISIT_FREQUENCY_VARIANCE alerts where actual < planned.
 *
 * Emits `visit:missed` to the compliance event bus so Socket.IO can
 * fan out to the relevant location room.
 */

import { env } from "@/config/env.js";
import { createLoggingConfig } from "@/config/logging.config.js";
import { AlertService } from "@/contexts/compliance/services/alert.service.js";
import { VisitScheduleService } from "@/contexts/scheduling/services/visitSchedule.service.js";
import { complianceEvents } from "@/events/compliance-events.js";
import type { Job } from "bullmq";
import { Worker } from "bullmq";
import type Valkey from "iovalkey";
import pino from "pino";
import { QUEUE_NAMES, createBullMQConnection } from "../queue.js";

const log = pino(createLoggingConfig({ logLevel: env.logLevel, isDev: env.isDev }));

export type MissedVisitCheckJobResult = {
  checkedAt: string;
  missedCount: number;
  varianceCount: number;
};

let visitScheduleService: VisitScheduleService | null = null;

export function setVisitScheduleService(svc: VisitScheduleService): void {
  visitScheduleService = svc;
}

/**
 * Pure handler — separated for testability.
 */
export async function missedVisitCheckHandler(_job: Job): Promise<MissedVisitCheckJobResult> {
  if (!visitScheduleService) {
    log.warn("VisitScheduleService not set — skipping missed-visit check");
    return { checkedAt: new Date().toISOString(), missedCount: 0, varianceCount: 0 };
  }

  const result = await visitScheduleService.checkMissedVisits();

  if (result.missedCount > 0 || result.varianceCount > 0) {
    log.info(
      { missedCount: result.missedCount, varianceCount: result.varianceCount },
      "missed-visit-check: alerts upserted",
    );

    complianceEvents.emit("visit:missed", {
      missedCount: result.missedCount,
      varianceCount: result.varianceCount,
      checkedAt: new Date().toISOString(),
    });
  }

  return {
    checkedAt: new Date().toISOString(),
    missedCount: result.missedCount,
    varianceCount: result.varianceCount,
  };
}

export function createMissedVisitCheckWorker(valkey: Valkey): Worker {
  const alertService = new AlertService(valkey);
  const svc = new VisitScheduleService(valkey, alertService);
  setVisitScheduleService(svc);

  const worker = new Worker(QUEUE_NAMES.MISSED_VISIT_CHECK, missedVisitCheckHandler, {
    connection: createBullMQConnection(),
    concurrency: 1,
  });

  worker.on("completed", (job, result: MissedVisitCheckJobResult) => {
    log.info(
      {
        jobId: job.id,
        missedCount: result.missedCount,
        varianceCount: result.varianceCount,
      },
      "missed-visit-check completed",
    );
  });

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "missed-visit-check failed");
  });

  return worker;
}
