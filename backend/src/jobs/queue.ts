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
  HOPE_SUBMISSION: "hope-submission",
  HOPE_SUBMISSION_DLQ: "hope-submission-dlq",
  HOPE_DEADLINE_CHECK: "hope-deadline-check",
  HQRP_PERIOD_CLOSE: "hqrp-period-close",
  CAP_RECALCULATION: "cap-recalculation",
  NOTE_REVIEW_DEADLINE_CHECK: "note-review-deadline-check",
  MISSED_VISIT_CHECK: "missed-visit-check",
  F2F_DEADLINE_CHECK: "f2f-deadline-check",
  BENEFIT_PERIOD_CHECK: "benefit-period-check",
  CLAIM_SUBMISSION: "claim-submission",
  CLAIM_SUBMISSION_DLQ: "claim-submission-dlq",
  ERA_INGESTION: "era-ingestion",
  ERA_RECONCILIATION: "era-reconciliation",
  VENDOR_COMPLIANCE_CHECK: "vendor-compliance-check",
  ORDER_EXPIRY_CHECK: "order-expiry-check",
  ORDER_REMINDER: "order-reminder",
  AUDIT_EXPORT: "audit-export",
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

// ── HOPE submission queue (event-driven, not scheduled) ───────────────────────

/**
 * Per HOPE-DOC: 3 retries with exponential backoff, removeOnFail: false for DLQ review.
 * DLQ: hope-submission-dlq — triggered when all 3 attempts are exhausted.
 */
export const hopeSubmissionQueue = new Queue(QUEUE_NAMES.HOPE_SUBMISSION, {
  connection: createBullMQConnection(),
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: false, // Keep failed jobs for DLQ review
    attempts: 3,
    backoff: { type: "exponential" as const, delay: 2000 },
  },
});

export const hopeSubmissionDlq = new Queue(QUEUE_NAMES.HOPE_SUBMISSION_DLQ, {
  connection: createBullMQConnection(),
  defaultJobOptions: {
    removeOnComplete: { count: 50 },
    removeOnFail: { count: 500 },
  },
});

export const hopeDeadlineCheckQueue = new Queue(QUEUE_NAMES.HOPE_DEADLINE_CHECK, {
  connection: createBullMQConnection(),
  defaultJobOptions,
});

export const hqrpPeriodCloseQueue = new Queue(QUEUE_NAMES.HQRP_PERIOD_CLOSE, {
  connection: createBullMQConnection(),
  defaultJobOptions,
});

export const capRecalculationQueue = new Queue(QUEUE_NAMES.CAP_RECALCULATION, {
  connection: createBullMQConnection(),
  defaultJobOptions,
});

export const noteReviewDeadlineQueue = new Queue(QUEUE_NAMES.NOTE_REVIEW_DEADLINE_CHECK, {
  connection: createBullMQConnection(),
  defaultJobOptions,
});

export const missedVisitCheckQueue = new Queue(QUEUE_NAMES.MISSED_VISIT_CHECK, {
  connection: createBullMQConnection(),
  defaultJobOptions,
});

export const f2fDeadlineCheckQueue = new Queue(QUEUE_NAMES.F2F_DEADLINE_CHECK, {
  connection: createBullMQConnection(),
  defaultJobOptions,
});

export const benefitPeriodCheckQueue = new Queue(QUEUE_NAMES.BENEFIT_PERIOD_CHECK, {
  connection: createBullMQConnection(),
  defaultJobOptions,
});

// ── ERA ingestion queue (T3-7b) ───────────────────────────────────────────────

/**
 * Event-driven — triggered by clearinghouse webhook or manual file drop.
 * 3 retries, exponential backoff. Keep failed for review.
 */
export const eraIngestionQueue = new Queue(QUEUE_NAMES.ERA_INGESTION, {
  connection: createBullMQConnection(),
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: false,
    attempts: 3,
    backoff: { type: "exponential" as const, delay: 2000 },
  },
});

/**
 * Daily reconciliation scan — 0 7 * * * (flags stale unposted remittances).
 */
export const eraReconciliationQueue = new Queue(QUEUE_NAMES.ERA_RECONCILIATION, {
  connection: createBullMQConnection(),
  defaultJobOptions,
});

// ── Vendor compliance check queue (T3-8) ─────────────────────────────────────

/**
 * Weekly compliance scan — Monday 08:00 UTC.
 * Checks expiring BAAs, missing BAAs, and overdue security reviews.
 */
export const vendorComplianceQueue = new Queue(QUEUE_NAMES.VENDOR_COMPLIANCE_CHECK, {
  connection: createBullMQConnection(),
  defaultJobOptions,
});

// ── Physician Order Inbox queues (T3-9) ───────────────────────────────────────

/**
 * Daily expiry check — 07:00 UTC.
 * Transitions overdue orders to EXPIRED and emits compliance alerts.
 */
export const orderExpiryCheckQueue = new Queue(QUEUE_NAMES.ORDER_EXPIRY_CHECK, {
  connection: createBullMQConnection(),
  defaultJobOptions,
});

/**
 * Daily reminder check — 09:00 UTC.
 * Sends reminder events for PENDING_SIGNATURE orders not yet signed.
 */
export const orderReminderQueue = new Queue(QUEUE_NAMES.ORDER_REMINDER, {
  connection: createBullMQConnection(),
  defaultJobOptions,
});

// ── Audit Export queue (T3-10) ────────────────────────────────────────────────

/**
 * Event-driven — triggered when a compliance officer requests an export.
 * 3 retries with exponential backoff. Keep failed jobs for DLQ review.
 */
export const auditExportQueue = new Queue(QUEUE_NAMES.AUDIT_EXPORT, {
  connection: createBullMQConnection(),
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: false,
    attempts: 3,
    backoff: { type: "exponential" as const, delay: 5000 },
  },
});

// ── Claim submission queue (T3-7a) ────────────────────────────────────────────

/**
 * 3 retries, exponential backoff starting at 2s.
 * Failed jobs kept for DLQ review (removeOnFail: false).
 * DLQ transitions claim → REJECTED via worker error handler.
 */
export const claimSubmissionQueue = new Queue(QUEUE_NAMES.CLAIM_SUBMISSION, {
  connection: createBullMQConnection(),
  defaultJobOptions: {
    removeOnComplete: { count: 100 },
    removeOnFail: false, // Keep for DLQ review
    attempts: 3,
    backoff: { type: "exponential" as const, delay: 2000 },
  },
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

  // HOPE deadline check — daily at 06:00 UTC
  await hopeDeadlineCheckQueue.add(
    "daily-check",
    {},
    {
      repeat: { pattern: "0 6 * * *" },
      jobId: "hope-daily-check",
    },
  );

  // HQRP period close — quarterly on the 15th of Feb, May, Aug, Nov (submission deadlines)
  // Q1 (Jan–Mar) → Aug 15 | Q2 (Apr–Jun) → Nov 15 | Q3 (Jul–Sep) → Feb 15 | Q4 (Oct–Dec) → May 15
  await hqrpPeriodCloseQueue.add(
    "quarterly-close",
    {},
    {
      repeat: { pattern: "0 6 15 2,5,8,11 *" },
      jobId: "hqrp-quarterly-close",
    },
  );

  // Cap recalculation — Nov 2 annually (day after cap year starts Nov 1), 06:00 UTC
  await capRecalculationQueue.add(
    "annual-recalculation",
    {},
    {
      repeat: { pattern: "0 6 2 11 *" },
      jobId: "cap-annual-recalculation",
    },
  );

  // Note review deadline check — daily at 06:30 UTC (offset from other daily jobs)
  await noteReviewDeadlineQueue.add(
    "daily-check",
    {},
    {
      repeat: { pattern: "30 6 * * *" },
      jobId: "note-review-daily-check",
    },
  );

  // Missed visit check — daily at 07:00 UTC (after other morning checks)
  await missedVisitCheckQueue.add(
    "daily-check",
    {},
    {
      repeat: { pattern: "0 7 * * *" },
      jobId: "missed-visit-daily-check",
    },
  );

  // F2F deadline check — daily at 07:30 UTC
  await f2fDeadlineCheckQueue.add(
    "daily-check",
    {},
    {
      repeat: { pattern: "30 7 * * *" },
      jobId: "f2f-daily-check",
    },
  );

  // Benefit period status check — daily at 07:00 UTC
  await benefitPeriodCheckQueue.add(
    "daily-check",
    {},
    {
      repeat: { pattern: "0 7 * * *" },
      jobId: "benefit-period-daily-check",
    },
  );

  // ERA 835 reconciliation scan — daily at 07:00 UTC (T3-7b)
  await eraReconciliationQueue.add(
    "daily-reconciliation",
    {},
    {
      repeat: { pattern: "0 7 * * *" },
      jobId: "era-daily-reconciliation",
    },
  );

  // Vendor compliance check — weekly on Monday 08:00 UTC (T3-8)
  await vendorComplianceQueue.add(
    "weekly-check",
    {},
    {
      repeat: { pattern: "0 8 * * 1" },
      jobId: "vendor-weekly-compliance-check",
    },
  );

  // Order expiry check — daily at 07:00 UTC (T3-9)
  await orderExpiryCheckQueue.add(
    "daily-check",
    {},
    {
      repeat: { pattern: "0 7 * * *" },
      jobId: "order-expiry-daily-check",
    },
  );

  // Order reminder check — daily at 09:00 UTC (T3-9)
  await orderReminderQueue.add(
    "daily-check",
    {},
    {
      repeat: { pattern: "0 9 * * *" },
      jobId: "order-reminder-daily-check",
    },
  );
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

export async function closeQueues(): Promise<void> {
  await noeDeadlineQueue.close();
  await aideSupervisionQueue.close();
  await hopeSubmissionQueue.close();
  await hopeSubmissionDlq.close();
  await hopeDeadlineCheckQueue.close();
  await hqrpPeriodCloseQueue.close();
  await capRecalculationQueue.close();
  await noteReviewDeadlineQueue.close();
  await missedVisitCheckQueue.close();
  await f2fDeadlineCheckQueue.close();
  await benefitPeriodCheckQueue.close();
  await claimSubmissionQueue.close();
  await eraIngestionQueue.close();
  await eraReconciliationQueue.close();
  await vendorComplianceQueue.close();
  await orderExpiryCheckQueue.close();
  await orderReminderQueue.close();
  await auditExportQueue.close();
}
