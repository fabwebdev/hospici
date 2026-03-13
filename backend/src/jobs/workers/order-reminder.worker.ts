// jobs/workers/order-reminder.worker.ts
// T3-9: Daily 09:00 UTC — sends reminders for unsigned pending orders.
// - Query PENDING_SIGNATURE orders where reminderCount < 3 AND
//   (lastReminderAt IS NULL OR lastReminderAt < now - 24h)
// - Increment reminderCount, set lastReminderAt = now, emit order:reminder

import { env } from "@/config/env.js";
import { createLoggingConfig } from "@/config/logging.config.js";
import { db } from "@/db/client.js";
import { orders } from "@/db/schema/orders.table.js";
import { complianceEvents } from "@/events/compliance-events.js";
import { Worker } from "bullmq";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import type Valkey from "iovalkey";
import pino from "pino";
import { QUEUE_NAMES, createBullMQConnection } from "../queue.js";

const log = pino(createLoggingConfig({ logLevel: env.logLevel, isDev: env.isDev }));

export function createOrderReminderWorker(_valkey?: Valkey) {
  const worker = new Worker(
    QUEUE_NAMES.ORDER_REMINDER,
    async (job) => {
      const now = new Date();
      const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      // Query PENDING_SIGNATURE orders eligible for reminder
      const eligibleOrders = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.status, "PENDING_SIGNATURE"),
            sql`${orders.reminderCount} < 3`,
            or(
              isNull(orders.lastReminderAt),
              lt(orders.lastReminderAt, twentyFourHoursAgo),
            ),
          ),
        );

      let reminderCount = 0;

      for (const order of eligibleOrders) {
        try {
          const newReminderCount = order.reminderCount + 1;

          await db
            .update(orders)
            .set({
              reminderCount: newReminderCount,
              lastReminderAt: now,
              updatedAt: now,
            })
            .where(eq(orders.id, order.id));

          complianceEvents.emit("order:reminder", {
            orderId: order.id,
            patientId: order.patientId,
            reminderCount: newReminderCount,
          });

          reminderCount++;
        } catch (err) {
          log.error({ orderId: order.id, err }, "Failed to send order reminder");
        }
      }

      job.log(`Order reminder check: ${reminderCount} reminders sent`);

      return { reminderCount };
    },
    {
      connection: createBullMQConnection(),
      concurrency: 1,
    },
  );

  worker.on("completed", (job, result) => {
    log.info({ jobId: job.id, result }, "order-reminder completed");
  });

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "order-reminder failed");
  });

  return worker;
}
