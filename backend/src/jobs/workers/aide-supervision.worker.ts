/**
 * Aide Supervision Check Worker
 *
 * CMS rule: Each hospice aide must be supervised in person or virtually
 * every 14 days. 42 CFR §418.76(h)(1)(i).
 *
 * This worker runs daily and:
 *  - Warns at day 12 (2 days before deadline)
 *  - Marks `isOverdue = true` once the 14-day window has passed
 *
 * TODO (T1-8): Emit Socket.IO `supervision:due` events per aide.
 */

import { env } from "@/config/env.js";
import { createLoggingConfig } from "@/config/logging.config.js";
import { db } from "@/db/client.js";
import { aideSupervisions } from "@/db/schema/aide-supervisions.table.js";
import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { and, lte, eq, not } from "drizzle-orm";
import pino from "pino";
import { createBullMQConnection, QUEUE_NAMES } from "../queue.js";

const log = pino(createLoggingConfig({ logLevel: env.logLevel, isDev: env.isDev }));

export type AideSupervisionJobResult = {
  checkedAt: string;
  approachingCount: number;
  overdueCount: number;
  markedOverdue: number;
};

/**
 * Pure handler — separated for testability.
 */
export async function aideSupervisionHandler(_job: Job): Promise<AideSupervisionJobResult> {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0] as string;

  // Alert window: supervision due within 2 days (day 12 of 14-day cycle)
  const alertDate = new Date(today);
  alertDate.setDate(alertDate.getDate() + 2);
  const alertDateStr = alertDate.toISOString().split("T")[0] as string;

  const [approaching, overdue] = await Promise.all([
    // Due within 2 days but not yet overdue
    db
      .select({ id: aideSupervisions.id, aideId: aideSupervisions.aideId })
      .from(aideSupervisions)
      .where(
        and(
          lte(aideSupervisions.nextSupervisionDue, alertDateStr),
          not(lte(aideSupervisions.nextSupervisionDue, todayStr)),
          eq(aideSupervisions.isOverdue, false),
        ),
      ),
    // Already past due — not yet marked
    db
      .select({ id: aideSupervisions.id, aideId: aideSupervisions.aideId })
      .from(aideSupervisions)
      .where(
        and(
          lte(aideSupervisions.nextSupervisionDue, todayStr),
          eq(aideSupervisions.isOverdue, false),
        ),
      ),
  ]);

  if (approaching.length > 0) {
    log.warn(
      { count: approaching.length, aideIds: approaching.map((r) => r.aideId) },
      "Aide supervision due within 2 days — 42 CFR §418.76",
    );
  }

  // Mark overdue records
  let markedOverdue = 0;
  if (overdue.length > 0) {
    const overdueIds = overdue.map((r) => r.id);

    // Update each overdue record — db.transaction not needed (single table write)
    for (const id of overdueIds) {
      await db
        .update(aideSupervisions)
        .set({ isOverdue: true, updatedAt: new Date() })
        .where(eq(aideSupervisions.id, id));
    }
    markedOverdue = overdue.length;

    log.error(
      { count: overdue.length, aideIds: overdue.map((r) => r.aideId) },
      "Aide supervision OVERDUE — 42 CFR §418.76 violation",
    );
  }

  return {
    checkedAt: today.toISOString(),
    approachingCount: approaching.length,
    overdueCount: overdue.length,
    markedOverdue,
  };
}

// ── Worker instance ───────────────────────────────────────────────────────────

export function createAideSupervisionWorker(): Worker<object, AideSupervisionJobResult> {
  const worker = new Worker(QUEUE_NAMES.AIDE_SUPERVISION_CHECK, aideSupervisionHandler, {
    connection: createBullMQConnection(),
    concurrency: 1,
  });

  worker.on("completed", (job, result) => {
    log.info({ jobId: job.id, result }, "aide-supervision-check completed");
  });

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "aide-supervision-check failed");
  });

  return worker;
}
