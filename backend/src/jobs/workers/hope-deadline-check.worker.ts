/**
 * HOPE Deadline Check Worker (T3-1a)
 *
 * Daily job (0 6 * * *) that scans hope_assessments for assessments
 * approaching or past their 7-day CMS window.
 *
 * CMS rule: HOPE-A and HOPE-D must be completed within 7 calendar days.
 * 42 CFR §418.312 — non-submission = 2% Medicare payment reduction.
 *
 * Alerts:
 *   - window_deadline ≤ today + 1 day (< 24h) → hope:deadline:warning Socket.IO
 *   - window_deadline < today, status not submitted/accepted → hope:assessment:overdue
 */

import { env } from "@/config/env.js";
import { createLoggingConfig } from "@/config/logging.config.js";
import { db } from "@/db/client.js";
import { hopeAssessments } from "@/db/schema/hope-assessments.table.js";
import { complianceEvents } from "@/events/compliance-events.js";
import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { and, inArray, lte, sql } from "drizzle-orm";
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
  const todayStr = today.toISOString().split("T")[0] ?? "";

  // window_deadline within 24 hours (tomorrow or past-today but not yet submitted)
  const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowStr = tomorrow.toISOString().split("T")[0] ?? "";

  const activeStatuses: ("draft" | "in_progress" | "ready_for_review")[] = [
    "draft",
    "in_progress",
    "ready_for_review",
  ];

  // Assessments with deadline < 24h remaining (includes already-expired)
  const [upcoming, overdue] = await Promise.all([
    db
      .select({
        id: hopeAssessments.id,
        patientId: hopeAssessments.patientId,
        assessmentType: hopeAssessments.assessmentType,
        windowDeadline: hopeAssessments.windowDeadline,
      })
      .from(hopeAssessments)
      .where(
        and(
          inArray(hopeAssessments.assessmentType, ["01", "03"]), // A and D only (UV is same-day)
          inArray(hopeAssessments.status, activeStatuses),
          lte(hopeAssessments.windowDeadline, tomorrowStr),
          sql`${hopeAssessments.windowDeadline} >= ${todayStr}`,
        ),
      ),

    db
      .select({
        id: hopeAssessments.id,
        patientId: hopeAssessments.patientId,
        assessmentType: hopeAssessments.assessmentType,
        windowDeadline: hopeAssessments.windowDeadline,
      })
      .from(hopeAssessments)
      .where(
        and(
          inArray(hopeAssessments.assessmentType, ["01", "03"]),
          inArray(hopeAssessments.status, activeStatuses),
          lte(hopeAssessments.windowDeadline, todayStr),
          sql`${hopeAssessments.windowDeadline} < ${todayStr}`,
        ),
      ),
  ]);

  // Emit Socket.IO events for upcoming deadline warnings
  for (const a of upcoming) {
    const deadline = new Date(a.windowDeadline);
    const hoursRemaining = Math.round((deadline.getTime() - today.getTime()) / (1000 * 60 * 60));
    complianceEvents.emit("hope:deadline:warning", {
      assessmentId: a.id,
      patientId: a.patientId,
      assessmentType: a.assessmentType as "01" | "02" | "03",
      windowDeadline: a.windowDeadline,
      hoursRemaining,
    });
  }

  // Emit Socket.IO events for overdue assessments
  for (const a of overdue) {
    const deadline = new Date(a.windowDeadline);
    const daysOverdue = Math.floor((today.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24));
    complianceEvents.emit("hope:assessment:overdue", {
      assessmentId: a.id,
      patientId: a.patientId,
      assessmentType: a.assessmentType as "01" | "02" | "03",
      windowDeadline: a.windowDeadline,
      daysOverdue,
    });
  }

  if (upcoming.length > 0) {
    log.warn(
      { count: upcoming.length },
      "HOPE assessment window closing within 24 hours — 42 CFR §418.312",
    );
  }
  if (overdue.length > 0) {
    log.error(
      { count: overdue.length },
      "HOPE assessment OVERDUE — 42 CFR §418.312 violation — iQIES window missed",
    );
  }

  log.info(
    {
      checkedAt: today.toISOString(),
      upcomingCount: upcoming.length,
      overdueCount: overdue.length,
    },
    "hope-deadline-check: completed",
  );

  return {
    checkedAt: today.toISOString(),
    upcomingCount: upcoming.length,
    overdueCount: overdue.length,
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
