/**
 * Note Review Deadline Worker
 *
 * Runs daily at 06:30 UTC. Checks for encounters where:
 *   - review_status IN ('PENDING', 'IN_REVIEW', 'RESUBMITTED')
 *   - due_by < now()
 *
 * Emits NOTE_OVERDUE_REVIEW compliance alert for each overdue encounter.
 * Also emits `review:overdue` Socket.IO event to the location room.
 */

import { env } from "@/config/env.js";
import { createLoggingConfig } from "@/config/logging.config.js";
import { AlertService } from "@/contexts/compliance/services/alert.service.js";
import { NoteReviewService } from "@/contexts/clinical/services/noteReview.service.js";
import { complianceEvents } from "@/events/compliance-events.js";
import type { Job } from "bullmq";
import { Worker } from "bullmq";
import type Valkey from "iovalkey";
import pino from "pino";
import { QUEUE_NAMES, createBullMQConnection } from "../queue.js";

const log = pino(createLoggingConfig({ logLevel: env.logLevel, isDev: env.isDev }));

export type NoteReviewDeadlineJobResult = {
  checkedAt: string;
  overdueCount: number;
};

let noteReviewService: NoteReviewService | null = null;

export function setNoteReviewService(svc: NoteReviewService): void {
  noteReviewService = svc;
}

/**
 * Pure handler — separated for testability.
 */
export async function noteReviewDeadlineHandler(
  _job: Job,
): Promise<NoteReviewDeadlineJobResult> {
  if (!noteReviewService) {
    log.warn("NoteReviewService not set — skipping note-review-deadline check");
    return { checkedAt: new Date().toISOString(), overdueCount: 0 };
  }

  const result = await noteReviewService.checkOverdueReviews();

  if (result.overdueCount > 0) {
    log.info(
      { overdueCount: result.overdueCount },
      "note-review-deadline: overdue reviews found, alerts upserted",
    );

    // Emit to compliance event bus — Socket.IO handler picks this up in socket.plugin.ts
    complianceEvents.emit("review:overdue", {
      overdueCount: result.overdueCount,
      checkedAt: result.checkedAt,
    });
  }

  return result;
}

export function createNoteReviewDeadlineWorker(valkey: Valkey): Worker {
  const alertService = new AlertService(valkey);
  const svc = new NoteReviewService(valkey, alertService);
  setNoteReviewService(svc);

  const worker = new Worker(
    QUEUE_NAMES.NOTE_REVIEW_DEADLINE_CHECK,
    noteReviewDeadlineHandler,
    {
      connection: createBullMQConnection(),
      concurrency: 1,
    },
  );

  worker.on("completed", (job, result: NoteReviewDeadlineJobResult) => {
    log.info(
      { jobId: job.id, overdueCount: result.overdueCount },
      "note-review-deadline-check completed",
    );
  });

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "note-review-deadline-check failed");
  });

  return worker;
}
