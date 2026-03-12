/**
 * Hospice Cap Recalculation Worker
 *
 * Annual job — fires on November 2 (day after cap year starts Nov 1).
 * Recalculates Medicare reimbursement against the aggregate cap per location.
 * Alerts at 80% utilization threshold. 42 CFR §418.309.
 *
 * Cap year: November 1 (year N) – October 31 (year N+1).
 * Alert threshold: 80% (alertThreshold in CapCalculationSchema).
 *
 * Uses:
 *   - `getCapYear()` from business-days.ts to determine current cap year boundaries
 *   - `calculateCapLiability()` from hospiceCap.schema.ts for utilization math
 *
 * TODO (T3-3): Wire to hospice_cap_calculations table and billing data.
 * TODO (T1-8): Emit Socket.IO `cap:threshold:alert` when utilization ≥ 80%.
 */

import { env } from "@/config/env.js";
import { createLoggingConfig } from "@/config/logging.config.js";
import { calculateCapLiability } from "@/contexts/billing/schemas/hospiceCap.schema.js";
import { getCapYear } from "@/utils/business-days.js";
import type { Job } from "bullmq";
import { Worker } from "bullmq";
import pino from "pino";
import { createBullMQConnection, QUEUE_NAMES } from "../queue.js";

const log = pino(createLoggingConfig({ logLevel: env.logLevel, isDev: env.isDev }));

const CAP_ALERT_THRESHOLD = 0.8; // 80%

export type CapRecalculationJobResult = {
  recalculatedAt: string;
  capYear: string;
  locationsChecked: number;
  locationsAtThreshold: number;
  locationsOverCap: number;
};

/**
 * Pure handler — separated for testability.
 */
export async function capRecalculationHandler(_job: Job): Promise<CapRecalculationJobResult> {
  const today = new Date();
  const capYear = getCapYear(today);

  log.info(
    { capYear: capYear.label, start: capYear.start.toISOString(), end: capYear.end.toISOString() },
    "cap-recalculation: starting annual hospice cap calculation",
  );

  // TODO (T3-3): For each location, load billing data and calculate cap utilization:
  //
  // const locationsList = await db.select({ id: locations.id }).from(locations);
  // let atThreshold = 0;
  // let overCap = 0;
  //
  // for (const location of locationsList) {
  //   const { actualReimbursement, aggregateCapAmount } = await getCapBillingData(
  //     location.id,
  //     capYear,
  //   );
  //   const result = calculateCapLiability({
  //     actualReimbursement,
  //     aggregateCapAmount,
  //     alertThreshold: CAP_ALERT_THRESHOLD,
  //   });
  //
  //   if (result.status === "at_threshold") {
  //     atThreshold++;
  //     log.warn({ locationId: location.id, utilizationPercent: result.utilizationPercent },
  //       "HOSPICE CAP ALERT: ≥80% utilization — review billing");
  //     // TODO (T1-8): Emit Socket.IO `cap:threshold:alert`
  //   }
  //   if (result.status === "overage") {
  //     overCap++;
  //     log.error({ locationId: location.id, liability: result.liability },
  //       "HOSPICE CAP OVERAGE: repayment obligation to CMS");
  //   }
  //   await db.insert(capCalculations).values({ ... });
  // }

  // Stub: exercise calculateCapLiability so the import is active
  const stub = calculateCapLiability({
    actualReimbursement: 0,
    aggregateCapAmount: 100,
    alertThreshold: CAP_ALERT_THRESHOLD,
  });

  log.info(
    { capYear: capYear.label, stubStatus: stub.status },
    "cap-recalculation: completed (T3-3 pending)",
  );

  return {
    recalculatedAt: today.toISOString(),
    capYear: capYear.label,
    locationsChecked: 0,    // TODO (T3-3)
    locationsAtThreshold: 0, // TODO (T3-3)
    locationsOverCap: 0,     // TODO (T3-3)
  };
}

// ── Worker instance ───────────────────────────────────────────────────────────

export function createCapRecalculationWorker(): Worker<object, CapRecalculationJobResult> {
  const worker = new Worker(QUEUE_NAMES.CAP_RECALCULATION, capRecalculationHandler, {
    connection: createBullMQConnection(),
    concurrency: 1, // Cap calculations must not run in parallel
  });

  worker.on("completed", (job, result) => {
    log.info({ jobId: job.id, capYear: result.capYear }, "cap-recalculation completed");
  });

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "cap-recalculation failed");
  });

  return worker;
}
