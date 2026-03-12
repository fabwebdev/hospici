/**
 * NOE Deadline Check Worker
 *
 * CMS rule: Notice of Election must be filed within 5 business days of the
 * hospice election date. 42 CFR §418.24.
 *
 * This worker runs daily and flags any pending NOEs whose filing deadline
 * falls within the next 2 days, giving staff a 2-day advance warning.
 *
 * TODO (T1-8): Emit Socket.IO `noe:deadline-warning` events per patient.
 */

import { env } from "@/config/env.js";
import { createLoggingConfig } from "@/config/logging.config.js";
import { db } from "@/db/client.js";
import { noticeOfElection } from "@/db/schema/noe.table.js";
import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { and, lte, not, eq } from "drizzle-orm";
import pino from "pino";
import { createBullMQConnection, QUEUE_NAMES } from "../queue.js";

const log = pino(createLoggingConfig({ logLevel: env.logLevel, isDev: env.isDev }));

export type NoeDeadlineJobResult = {
  checkedAt: string;
  upcomingCount: number;
  overdueCount: number;
};

/**
 * Pure handler — separated for testability.
 * Returns counts of upcoming and overdue NOEs.
 */
export async function noeDeadlineHandler(_job: Job): Promise<NoeDeadlineJobResult> {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0] as string;

  // Lookahead window: alert if deadline is within 2 calendar days
  const lookahead = new Date(today);
  lookahead.setDate(lookahead.getDate() + 2);
  const lookaheadStr = lookahead.toISOString().split("T")[0] as string;

  const [upcoming, overdue] = await Promise.all([
    // Deadline approaching but not yet past
    db
      .select({ id: noticeOfElection.id, patientId: noticeOfElection.patientId })
      .from(noticeOfElection)
      .where(
        and(
          lte(noticeOfElection.filingDeadline, lookaheadStr),
          not(lte(noticeOfElection.filingDeadline, todayStr)),
          not(eq(noticeOfElection.status, "submitted")),
          not(eq(noticeOfElection.status, "filed")),
        ),
      ),
    // Deadline already past — NOE not filed
    db
      .select({ id: noticeOfElection.id, patientId: noticeOfElection.patientId })
      .from(noticeOfElection)
      .where(
        and(
          lte(noticeOfElection.filingDeadline, todayStr),
          not(eq(noticeOfElection.status, "submitted")),
          not(eq(noticeOfElection.status, "filed")),
        ),
      ),
  ]);

  if (upcoming.length > 0) {
    log.warn(
      { count: upcoming.length, patientIds: upcoming.map((r) => r.patientId) },
      "NOE filing deadline approaching within 2 days",
    );
  }

  if (overdue.length > 0) {
    log.error(
      { count: overdue.length, patientIds: overdue.map((r) => r.patientId) },
      "NOE filing deadline OVERDUE — immediate action required",
    );
  }

  return {
    checkedAt: today.toISOString(),
    upcomingCount: upcoming.length,
    overdueCount: overdue.length,
  };
}

// ── Worker instance ───────────────────────────────────────────────────────────

export function createNoeDeadlineWorker(): Worker<object, NoeDeadlineJobResult> {
  const worker = new Worker(QUEUE_NAMES.NOE_DEADLINE_CHECK, noeDeadlineHandler, {
    connection: createBullMQConnection(),
    concurrency: 1, // Compliance checks should not run in parallel
  });

  worker.on("completed", (job, result) => {
    log.info({ jobId: job.id, result }, "noe-deadline-check completed");
  });

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "noe-deadline-check failed");
  });

  return worker;
}
