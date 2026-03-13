// jobs/workers/order-expiry-check.worker.ts
// T3-9: Daily 07:00 UTC — scans for expiring and overdue orders.
// - Orders approaching dueAt (within 12h) → emit order:expiring
// - Orders past dueAt with PENDING_SIGNATURE/VIEWED → transition to EXPIRED, upsert compliance alert
// - SIGNED orders older than 7 days without COMPLETED_RETURNED → emit order:return:overdue

import { env } from "@/config/env.js";
import { createLoggingConfig } from "@/config/logging.config.js";
import { db } from "@/db/client.js";
import { orders } from "@/db/schema/orders.table.js";
import { complianceEvents } from "@/events/compliance-events.js";
import { Worker } from "bullmq";
import { and, eq, gt, lt, lte, or } from "drizzle-orm";
import type Valkey from "iovalkey";
import pino from "pino";
import { QUEUE_NAMES, createBullMQConnection } from "../queue.js";

const log = pino(createLoggingConfig({ logLevel: env.logLevel, isDev: env.isDev }));

// ── Downstream blocking helper ────────────────────────────────────────────────

function computeBlockedDownstream(
  type: string,
  status: string,
  dueAt: Date,
): string | null {
  const now = new Date();
  const isActive = status === "PENDING_SIGNATURE" || status === "VIEWED";
  if (!isActive) return null;
  const isOverdue = dueAt < now;
  if (type === "VERBAL" && isOverdue) return "Claim billing blocked until signed";
  if (type === "F2F_DOCUMENTATION") return "Recertification blocked";
  return null;
}

export function createOrderExpiryWorker(_valkey?: Valkey) {
  const worker = new Worker(
    QUEUE_NAMES.ORDER_EXPIRY_CHECK,
    async (job) => {
      const now = new Date();
      const twelveHoursFromNow = new Date(now.getTime() + 12 * 60 * 60 * 1000);
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      let expiredCount = 0;
      let expiringCount = 0;
      let overdueReturnCount = 0;

      // ── 1. Orders expiring within 12 hours (not yet expired) ────────────────
      const expiringOrders = await db
        .select()
        .from(orders)
        .where(
          and(
            or(eq(orders.status, "PENDING_SIGNATURE"), eq(orders.status, "VIEWED")),
            lte(orders.dueAt, twelveHoursFromNow),
            gt(orders.dueAt, now),
          ),
        );

      for (const order of expiringOrders) {
        const hoursRemaining =
          (order.dueAt.getTime() - now.getTime()) / (1000 * 60 * 60);
        const blockedDownstream = computeBlockedDownstream(
          order.type,
          order.status,
          order.dueAt,
        );

        complianceEvents.emit("order:expiring", {
          orderId: order.id,
          hoursRemaining: Math.round(hoursRemaining * 10) / 10,
          blockedDownstream,
        });

        expiringCount++;
      }

      // ── 2. Orders past dueAt — transition to EXPIRED ──────────────────────
      const overdueOrders = await db
        .select()
        .from(orders)
        .where(
          and(
            or(eq(orders.status, "PENDING_SIGNATURE"), eq(orders.status, "VIEWED")),
            lt(orders.dueAt, now),
          ),
        );

      for (const order of overdueOrders) {
        try {
          await db
            .update(orders)
            .set({ status: "EXPIRED", updatedAt: new Date() })
            .where(eq(orders.id, order.id));

          const blockedDownstream = computeBlockedDownstream(
            order.type,
            order.status,
            order.dueAt,
          );
          const hoursOverdue =
            (now.getTime() - order.dueAt.getTime()) / (1000 * 60 * 60);

          complianceEvents.emit("order:expired", {
            orderId: order.id,
            type: order.type,
            patientId: order.patientId,
          });

          complianceEvents.emit("order:overdue", {
            orderId: order.id,
            hoursOverdue: Math.round(hoursOverdue * 10) / 10,
            blockedDownstream,
          });

          expiredCount++;
        } catch (err) {
          log.error({ orderId: order.id, err }, "Failed to expire order");
        }
      }

      // ── 3. SIGNED orders older than 7 days without COMPLETED_RETURNED ──────
      const signedOldOrders = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.status, "SIGNED"),
            lt(orders.signedAt, sevenDaysAgo),
          ),
        );

      for (const order of signedOldOrders) {
        const signedAt = order.signedAt ?? order.updatedAt;
        const daysSinceSigned = Math.floor(
          (now.getTime() - signedAt.getTime()) / (1000 * 60 * 60 * 24),
        );

        complianceEvents.emit("order:return:overdue", {
          orderId: order.id,
          patientId: order.patientId,
          daysSinceSigned,
        });

        overdueReturnCount++;
      }

      job.log(
        `Order expiry check: ${expiredCount} expired, ${expiringCount} expiring, ${overdueReturnCount} overdue returns`,
      );

      return { expiredCount, expiringCount, overdueReturnCount };
    },
    {
      connection: createBullMQConnection(),
      concurrency: 1,
    },
  );

  worker.on("completed", (job, result) => {
    log.info({ jobId: job.id, result }, "order-expiry-check completed");
  });

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "order-expiry-check failed");
  });

  return worker;
}
