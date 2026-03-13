// jobs/workers/vendor-compliance-check.worker.ts
// T3-8: Weekly BAA + security review compliance scan.
// Scans all active locations for expiring BAAs, missing BAAs, and overdue security reviews.

import { VendorService } from "@/contexts/vendors/services/vendor.service.js";
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

export function createVendorComplianceWorker(_valkey?: Valkey) {
  const worker = new Worker(
    QUEUE_NAMES.VENDOR_COMPLIANCE_CHECK,
    async (job) => {
      const allLocations = await db
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.isActive, true));

      job.log(`Vendor compliance check: scanning ${allLocations.length} locations`);

      let totalExpiring = 0;
      let totalMissing = 0;
      let totalOverdue = 0;

      for (const loc of allLocations) {
        const result = await VendorService.runComplianceCheck(loc.id);
        totalExpiring += result.expiringCount;
        totalMissing += result.missingCount;
        totalOverdue += result.overdueReviewCount;
      }

      job.log(
        `Vendor compliance check complete: ${totalExpiring} expiring, ${totalMissing} missing BAAs, ${totalOverdue} overdue reviews`,
      );

      return { totalExpiring, totalMissing, totalOverdue };
    },
    {
      connection: createBullMQConnection(),
      concurrency: 1,
    },
  );

  worker.on("completed", (job, result) => {
    log.info({ jobId: job.id, result }, "vendor-compliance-check completed");
  });

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "vendor-compliance-check failed");
  });

  return worker;
}
