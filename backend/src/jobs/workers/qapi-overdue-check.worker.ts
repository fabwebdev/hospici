// jobs/workers/qapi-overdue-check.worker.ts
// T3-11: Daily QAPI action item overdue check + quality outlier detection.
// - Flags overdue action items → QAPI_ACTION_OVERDUE alerts + qapi:action:overdue socket
// - Detects first-pass rate declines → FIRST_PASS_DECLINE alerts + quality:outlier:detected socket
// - Detects rising billing-impact trends → BILLING_DEFICIENCY_RISING alerts

import { QAPIService } from "@/contexts/qapi/services/qapi.service.js";
import { QualityAnalyticsService } from "@/contexts/analytics/services/qualityAnalytics.service.js";
import { AlertService } from "@/contexts/compliance/services/alert.service.js";
import { complianceEvents } from "@/events/compliance-events.js";
import { env } from "@/config/env.js";
import { createLoggingConfig } from "@/config/logging.config.js";
import { db } from "@/db/client.js";
import { locations } from "@/db/schema/locations.table.js";
import { eq } from "drizzle-orm";
import { Worker } from "bullmq";
import type Valkey from "iovalkey";
import pino from "pino";
import { QUEUE_NAMES, createBullMQConnection } from "../queue.js";

const log = pino(createLoggingConfig({ logLevel: env.logLevel, isDev: env.isDev }));

let alertService: AlertService | null = null;

export function createQAPIOverdueCheckWorker(valkey?: Valkey) {
  if (valkey && !alertService) {
    alertService = new AlertService(valkey);
  }

  const worker = new Worker(
    QUEUE_NAMES.QAPI_OVERDUE_CHECK,
    async (job) => {
      // ── Overdue action items ─────────────────────────────────────────────────
      const overdueItems = await QAPIService.getOverdueActionItems();

      for (const item of overdueItems) {
        if (alertService) {
          await alertService
            .upsertAlert({
              type: "QAPI_ACTION_OVERDUE",
              severity: "warning",
              patientId: item.locationId,
              patientName: "N/A",
              locationId: item.locationId,
              dueDate: item.dueDate,
              daysRemaining: 0,
              description: `QAPI action item overdue (due ${item.dueDate})`,
              rootCause: `Action item not completed by due date`,
              nextAction: "Complete or reassign the QAPI action item",
            })
            .catch((err) => log.error({ err, itemId: item.id }, "upsertAlert failed"));
        }

        complianceEvents.emit("qapi:action:overdue", {
          eventId: item.eventId,
          actionItemId: item.id,
          assignedToId: item.assignedToId,
          locationId: item.locationId,
        });
      }

      job.log(`QAPI overdue check: ${overdueItems.length} overdue action items`);

      // ── Quality outlier detection ────────────────────────────────────────────
      const allLocations = await db
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.isActive, true));

      let totalOutliers = 0;

      for (const loc of allLocations) {
        const { data: outliers } = await QualityAnalyticsService.getQualityOutliers({
          locationId: loc.id,
        });

        for (const outlier of outliers) {
          const alertType =
            outlier.metric === "firstPassRate"
              ? ("FIRST_PASS_DECLINE" as const)
              : outlier.metric === "billingImpactRate"
                ? ("BILLING_DEFICIENCY_RISING" as const)
                : ("COMPLIANCE_DEFICIENCY_RISING" as const);

          if (alertService) {
            await alertService
              .upsertAlert({
                type: alertType,
                severity: "warning",
                patientId: outlier.subjectId,
                patientName: outlier.subjectName,
                locationId: loc.id,
                dueDate: null,
                daysRemaining: 0,
                description: `Quality outlier: ${outlier.metric} = ${outlier.value} (threshold: ${outlier.threshold})`,
                rootCause: `${outlier.subjectType} ${outlier.subjectName} has ${outlier.metric} trending outside bounds`,
                nextAction: "Review clinician scorecard and consider raising a QAPI event",
              })
              .catch((err) => log.error({ err }, "quality outlier upsertAlert failed"));
          }

          complianceEvents.emit("quality:outlier:detected", { outlier });
          totalOutliers++;
        }
      }

      job.log(
        `QAPI outlier detection: ${totalOutliers} outliers across ${allLocations.length} locations`,
      );

      return { overdueCount: overdueItems.length, outlierCount: totalOutliers };
    },
    {
      connection: createBullMQConnection(),
      concurrency: 1,
    },
  );

  worker.on("completed", (job, result) => {
    log.info({ jobId: job.id, result }, "qapi-overdue-check completed");
  });

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "qapi-overdue-check failed");
  });

  return worker;
}
