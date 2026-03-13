/**
 * Hospice Cap Recalculation Worker — T3-3
 *
 * Scheduled: Nov 2 annually (day after cap year starts Nov 1). 42 CFR §418.309.
 * Manual trigger: POST /api/v1/cap/recalculate
 *
 * For each location, calls CapCalculationService.calculate() then emits
 * cap:calculation:complete to the location Socket.IO room.
 */

import { env } from "@/config/env.js";
import { createLoggingConfig } from "@/config/logging.config.js";
import { CapCalculationService } from "@/contexts/billing/services/capCalculation.service.js";
import { complianceEvents } from "@/events/compliance-events.js";
import { getCapYear } from "@/utils/business-days.js";
import type { Job } from "bullmq";
import { Worker } from "bullmq";
import type Valkey from "iovalkey";
import pino from "pino";
import { QUEUE_NAMES, createBullMQConnection } from "../queue.js";

const log = pino(createLoggingConfig({ logLevel: env.logLevel, isDev: env.isDev }));

export type CapRecalculationJobData = {
  locationId?: string;
  capYear?: number;
  triggeredBy?: "scheduled" | "manual" | "data_correction";
  triggeredByUserId?: string | null;
};

export type CapRecalculationJobResult = {
  recalculatedAt: string;
  capYear: number;
  locationsChecked: number;
  locationsAtThreshold: number;
  locationsOverCap: number;
};

let _valkey: Valkey | null = null;

export function setValkeyInstance(v: Valkey): void {
  _valkey = v;
}

export async function capRecalculationHandler(
  job: Job<CapRecalculationJobData>,
): Promise<CapRecalculationJobResult> {
  const today = new Date();
  const capYear = job.data.capYear ?? getCapYear(today).year;

  log.info({ capYear, jobId: job.id }, "cap-recalculation: starting");

  if (!_valkey) {
    log.warn({ jobId: job.id }, "cap-recalculation: valkey not available, skipping");
    return {
      recalculatedAt: today.toISOString(),
      capYear,
      locationsChecked: 0,
      locationsAtThreshold: 0,
      locationsOverCap: 0,
    };
  }

  const svc = new CapCalculationService(_valkey);
  const triggeredBy = job.data.triggeredBy ?? "scheduled";
  const triggeredByUserId = job.data.triggeredByUserId ?? null;

  const targetLocations = job.data.locationId
    ? [{ id: job.data.locationId }]
    : await svc.getAllLocations();

  let locationsAtThreshold = 0;
  let locationsOverCap = 0;

  for (const loc of targetLocations) {
    try {
      const { snapshotId, utilizationPercent, projectedYearEndPercent } = await svc.calculate(
        loc.id,
        capYear,
        triggeredBy,
        triggeredByUserId,
      );

      if (utilizationPercent >= 90 || projectedYearEndPercent >= 100) locationsOverCap++;
      else if (utilizationPercent >= 70) locationsAtThreshold++;

      complianceEvents.emit("cap:calculation:complete", {
        locationId: loc.id,
        capYear,
        snapshotId,
        utilizationPercent,
        projectedYearEndPercent,
        calculatedAt: new Date().toISOString(),
      });

      log.info(
        { locationId: loc.id, capYear, utilizationPercent, snapshotId },
        "cap-recalculation: location complete",
      );
    } catch (err) {
      log.error({ err, locationId: loc.id, capYear }, "cap-recalculation: location failed");
    }
  }

  return {
    recalculatedAt: today.toISOString(),
    capYear,
    locationsChecked: targetLocations.length,
    locationsAtThreshold,
    locationsOverCap,
  };
}

export function createCapRecalculationWorker(
  valkey?: Valkey,
): Worker<CapRecalculationJobData, CapRecalculationJobResult> {
  if (valkey) _valkey = valkey;

  const worker = new Worker(QUEUE_NAMES.CAP_RECALCULATION, capRecalculationHandler, {
    connection: createBullMQConnection(),
    concurrency: 1,
  });

  worker.on("completed", (job, result) => {
    log.info(
      { jobId: job.id, capYear: result.capYear, locationsChecked: result.locationsChecked },
      "cap-recalculation completed",
    );
  });

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "cap-recalculation failed");
  });

  return worker;
}
