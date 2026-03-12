/**
 * BullMQ queue definitions and Valkey connection factory.
 *
 * All BullMQ connections require `maxRetriesPerRequest: null` — without it
 * BullMQ will throw on long-running blocking commands.
 *
 * Create a fresh connection per Queue/Worker (BullMQ recommendation: one
 * connection per instance to avoid command multiplexing issues).
 */

import { env } from "@/config/env.js";
import type { ConnectionOptions } from "bullmq";
import { Queue } from "bullmq";

// ── Queue name constants ──────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  NOE_DEADLINE_CHECK: "noe-deadline-check",
  AIDE_SUPERVISION_CHECK: "aide-supervision-check",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// ── Connection factory ────────────────────────────────────────────────────────

/**
 * Returns BullMQ-compatible connection options.
 * `maxRetriesPerRequest: null` is required — BullMQ uses blocking commands
 * that must not be retried automatically.
 * We pass raw options (not a Valkey instance) so BullMQ manages its own
 * internal connections with the correct settings.
 */
export function createBullMQConnection(): ConnectionOptions {
  return {
    host: env.valkeyHost,
    port: env.valkeyPort,
    ...(env.valkeyPassword ? { password: env.valkeyPassword } : {}),
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  };
}

// ── Queue instances ───────────────────────────────────────────────────────────

const defaultJobOptions = {
  removeOnComplete: { count: 50 },
  removeOnFail: { count: 100 },
  attempts: 3,
  backoff: { type: "exponential" as const, delay: 5000 },
};

export const noeDeadlineQueue = new Queue(QUEUE_NAMES.NOE_DEADLINE_CHECK, {
  connection: createBullMQConnection(),
  defaultJobOptions,
});

export const aideSupervisionQueue = new Queue(QUEUE_NAMES.AIDE_SUPERVISION_CHECK, {
  connection: createBullMQConnection(),
  defaultJobOptions,
});

// ── Daily schedule registration ───────────────────────────────────────────────

/**
 * Register repeatable daily jobs.
 * Safe to call on every startup — BullMQ deduplicates by repeat key.
 * Runs at 06:00 UTC daily.
 */
export async function scheduleDailyJobs(): Promise<void> {
  await noeDeadlineQueue.add(
    "daily-check",
    {},
    {
      repeat: { pattern: "0 6 * * *" },
      jobId: "noe-daily-check",
    },
  );

  await aideSupervisionQueue.add(
    "daily-check",
    {},
    {
      repeat: { pattern: "0 6 * * *" },
      jobId: "aide-daily-check",
    },
  );
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

export async function closeQueues(): Promise<void> {
  await noeDeadlineQueue.close();
  await aideSupervisionQueue.close();
}
