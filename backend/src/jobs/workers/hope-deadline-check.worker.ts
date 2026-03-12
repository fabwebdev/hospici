/**
 * HOPE Deadline Check Worker
 *
 * Daily job that flags HOPE assessments approaching or past their 7-day window.
 * CMS rule: HOPE-A must be completed within 7 days of election; HOPE-D within
 * 7 days of discharge/death. 42 CFR §418.312.
 *
 * Alerts:
 *   - ≤3 days remaining in window → yellow warning
 *   - Past window deadline, not yet submitted → overdue flag
 *
 * TODO (T3-1): Wire to hope_assessments table once migrated.
 * TODO (T1-8): Emit Socket.IO events per patient for UI banners.
 */

import { env } from "@/config/env.js";
import { createLoggingConfig } from "@/config/logging.config.js";
import type { Job } from "bullmq";
import { Worker } from "bullmq";
import pino from "pino";
import { QUEUE_NAMES, createBullMQConnection } from "../queue.js";

const log = pino(createLoggingConfig({ logLevel: env.logLevel, isDev: env.isDev }));

export type HopeDeadlineJobResult = {
  checkedAt: string;
  upcomingCount: number;
  overdueCount: number;
};

/**
 * Pure handler — separated for testability.
 */
export async function hopeDeadlineHandler(_job: Job): Promise<HopeDeadlineJobResult> {
  const today = new Date();

  // TODO (T3-1): Query hope_assessments for assessments approaching or past 7-day window:
  //
  // const todayStr = today.toISOString().split("T")[0];
  // const lookaheadStr = new Date(today.getTime() + 3 * 86400000).toISOString().split("T")[0];
  //
  // const [upcoming, overdue] = await Promise.all([
  //   db.select({ id: hopeAssessments.id, patientId: hopeAssessments.patientId })
  //     .from(hopeAssessments)
  //     .where(and(
  //       inArray(hopeAssessments.assessmentType, ["01", "03"]),
  //       inArray(hopeAssessments.status, ["draft", "in_progress"]),
  //       lte(hopeAssessments.windowDeadline, lookaheadStr),
  //       gte(hopeAssessments.windowDeadline, todayStr),
  //     )),
  //   db.select({ id: hopeAssessments.id, patientId: hopeAssessments.patientId })
  //     .from(hopeAssessments)
  //     .where(and(
  //       inArray(hopeAssessments.assessmentType, ["01", "03"]),
  //       inArray(hopeAssessments.status, ["draft", "in_progress"]),
  //       lt(hopeAssessments.windowDeadline, todayStr),
  //     )),
  // ]);
  //
  // if (upcoming.length > 0) {
  //   log.warn({ count: upcoming.length }, "HOPE assessment window closing within 3 days");
  // }
  // if (overdue.length > 0) {
  //   log.error({ count: overdue.length }, "HOPE assessment OVERDUE — 42 CFR §418.312 violation");
  // }
  // TODO (T1-8): emit Socket.IO event per patient

  log.info({ checkedAt: today.toISOString() }, "hope-deadline-check: completed (T3-1 pending)");

  return {
    checkedAt: today.toISOString(),
    upcomingCount: 0, // TODO (T3-1)
    overdueCount: 0, // TODO (T3-1)
  };
}

// ── Worker instance ───────────────────────────────────────────────────────────

export function createHopeDeadlineCheckWorker(): Worker<object, HopeDeadlineJobResult> {
  const worker = new Worker(QUEUE_NAMES.HOPE_DEADLINE_CHECK, hopeDeadlineHandler, {
    connection: createBullMQConnection(),
    concurrency: 1,
  });

  worker.on("completed", (job, result) => {
    log.info({ jobId: job.id, result }, "hope-deadline-check completed");
  });

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "hope-deadline-check failed");
  });

  return worker;
}
