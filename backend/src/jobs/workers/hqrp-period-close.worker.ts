/**
 * HQRP Period Close Worker
 *
 * Quarterly job that closes HQRP reporting periods and flags missed submissions.
 * CMS rule: Missing an iQIES submission deadline = 2% Medicare payment reduction
 * for the entire following fiscal year. 42 CFR §418.312.
 *
 * HQRP submission deadlines (cron: 0 6 15 2,5,8,11 *):
 *   Q1 (Jan–Mar)  → August 15
 *   Q2 (Apr–Jun)  → November 15
 *   Q3 (Jul–Sep)  → February 15
 *   Q4 (Oct–Dec)  → May 15
 *
 * TODO (T3-1): Wire to hope_reporting_periods table once migrated.
 * TODO (T1-8): Emit Socket.IO penalty risk alert.
 */

import { env } from "@/config/env.js";
import { createLoggingConfig } from "@/config/logging.config.js";
import type { Job } from "bullmq";
import { Worker } from "bullmq";
import pino from "pino";
import { createBullMQConnection, QUEUE_NAMES } from "../queue.js";

const log = pino(createLoggingConfig({ logLevel: env.logLevel, isDev: env.isDev }));

export type HqrpPeriodCloseJobResult = {
  closedAt: string;
  closingQuarter: { year: number; quarter: number };
  penaltyApplied: boolean;
  locationsAffected: number;
};

/**
 * Returns the HQRP reporting quarter that closes on a given deadline date.
 * Extracted for testability.
 */
export function getClosingQuarter(date: Date): { year: number; quarter: number } {
  const month = date.getUTCMonth() + 1; // 1-indexed
  const year = date.getUTCFullYear();

  if (month === 8) return { year, quarter: 1 };  // Aug 15 → Q1 of same year
  if (month === 11) return { year, quarter: 2 }; // Nov 15 → Q2 of same year
  if (month === 2) return { year: year - 1, quarter: 3 }; // Feb 15 → Q3 of prior year
  if (month === 5) return { year: year - 1, quarter: 4 }; // May 15 → Q4 of prior year

  return { year, quarter: 0 }; // Should not occur on the cron schedule
}

/**
 * Pure handler — separated for testability.
 */
export async function hqrpPeriodCloseHandler(_job: Job): Promise<HqrpPeriodCloseJobResult> {
  const today = new Date();
  const closingQuarter = getClosingQuarter(today);

  log.info({ closingQuarter, today: today.toISOString() }, "hqrp-period-close: processing");

  // TODO (T3-1): Query hope_reporting_periods for open periods past their submission deadline:
  //
  // const openPeriods = await db.select({ ... })
  //   .from(hopeReportingPeriods)
  //   .where(and(
  //     eq(hopeReportingPeriods.calendarYear, closingQuarter.year),
  //     eq(hopeReportingPeriods.quarter, closingQuarter.quarter),
  //     eq(hopeReportingPeriods.status, "open"),
  //     lte(hopeReportingPeriods.submissionDeadline, today.toISOString().split("T")[0]),
  //   ));
  //
  // for (const period of openPeriods) {
  //   const penaltyApplied = period.status !== "submitted";
  //   await db.update(hopeReportingPeriods)
  //     .set({ status: "closed", penaltyApplied, updatedAt: new Date() })
  //     .where(eq(hopeReportingPeriods.id, period.id));
  //
  //   if (penaltyApplied) {
  //     log.error({ locationId: period.locationId, closingQuarter },
  //       "HQRP PENALTY: 2% Medicare reduction will apply — submission deadline missed");
  //     // TODO (T1-8): Emit Socket.IO penalty alert to location admins
  //   }
  // }

  log.info({ closingQuarter }, "hqrp-period-close: completed (T3-1 pending)");

  return {
    closedAt: today.toISOString(),
    closingQuarter,
    penaltyApplied: false, // TODO (T3-1)
    locationsAffected: 0,  // TODO (T3-1)
  };
}

// ── Worker instance ───────────────────────────────────────────────────────────

export function createHqrpPeriodCloseWorker(): Worker<object, HqrpPeriodCloseJobResult> {
  const worker = new Worker(QUEUE_NAMES.HQRP_PERIOD_CLOSE, hqrpPeriodCloseHandler, {
    connection: createBullMQConnection(),
    concurrency: 1,
  });

  worker.on("completed", (job, result) => {
    log.info({ jobId: job.id, closingQuarter: result.closingQuarter }, "hqrp-period-close completed");
  });

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "hqrp-period-close failed");
  });

  return worker;
}
