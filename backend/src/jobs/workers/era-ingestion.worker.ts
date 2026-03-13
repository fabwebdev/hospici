/**
 * ERA Ingestion Worker — T3-7b
 *
 * Two queues:
 *  - era-ingestion          (event-driven, triggered by webhook or file drop endpoint)
 *  - era-reconciliation     (daily scan 0 7 * * * — flags stale unposted remittances)
 *
 * On ingestion success: delegates to ERA835Service.ingestERA().
 * On reconciliation: delegates to ERA835Service.reconciliationScan().
 */

import { env } from "@/config/env.js";
import { createLoggingConfig } from "@/config/logging.config.js";
import { ERA835Service } from "@/contexts/billing/services/era835.service.js";
import { Worker } from "bullmq";
import type { FastifyBaseLogger } from "fastify";
import pino from "pino";
import { createBullMQConnection, QUEUE_NAMES } from "../queue.js";

const log = pino(createLoggingConfig({ logLevel: env.logLevel, isDev: env.isDev }));

// ── Job data types ─────────────────────────────────────────────────────────────

export type ERAIngestionJobData = {
  raw835: string;        // base64-encoded
  payerName: string;
  locationId: string;
  userId: string;
};

export type ERAIngestionJobResult = {
  remittanceId: string;
  matched: number;
  unmatched: number;
};

export type ERAReconciliationJobData = Record<string, never>;

export type ERAReconciliationJobResult = {
  flagged: number;
};

// ── ERA ingestion worker ───────────────────────────────────────────────────────

export function createERAIngestionWorker(): Worker {
  return new Worker<ERAIngestionJobData, ERAIngestionJobResult>(
    QUEUE_NAMES.ERA_INGESTION,
    async (job) => {
      const svc = new ERA835Service(log as unknown as FastifyBaseLogger);
      log.info({ jobId: job.id, locationId: job.data.locationId }, "era-ingestion: processing");

      const result = await svc.ingestERA(
        { raw835: job.data.raw835, payerName: job.data.payerName, locationId: job.data.locationId },
        job.data.userId,
      );

      log.info(
        { jobId: job.id, remittanceId: result.remittanceId, matched: result.matched, unmatched: result.unmatched },
        "era-ingestion: complete",
      );

      return { ...result };
    },
    {
      connection: createBullMQConnection(),
      concurrency: 2,
    },
  );
}

// ── ERA reconciliation worker (daily cron) ────────────────────────────────────

export function createERAReconciliationWorker(): Worker {
  return new Worker<ERAReconciliationJobData, ERAReconciliationJobResult>(
    QUEUE_NAMES.ERA_RECONCILIATION,
    async (job) => {
      const svc = new ERA835Service(log as unknown as FastifyBaseLogger);
      log.info({ jobId: job.id }, "era-reconciliation: daily scan starting");

      const result = await svc.reconciliationScan();

      log.info({ jobId: job.id, flagged: result.flagged }, "era-reconciliation: complete");
      return result;
    },
    {
      connection: createBullMQConnection(),
      concurrency: 1,
    },
  );
}
