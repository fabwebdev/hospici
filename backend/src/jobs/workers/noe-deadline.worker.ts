/**
 * NOE Deadline Check Worker
 *
 * CMS rule: Notice of Election must be filed within 5 business days of the
 * hospice election date. 42 CFR §418.24.
 *
 * This worker runs daily and flags any pending NOEs whose filing deadline
 * falls within the next 2 days, giving staff a 2-day advance warning.
 * Emits `noe:deadline:warning` via Socket.IO for each approaching NOE.
 */

import { env } from "@/config/env.js";
import { createLoggingConfig } from "@/config/logging.config.js";
import { AlertService } from "@/contexts/compliance/services/alert.service.js";
import { db } from "@/db/client.js";
import { noticeOfElection } from "@/db/schema/noe.table.js";
import { complianceEvents } from "@/events/compliance-events.js";
import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { and, eq, lte, not } from "drizzle-orm";
import type Valkey from "iovalkey";
import pino from "pino";
import { QUEUE_NAMES, createBullMQConnection } from "../queue.js";

const log = pino(createLoggingConfig({ logLevel: env.logLevel, isDev: env.isDev }));

export type NoeDeadlineJobResult = {
  checkedAt: string;
  upcomingCount: number;
  overdueCount: number;
};

// Shared handler context — injected from factory so tests can override
let alertService: AlertService | null = null;

export function setAlertService(svc: AlertService): void {
  alertService = svc;
}

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

  const selectFields = {
    id: noticeOfElection.id,
    patientId: noticeOfElection.patientId,
    locationId: noticeOfElection.locationId,
    filingDeadline: noticeOfElection.filingDeadline,
  };

  const [upcoming, overdue] = await Promise.all([
    // Deadline approaching but not yet past
    db
      .select(selectFields)
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
      .select(selectFields)
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
    for (const noe of upcoming) {
      const deadline = noe.filingDeadline ?? todayStr;
      const daysRemaining = Math.ceil(
        (new Date(deadline).getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Patient name is stored in JSONB data (PHI-encrypted) — resolved by alert
      // list route when displaying to users. Worker stores patient ID as reference.
      const patientName = `Patient:${noe.patientId}`;

      complianceEvents.emit("noe:deadline:warning", {
        noeId: noe.id,
        patientId: noe.patientId,
        patientName,
        deadline,
        businessDaysRemaining: Math.max(0, daysRemaining),
      });

      // Upsert compliance alert — notifies dashboard in real-time
      if (alertService && noe.locationId) {
        await alertService.upsertAlert({
          type: "NOE_DEADLINE",
          severity: daysRemaining <= 1 ? "critical" : "warning",
          patientId: noe.patientId,
          patientName,
          locationId: noe.locationId,
          dueDate: deadline,
          daysRemaining: Math.max(0, daysRemaining),
          description: `NOE filing deadline approaches in ${Math.max(0, daysRemaining)} day(s). 42 CFR §418.22`,
          rootCause: "NOE not submitted",
          nextAction: `Submit Notice of Election by ${deadline}`,
        }).catch((err) => log.error({ err, patientId: noe.patientId }, "alertService.upsertAlert failed"));

        complianceEvents.emit("compliance:alert", {
          alertId: noe.id,
          type: "NOE_DEADLINE",
          severity: daysRemaining <= 1 ? "critical" : "warning",
          patientId: noe.patientId,
          locationId: noe.locationId,
          daysRemaining: Math.max(0, daysRemaining),
        });
      }
    }
  }

  if (overdue.length > 0) {
    log.error(
      { count: overdue.length, patientIds: overdue.map((r) => r.patientId) },
      "NOE filing deadline OVERDUE — immediate action required",
    );
    for (const noe of overdue) {
      const deadline = noe.filingDeadline ?? todayStr;
      const daysOverdue = Math.floor(
        (today.getTime() - new Date(deadline).getTime()) / (1000 * 60 * 60 * 24),
      );

      const patientName = `Patient:${noe.patientId}`;

      if (alertService && noe.locationId) {
        await alertService.upsertAlert({
          type: "NOE_DEADLINE",
          severity: "critical",
          patientId: noe.patientId,
          patientName,
          locationId: noe.locationId,
          dueDate: deadline,
          daysRemaining: -daysOverdue,
          description: `NOE filing deadline OVERDUE by ${daysOverdue} day(s). 42 CFR §418.22`,
          rootCause: "NOE not submitted — deadline passed",
          nextAction: "Submit NOE immediately and contact CMS MAC",
        }).catch((err) => log.error({ err, patientId: noe.patientId }, "alertService.upsertAlert failed"));

        complianceEvents.emit("compliance:alert", {
          alertId: noe.id,
          type: "NOE_DEADLINE",
          severity: "critical",
          patientId: noe.patientId,
          locationId: noe.locationId,
          daysRemaining: -daysOverdue,
        });
      }
    }
  }

  return {
    checkedAt: today.toISOString(),
    upcomingCount: upcoming.length,
    overdueCount: overdue.length,
  };
}

// ── Worker instance ───────────────────────────────────────────────────────────

export function createNoeDeadlineWorker(valkey?: Valkey): Worker<object, NoeDeadlineJobResult> {
  if (valkey && !alertService) {
    alertService = new AlertService(valkey);
  }
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
