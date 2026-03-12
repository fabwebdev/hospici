/**
 * NOE/NOTR Deadline Check Worker — T3-2a
 *
 * CMS rules:
 *   - NOE: 5 business days from election date (42 CFR §418.21)
 *   - NOTR: 5 business days from revocation date
 *
 * Runs daily (06:00 UTC) and checks both notices_of_election and
 * notices_of_termination_revocation for:
 *
 *   UPCOMING (≤48h to deadline, not past):
 *     → emit noe:deadline:warning / notr:deadline:warning
 *     → upsert NOE_DEADLINE / NOTR_DEADLINE alert (warning severity)
 *
 *   OVERDUE (deadline passed, not yet submitted/accepted/closed/voided):
 *     → transition status → late_pending_override
 *     → set isClaimBlocking = true
 *     → upsert NOE_LATE / NOTR_LATE alert (critical severity)
 *     → emit noe:late / notr:late
 */

import { env } from "@/config/env.js";
import { createLoggingConfig } from "@/config/logging.config.js";
import { AlertService } from "@/contexts/compliance/services/alert.service.js";
import { db } from "@/db/client.js";
import { noticesOfElection } from "@/db/schema/noe.table.js";
import { noticesOfTerminationRevocation } from "@/db/schema/notr.table.js";
import { complianceEvents } from "@/events/compliance-events.js";
import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { and, inArray, lte, not } from "drizzle-orm";
import type Valkey from "iovalkey";
import pino from "pino";
import { QUEUE_NAMES, createBullMQConnection } from "../queue.js";

const log = pino(createLoggingConfig({ logLevel: env.logLevel, isDev: env.isDev }));

export type NoeDeadlineJobResult = {
  checkedAt: string;
  upcomingCount: number;
  overdueCount: number;
};

// ── Shared handler context — injected from factory so tests can override ──────

let alertService: AlertService | null = null;

export function setAlertService(svc: AlertService): void {
  alertService = svc;
}

// ── Statuses that are "terminal" (no action needed) ───────────────────────────

const TERMINAL_STATUSES = ["submitted", "accepted", "closed", "voided"] as const;
const ACTIVE_STATUSES = ["draft", "ready_for_submission", "late_pending_override"] as const;

/**
 * Pure handler — separated for testability.
 * Returns counts of upcoming and overdue NOEs+NOTRs.
 */
export async function noeDeadlineHandler(_job: Job): Promise<NoeDeadlineJobResult> {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0] as string;

  // Lookahead window: alert if deadline is within 2 calendar days
  const lookahead = new Date(today);
  lookahead.setDate(lookahead.getDate() + 2);
  const lookaheadStr = lookahead.toISOString().split("T")[0] as string;

  // ── NOE deadline checks ────────────────────────────────────────────────────

  const noeSelectFields = {
    id: noticesOfElection.id,
    patientId: noticesOfElection.patientId,
    locationId: noticesOfElection.locationId,
    deadlineDate: noticesOfElection.deadlineDate,
    status: noticesOfElection.status,
  };

  const [noeUpcoming, noeOverdue] = await Promise.all([
    // NOE deadline approaching but not yet past
    db
      .select(noeSelectFields)
      .from(noticesOfElection)
      .where(
        and(
          lte(noticesOfElection.deadlineDate, lookaheadStr),
          not(lte(noticesOfElection.deadlineDate, todayStr)),
          not(inArray(noticesOfElection.status, [...TERMINAL_STATUSES])),
        ),
      ),
    // NOE deadline already past — not in a terminal status
    db
      .select(noeSelectFields)
      .from(noticesOfElection)
      .where(
        and(
          lte(noticesOfElection.deadlineDate, todayStr),
          inArray(noticesOfElection.status, [...ACTIVE_STATUSES]),
        ),
      ),
  ]);

  // ── NOTR deadline checks ───────────────────────────────────────────────────

  const notrSelectFields = {
    id: noticesOfTerminationRevocation.id,
    patientId: noticesOfTerminationRevocation.patientId,
    locationId: noticesOfTerminationRevocation.locationId,
    deadlineDate: noticesOfTerminationRevocation.deadlineDate,
    status: noticesOfTerminationRevocation.status,
  };

  const [notrUpcoming, notrOverdue] = await Promise.all([
    db
      .select(notrSelectFields)
      .from(noticesOfTerminationRevocation)
      .where(
        and(
          lte(noticesOfTerminationRevocation.deadlineDate, lookaheadStr),
          not(lte(noticesOfTerminationRevocation.deadlineDate, todayStr)),
          not(inArray(noticesOfTerminationRevocation.status, [...TERMINAL_STATUSES])),
        ),
      ),
    db
      .select(notrSelectFields)
      .from(noticesOfTerminationRevocation)
      .where(
        and(
          lte(noticesOfTerminationRevocation.deadlineDate, todayStr),
          inArray(noticesOfTerminationRevocation.status, [...ACTIVE_STATUSES]),
        ),
      ),
  ]);

  let upcomingCount = 0;
  let overdueCount = 0;

  // ── Process NOE upcoming ───────────────────────────────────────────────────

  if (noeUpcoming.length > 0) {
    log.warn(
      { count: noeUpcoming.length, patientIds: noeUpcoming.map((r) => r.patientId) },
      "NOE filing deadline approaching within 2 days",
    );

    for (const noe of noeUpcoming) {
      const deadline = noe.deadlineDate ?? todayStr;
      const daysRemaining = Math.ceil(
        (new Date(deadline).getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );
      const patientName = `Patient:${noe.patientId}`;

      complianceEvents.emit("noe:deadline:warning", {
        noeId: noe.id,
        patientId: noe.patientId,
        patientName,
        deadline,
        businessDaysRemaining: Math.max(0, daysRemaining),
      });

      if (alertService && noe.locationId) {
        await alertService
          .upsertAlert({
            type: "NOE_DEADLINE",
            severity: daysRemaining <= 1 ? "critical" : "warning",
            patientId: noe.patientId,
            patientName,
            locationId: noe.locationId,
            dueDate: deadline,
            daysRemaining: Math.max(0, daysRemaining),
            description: `NOE filing deadline approaches in ${Math.max(0, daysRemaining)} day(s). 42 CFR §418.21`,
            rootCause: "NOE not submitted",
            nextAction: `Submit Notice of Election by ${deadline}`,
          })
          .catch((err: unknown) =>
            log.error({ err, patientId: noe.patientId }, "alertService.upsertAlert failed (NOE upcoming)"),
          );

        complianceEvents.emit("compliance:alert", {
          alertId: noe.id,
          type: "NOE_DEADLINE",
          severity: daysRemaining <= 1 ? "critical" : "warning",
          patientId: noe.patientId,
          locationId: noe.locationId,
          daysRemaining: Math.max(0, daysRemaining),
        });
      }

      upcomingCount += 1;
    }
  }

  // ── Process NOTR upcoming ──────────────────────────────────────────────────

  if (notrUpcoming.length > 0) {
    log.warn(
      { count: notrUpcoming.length, patientIds: notrUpcoming.map((r) => r.patientId) },
      "NOTR filing deadline approaching within 2 days",
    );

    for (const notr of notrUpcoming) {
      const deadline = notr.deadlineDate ?? todayStr;
      const daysRemaining = Math.ceil(
        (new Date(deadline).getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );
      const patientName = `Patient:${notr.patientId}`;

      complianceEvents.emit("notr:deadline:warning", {
        notrId: notr.id,
        patientId: notr.patientId,
        patientName,
        deadline,
        businessDaysRemaining: Math.max(0, daysRemaining),
      });

      if (alertService && notr.locationId) {
        await alertService
          .upsertAlert({
            type: "NOTR_DEADLINE",
            severity: daysRemaining <= 1 ? "critical" : "warning",
            patientId: notr.patientId,
            patientName,
            locationId: notr.locationId,
            dueDate: deadline,
            daysRemaining: Math.max(0, daysRemaining),
            description: `NOTR filing deadline approaches in ${Math.max(0, daysRemaining)} day(s)`,
            rootCause: "NOTR not submitted",
            nextAction: `Submit Notice of Termination/Revocation by ${deadline}`,
          })
          .catch((err: unknown) =>
            log.error({ err, patientId: notr.patientId }, "alertService.upsertAlert failed (NOTR upcoming)"),
          );

        complianceEvents.emit("compliance:alert", {
          alertId: notr.id,
          type: "NOTR_DEADLINE",
          severity: daysRemaining <= 1 ? "critical" : "warning",
          patientId: notr.patientId,
          locationId: notr.locationId,
          daysRemaining: Math.max(0, daysRemaining),
        });
      }

      upcomingCount += 1;
    }
  }

  // ── Process NOE overdue ────────────────────────────────────────────────────

  if (noeOverdue.length > 0) {
    log.error(
      { count: noeOverdue.length, patientIds: noeOverdue.map((r) => r.patientId) },
      "NOE filing deadline OVERDUE — transitioning to late_pending_override",
    );

    for (const noe of noeOverdue) {
      const deadline = noe.deadlineDate ?? todayStr;
      const daysOverdue = Math.floor(
        (today.getTime() - new Date(deadline).getTime()) / (1000 * 60 * 60 * 24),
      );
      const patientName = `Patient:${noe.patientId}`;

      // Transition to late_pending_override and set isClaimBlocking
      await db
        .update(noticesOfElection)
        .set({
          status: "late_pending_override",
          isLate: true,
          isClaimBlocking: true,
          updatedAt: new Date(),
        })
        .where(
          and(
            inArray(noticesOfElection.status, [...ACTIVE_STATUSES]),
            inArray(noticesOfElection.id, [noe.id]),
          ),
        )
        .catch((err: unknown) =>
          log.error({ err, noeId: noe.id }, "Failed to transition NOE to late_pending_override"),
        );

      complianceEvents.emit("noe:late", {
        noeId: noe.id,
        patientId: noe.patientId,
        patientName,
        deadline,
        daysOverdue,
      });

      if (alertService && noe.locationId) {
        await alertService
          .upsertAlert({
            type: "NOE_LATE",
            severity: "critical",
            patientId: noe.patientId,
            patientName,
            locationId: noe.locationId,
            dueDate: deadline,
            daysRemaining: -daysOverdue,
            description: `NOE filing deadline OVERDUE by ${daysOverdue} day(s). Claims are blocked. 42 CFR §418.21`,
            rootCause: "NOE not submitted — deadline passed",
            nextAction: "Submit NOE immediately with supervisor late-override approval and contact CMS MAC",
          })
          .catch((err: unknown) =>
            log.error({ err, patientId: noe.patientId }, "alertService.upsertAlert failed (NOE overdue)"),
          );

        complianceEvents.emit("compliance:alert", {
          alertId: noe.id,
          type: "NOE_LATE",
          severity: "critical",
          patientId: noe.patientId,
          locationId: noe.locationId,
          daysRemaining: -daysOverdue,
        });
      }

      overdueCount += 1;
    }
  }

  // ── Process NOTR overdue ───────────────────────────────────────────────────

  if (notrOverdue.length > 0) {
    log.error(
      { count: notrOverdue.length, patientIds: notrOverdue.map((r) => r.patientId) },
      "NOTR filing deadline OVERDUE — transitioning to late_pending_override",
    );

    for (const notr of notrOverdue) {
      const deadline = notr.deadlineDate ?? todayStr;
      const daysOverdue = Math.floor(
        (today.getTime() - new Date(deadline).getTime()) / (1000 * 60 * 60 * 24),
      );
      const patientName = `Patient:${notr.patientId}`;

      await db
        .update(noticesOfTerminationRevocation)
        .set({
          status: "late_pending_override",
          isLate: true,
          isClaimBlocking: true,
          updatedAt: new Date(),
        })
        .where(
          and(
            inArray(noticesOfTerminationRevocation.status, [...ACTIVE_STATUSES]),
            inArray(noticesOfTerminationRevocation.id, [notr.id]),
          ),
        )
        .catch((err: unknown) =>
          log.error({ err, notrId: notr.id }, "Failed to transition NOTR to late_pending_override"),
        );

      complianceEvents.emit("notr:late", {
        notrId: notr.id,
        patientId: notr.patientId,
        patientName,
        deadline,
        daysOverdue,
      });

      if (alertService && notr.locationId) {
        await alertService
          .upsertAlert({
            type: "NOTR_LATE",
            severity: "critical",
            patientId: notr.patientId,
            patientName,
            locationId: notr.locationId,
            dueDate: deadline,
            daysRemaining: -daysOverdue,
            description: `NOTR filing deadline OVERDUE by ${daysOverdue} day(s). Claims are blocked.`,
            rootCause: "NOTR not submitted — deadline passed",
            nextAction: "Submit NOTR immediately with supervisor late-override approval and contact CMS MAC",
          })
          .catch((err: unknown) =>
            log.error({ err, patientId: notr.patientId }, "alertService.upsertAlert failed (NOTR overdue)"),
          );

        complianceEvents.emit("compliance:alert", {
          alertId: notr.id,
          type: "NOTR_LATE",
          severity: "critical",
          patientId: notr.patientId,
          locationId: notr.locationId,
          daysRemaining: -daysOverdue,
        });
      }

      overdueCount += 1;
    }
  }

  return {
    checkedAt: today.toISOString(),
    upcomingCount,
    overdueCount,
  };
}

// ── Worker instance ────────────────────────────────────────────────────────────

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
