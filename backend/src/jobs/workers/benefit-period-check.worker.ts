/**
 * Benefit Period Check Worker — T3-4
 *
 * Scheduled: daily at 07:00 UTC.
 * For each location with active benefit periods:
 *   1. Calls BenefitPeriodService.deriveStatuses(locationId)
 *   2. Upserts compliance alerts for transitioned periods
 *   3. Emits Socket.IO events via complianceEvents
 */

import { env } from "@/config/env.js";
import { createLoggingConfig } from "@/config/logging.config.js";
import { BenefitPeriodService } from "@/contexts/billing/services/benefit-period.service.js";
import { AlertService } from "@/contexts/compliance/services/alert.service.js";
import { db } from "@/db/client.js";
import { patients } from "@/db/schema/patients.table.js";
import { complianceEvents } from "@/events/compliance-events.js";
import type { UpsertAlertInput } from "@hospici/shared-types";
import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { eq } from "drizzle-orm";
import type Valkey from "iovalkey";
import pino from "pino";
import { QUEUE_NAMES, createBullMQConnection } from "../queue.js";

const log = pino(createLoggingConfig({ logLevel: env.logLevel, isDev: env.isDev }));

export type BenefitPeriodCheckJobData = Record<string, never>;

export type BenefitPeriodCheckJobResult = {
  checkedAt: string;
  locationsChecked: number;
  transitionsDetected: number;
  alertsUpserted: number;
};

let _valkey: Valkey | null = null;

export function setValkeyInstance(v: Valkey): void {
  _valkey = v;
}

// ── Patient name lookup (for alert upserts) ───────────────────────────────────

async function getPatientName(patientId: string): Promise<string> {
  const rows = await db
    .select({ data: patients.data })
    .from(patients)
    .where(eq(patients.id, patientId))
    .limit(1);
  const pData = rows[0]?.data as Record<string, unknown> | null | undefined;
  const humanName = (pData?.name as Array<{ given?: string[]; family?: string }> | undefined)?.[0];
  if (!humanName) return "[unknown]";
  return `${humanName.given?.join(" ") ?? ""} ${humanName.family ?? ""}`.trim() || "[unknown]";
}

// ── Worker handler ────────────────────────────────────────────────────────────

export async function benefitPeriodCheckHandler(
  _job: Job<BenefitPeriodCheckJobData>,
): Promise<BenefitPeriodCheckJobResult> {
  const checkedAt = new Date().toISOString();
  log.info({ checkedAt }, "benefit-period-check: starting");

  if (!_valkey) {
    log.warn("benefit-period-check: valkey not available, skipping");
    return { checkedAt, locationsChecked: 0, transitionsDetected: 0, alertsUpserted: 0 };
  }

  const svc = new BenefitPeriodService(_valkey, log);
  const alertSvc = new AlertService(_valkey);

  const locationIds = await svc.getActiveLocationIds();
  let transitionsDetected = 0;
  let alertsUpserted = 0;

  for (const locationId of locationIds) {
    try {
      const transitions = await svc.deriveStatuses(locationId);
      transitionsDetected += transitions.length;

      for (const t of transitions) {
        // Emit the status-changed event
        complianceEvents.emit("benefit:period:status:changed", {
          locationId: t.locationId,
          periodId: t.periodId,
          patientId: t.patientId,
          periodNumber: t.periodNumber,
          oldStatus: t.oldStatus,
          newStatus: t.newStatus,
          billingRisk: t.billingRisk,
          checkedAt,
        });

        const patientName = await getPatientName(t.patientId);

        // ── Upsert alerts based on new status ──────────────────────────
        const alertsToUpsert: UpsertAlertInput[] = [];

        if (t.newStatus === "recert_due" && t.recertDueDate) {
          const daysRemaining = Math.max(
            0,
            Math.floor(
              (new Date(t.recertDueDate).getTime() - Date.now()) / 86_400_000,
            ),
          );
          alertsToUpsert.push({
            locationId: t.locationId,
            patientId: t.patientId,
            patientName,
            type: "RECERT_DUE",
            severity: "warning",
            dueDate: t.recertDueDate,
            daysRemaining,
            description: `Recertification due for benefit period #${t.periodNumber}`,
            rootCause: "Benefit period is within 14 days of expiry",
            nextAction: "Contact attending physician to complete recertification",
          });

          complianceEvents.emit("benefit:period:recert_task", {
            periodId: t.periodId,
            patientId: t.patientId,
            locationId: t.locationId,
            periodNumber: t.periodNumber,
            recertDueDate: t.recertDueDate,
            severity: "warning",
          });
        }

        if (t.newStatus === "at_risk" && t.recertDueDate) {
          const daysRemaining = Math.max(
            0,
            Math.floor(
              (new Date(t.recertDueDate).getTime() - Date.now()) / 86_400_000,
            ),
          );
          alertsToUpsert.push({
            locationId: t.locationId,
            patientId: t.patientId,
            patientName,
            type: "RECERT_AT_RISK",
            severity: "critical",
            dueDate: t.recertDueDate,
            daysRemaining,
            description: `Recertification at risk — period #${t.periodNumber} expires in ≤7 days`,
            rootCause: "Benefit period within 7 days of expiry without completed recertification",
            nextAction: "Immediate physician contact required for recertification",
          });

          complianceEvents.emit("benefit:period:recert_task", {
            periodId: t.periodId,
            patientId: t.patientId,
            locationId: t.locationId,
            periodNumber: t.periodNumber,
            recertDueDate: t.recertDueDate,
            severity: "critical",
          });
        }

        if (t.newStatus === "past_due") {
          alertsToUpsert.push({
            locationId: t.locationId,
            patientId: t.patientId,
            patientName,
            type: "RECERT_PAST_DUE",
            severity: "critical",
            dueDate: t.recertDueDate ?? null,
            daysRemaining: 0,
            description: `Benefit period #${t.periodNumber} is past due — billing suspended`,
            rootCause: "Period end date passed without completed recertification",
            nextAction: "Contact compliance officer immediately — claims may be blocked",
          });
        }

        if (t.f2fRequired) {
          if (t.f2fStatus === "due_soon" && t.f2fWindowStart && t.f2fWindowEnd) {
            alertsToUpsert.push({
              locationId: t.locationId,
              patientId: t.patientId,
              patientName,
              type: "F2F_DUE_SOON",
              severity: "warning",
              dueDate: t.f2fWindowEnd,
              daysRemaining: Math.max(
                0,
                Math.floor((new Date(t.f2fWindowEnd).getTime() - Date.now()) / 86_400_000),
              ),
              description: `F2F encounter due for period #${t.periodNumber} recertification`,
              rootCause: "F2F window is open and encounter not yet documented",
              nextAction: "Schedule and document F2F encounter before recertification date",
            });

            complianceEvents.emit("benefit:period:f2f_task", {
              periodId: t.periodId,
              patientId: t.patientId,
              locationId: t.locationId,
              periodNumber: t.periodNumber,
              f2fWindowStart: t.f2fWindowStart,
              f2fWindowEnd: t.f2fWindowEnd,
              severity: "warning",
            });
          }

          if (t.f2fStatus === "missing" && t.f2fWindowEnd) {
            alertsToUpsert.push({
              locationId: t.locationId,
              patientId: t.patientId,
              patientName,
              type: "F2F_MISSING",
              severity: "critical",
              dueDate: t.f2fWindowEnd,
              daysRemaining: 0,
              description: `F2F encounter missing for period #${t.periodNumber} — recertification blocked`,
              rootCause: "F2F window has closed without a documented encounter",
              nextAction: "Review F2F documentation; recertification cannot proceed until resolved",
            });

            if (t.f2fWindowStart) {
              complianceEvents.emit("benefit:period:f2f_task", {
                periodId: t.periodId,
                patientId: t.patientId,
                locationId: t.locationId,
                periodNumber: t.periodNumber,
                f2fWindowStart: t.f2fWindowStart,
                f2fWindowEnd: t.f2fWindowEnd,
                severity: "critical",
              });
            }
          }
        }

        if (t.billingRisk) {
          alertsToUpsert.push({
            locationId: t.locationId,
            patientId: t.patientId,
            patientName,
            type: "BENEFIT_PERIOD_BILLING_RISK",
            severity: "warning",
            dueDate: null,
            daysRemaining: 0,
            description: `Billing risk on period #${t.periodNumber}`,
            rootCause: "Period has billing risk condition",
            nextAction: "Review period status and resolve outstanding compliance issues",
          });
        }

        for (const alertInput of alertsToUpsert) {
          try {
            await alertSvc.upsertAlert(alertInput);
            alertsUpserted++;
          } catch (alertErr) {
            log.error(
              { alertErr, patientId: t.patientId, type: alertInput.type },
              "benefit-period-check: alert upsert failed",
            );
          }
        }
      }

      log.info(
        { locationId, transitions: transitions.length },
        "benefit-period-check: location complete",
      );
    } catch (err) {
      log.error({ err, locationId }, "benefit-period-check: location failed");
    }
  }

  return {
    checkedAt,
    locationsChecked: locationIds.length,
    transitionsDetected,
    alertsUpserted,
  };
}

// ── Worker factory ────────────────────────────────────────────────────────────

export function createBenefitPeriodCheckWorker(
  valkey?: Valkey,
): Worker<BenefitPeriodCheckJobData, BenefitPeriodCheckJobResult> {
  if (valkey) _valkey = valkey;

  const worker = new Worker(QUEUE_NAMES.BENEFIT_PERIOD_CHECK, benefitPeriodCheckHandler, {
    connection: createBullMQConnection(),
    concurrency: 1,
  });

  worker.on("completed", (job, result) => {
    log.info(
      {
        jobId: job.id,
        locationsChecked: result.locationsChecked,
        transitionsDetected: result.transitionsDetected,
        alertsUpserted: result.alertsUpserted,
      },
      "benefit-period-check completed",
    );
  });

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "benefit-period-check failed");
  });

  return worker;
}
