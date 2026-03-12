/**
 * HOPE Submission Worker
 *
 * Packages completed HOPE assessments and submits them to the iQIES REST API.
 * CMS rule: 2% Medicare payment reduction if HOPE submissions are missed.
 * 42 CFR §418.312 — Hospice Quality Reporting Requirements.
 *
 * Retry policy (per HOPE-DOC):
 *   - 3 attempts with exponential backoff starting at 2s
 *   - On final failure: adds to hope-submission-dlq + logs P1 alert
 *
 * TODO (T3-1): Load assessment from hope_assessments table.
 * TODO (T3-1): Package real iQIES XML per CMS spec.
 * TODO (T3-1): POST to iQIES REST API and store iqiesTrackingId.
 * TODO (T1-8): Emit Socket.IO alert after DLQ promotion.
 */

import { env } from "@/config/env.js";
import { createLoggingConfig } from "@/config/logging.config.js";
import type { Job } from "bullmq";
import { Worker } from "bullmq";
import pino from "pino";
import { createBullMQConnection, hopeSubmissionDlq, QUEUE_NAMES } from "../queue.js";

const log = pino(createLoggingConfig({ logLevel: env.logLevel, isDev: env.isDev }));

export type HopeSubmissionJobData = {
  assessmentId: string;
  locationId: string;
  assessmentType: "01" | "02" | "03";
};

export type HopeSubmissionJobResult = {
  assessmentId: string;
  submittedAt: string;
  iqiesTrackingId: string | null;
  status: "submitted";
};

/**
 * Pure handler — separated for testability.
 *
 * Packages the HOPE assessment as XML and submits to iQIES.
 * DB updates (status → "submitted", iqiesTrackingId) happen here once T3-1 is wired.
 */
export async function hopeSubmissionHandler(
  job: Job<HopeSubmissionJobData>,
): Promise<HopeSubmissionJobResult> {
  const { assessmentId, locationId, assessmentType } = job.data;

  log.info(
    { assessmentId, locationId, assessmentType, attempt: job.attemptsMade + 1 },
    "hope-submission: submitting to iQIES",
  );

  // TODO (T3-1): Load assessment from hope_assessments table
  // const assessment = await db.query.hopeAssessments.findFirst({
  //   where: eq(hopeAssessments.id, assessmentId),
  // });
  // if (!assessment) throw new Error(`Assessment ${assessmentId} not found`);

  // TODO (T3-1): Package assessment as XML per iQIES Data Submission Specifications
  // const xml = packageHOPEXml(assessment);

  // TODO (T3-1): POST to iQIES REST API
  // const response = await fetch(`${env.iqiesApiUrl}/submissions`, {
  //   method: "POST",
  //   headers: { "Content-Type": "application/xml", Authorization: `Bearer ${iqiesToken}` },
  //   body: xml,
  // });
  // if (!response.ok) throw new Error(`iQIES rejected: ${response.status}`);
  // const iqiesTrackingId = response.headers.get("X-iQIES-Tracking-ID");

  // TODO (T3-1): Update hope_assessments.status → "submitted", store iqiesTrackingId
  // await db.update(hopeAssessments)
  //   .set({ status: "submitted", iqiesSubmissionId: iqiesTrackingId, submittedAt: new Date() })
  //   .where(eq(hopeAssessments.id, assessmentId));

  log.info({ assessmentId }, "hope-submission: submitted (stub — T3-1 pending)");

  return {
    assessmentId,
    submittedAt: new Date().toISOString(),
    iqiesTrackingId: null, // TODO (T3-1)
    status: "submitted",
  };
}

/**
 * Returns true when all BullMQ retry attempts are exhausted.
 * Used to decide whether to promote a failed job to the DLQ.
 */
export function isAllAttemptsExhausted(attemptsMade: number, maxAttempts: number): boolean {
  return attemptsMade >= maxAttempts;
}

// ── Worker instance ───────────────────────────────────────────────────────────

export function createHopeSubmissionWorker(): Worker<
  HopeSubmissionJobData,
  HopeSubmissionJobResult
> {
  const worker = new Worker(QUEUE_NAMES.HOPE_SUBMISSION, hopeSubmissionHandler, {
    connection: createBullMQConnection(),
    concurrency: 2,
  });

  worker.on("completed", (job, result) => {
    log.info({ jobId: job.id, assessmentId: result.assessmentId }, "hope-submission completed");
  });

  worker.on("failed", async (job, err) => {
    if (!job) {
      log.error({ err }, "hope-submission: job reference lost on failure");
      return;
    }

    const maxAttempts = job.opts.attempts ?? 3;
    const exhausted = isAllAttemptsExhausted(job.attemptsMade, maxAttempts);

    log.error(
      { jobId: job.id, assessmentId: job.data.assessmentId, attempt: job.attemptsMade, maxAttempts, exhausted, err },
      "hope-submission failed",
    );

    if (exhausted) {
      // Promote to DLQ for ops review
      await hopeSubmissionDlq.add("dlq-entry", {
        originalJobId: job.id,
        assessmentId: job.data.assessmentId,
        locationId: job.data.locationId,
        assessmentType: job.data.assessmentType,
        failedAt: new Date().toISOString(),
        error: err.message,
      });

      // TODO (T1-8): Emit Socket.IO P1 alert to ops channel
      log.fatal(
        { assessmentId: job.data.assessmentId, locationId: job.data.locationId },
        "HOPE SUBMISSION DLQ ALERT — P1: iQIES submission exhausted all retries. Manual intervention required.",
      );
    }
  });

  return worker;
}
