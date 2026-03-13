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
 * The penalty fiscal year is the federal fiscal year FOLLOWING the missed quarter:
 *   FY runs Oct 1 – Sep 30. A missed Q1 (Jan–Mar year N) deadline (Aug 15 year N)
 *   triggers a penalty for FY that starts Oct 1 year N.
 */

import { env } from "@/config/env.js";
import { createLoggingConfig } from "@/config/logging.config.js";
import { db } from "@/db/client.js";
import { hopeReportingPeriods } from "@/db/schema/hope-reporting-periods.table.js";
import { complianceEvents } from "@/events/compliance-events.js";
import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { and, eq, lte, not } from "drizzle-orm";
import pino from "pino";
import { QUEUE_NAMES, createBullMQConnection } from "../queue.js";

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

  if (month === 8) return { year, quarter: 1 }; // Aug 15 → Q1 of same year
  if (month === 11) return { year, quarter: 2 }; // Nov 15 → Q2 of same year
  if (month === 2) return { year: year - 1, quarter: 3 }; // Feb 15 → Q3 of prior year
  if (month === 5) return { year: year - 1, quarter: 4 }; // May 15 → Q4 of prior year

  return { year, quarter: 0 }; // Should not occur on the cron schedule
}

/**
 * Returns the federal fiscal year in which the 2% payment reduction applies.
 * Federal FY: Oct 1 – Sep 30.
 *
 * The penalty announcement date (submission deadline) falls in the FY that
 * begins the following October 1.
 *   Aug 15, year N  → penalty FY starts Oct 1, year N   → penaltyFiscalYear = year N + 1
 *   Nov 15, year N  → penalty FY starts Oct 1, year N+1 → penaltyFiscalYear = year N + 2
 *   Feb 15, year N  → penalty FY starts Oct 1, year N   → penaltyFiscalYear = year N + 1
 *   May 15, year N  → penalty FY starts Oct 1, year N   → penaltyFiscalYear = year N + 1
 */
export function getPenaltyFiscalYear(deadlineDate: Date): number {
  const month = deadlineDate.getUTCMonth() + 1;
  const year = deadlineDate.getUTCFullYear();
  // Nov deadline: already past the Oct 1 boundary → penalty in year+2
  if (month === 11) return year + 2;
  return year + 1;
}

/**
 * Pure handler — separated for testability.
 */
export async function hqrpPeriodCloseHandler(_job: Job): Promise<HqrpPeriodCloseJobResult> {
  const today = new Date();
  const closingQuarter = getClosingQuarter(today);
  const todayStr = today.toISOString().split("T")[0] as string;
  const penaltyFiscalYear = getPenaltyFiscalYear(today);

  log.info({ closingQuarter, today: todayStr }, "hqrp-period-close: processing");

  if (closingQuarter.quarter === 0) {
    log.warn({ today: todayStr }, "hqrp-period-close: invoked on unexpected date — skipping");
    return {
      closedAt: today.toISOString(),
      closingQuarter,
      penaltyApplied: false,
      locationsAffected: 0,
    };
  }

  // Find all open periods for this quarter whose submission deadline has passed.
  const openPeriods = await db
    .select({
      id: hopeReportingPeriods.id,
      locationId: hopeReportingPeriods.locationId,
      calendarYear: hopeReportingPeriods.calendarYear,
      quarter: hopeReportingPeriods.quarter,
      status: hopeReportingPeriods.status,
    })
    .from(hopeReportingPeriods)
    .where(
      and(
        eq(hopeReportingPeriods.calendarYear, closingQuarter.year),
        eq(hopeReportingPeriods.quarter, closingQuarter.quarter),
        not(eq(hopeReportingPeriods.status, "closed")),
        lte(hopeReportingPeriods.submissionDeadline, todayStr),
      ),
    );

  let penaltyCount = 0;

  for (const period of openPeriods) {
    // A period that never reached "submitted" status by deadline → penalty applies.
    const penaltyApplied = period.status !== "submitted";

    await db
      .update(hopeReportingPeriods)
      .set({
        status: "closed",
        penaltyApplied,
        updatedAt: new Date(),
      })
      .where(eq(hopeReportingPeriods.id, period.id));

    if (penaltyApplied) {
      penaltyCount++;
      log.error(
        {
          locationId: period.locationId,
          calendarYear: period.calendarYear,
          quarter: period.quarter,
          penaltyFiscalYear,
        },
        "HQRP PENALTY: 2% Medicare reduction will apply — iQIES submission deadline missed",
      );

      complianceEvents.emit("hqrp:penalty:alert", {
        locationId: period.locationId,
        calendarYear: period.calendarYear,
        quarter: period.quarter,
        periodId: period.id,
        penaltyFiscalYear,
      });
    } else {
      log.info(
        { locationId: period.locationId, calendarYear: period.calendarYear, quarter: period.quarter },
        "hqrp-period-close: period closed, no penalty — submission was on time",
      );
    }
  }

  const result: HqrpPeriodCloseJobResult = {
    closedAt: today.toISOString(),
    closingQuarter,
    penaltyApplied: penaltyCount > 0,
    locationsAffected: openPeriods.length,
  };

  log.info(result, "hqrp-period-close: completed");

  return result;
}

// ── Worker instance ───────────────────────────────────────────────────────────

export function createHqrpPeriodCloseWorker(): Worker<object, HqrpPeriodCloseJobResult> {
  const worker = new Worker(QUEUE_NAMES.HQRP_PERIOD_CLOSE, hqrpPeriodCloseHandler, {
    connection: createBullMQConnection(),
    concurrency: 1,
  });

  worker.on("completed", (job, result) => {
    log.info(
      {
        jobId: job.id,
        closingQuarter: result.closingQuarter,
        locationsAffected: result.locationsAffected,
        penaltyApplied: result.penaltyApplied,
      },
      "hqrp-period-close completed",
    );
  });

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "hqrp-period-close failed");
  });

  return worker;
}
