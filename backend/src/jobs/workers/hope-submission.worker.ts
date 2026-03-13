/**
 * HOPE Submission Worker (T3-1a)
 *
 * Packages completed HOPE assessments and submits them to the iQIES REST API.
 * CMS rule: 2% Medicare payment reduction if HOPE submissions are missed.
 * 42 CFR §418.312 — Hospice Quality Reporting Requirements.
 *
 * Retry policy (per HOPE-DOC):
 *   - 3 attempts with exponential backoff starting at 2s
 *   - On final failure: adds to hope-submission-dlq + logs P1 alert
 *     + emits hope:submission:rejected Socket.IO event
 *
 * payloadHash: SHA-256 of the submitted JSON payload (iQIES XML packaging is
 * a stub — real XML serialisation requires iQIES Data Submission Spec v1.00).
 */

import { env } from "@/config/env.js";
import { createLoggingConfig } from "@/config/logging.config.js";
import { sha256 } from "@/contexts/analytics/services/hope.service.js";
import { db } from "@/db/client.js";
import { hopeAssessments } from "@/db/schema/hope-assessments.table.js";
import { hopeIqiesSubmissions } from "@/db/schema/hope-iqies-submissions.table.js";
import { complianceEvents } from "@/events/compliance-events.js";
import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { and, eq, max } from "drizzle-orm";
import pino from "pino";
import { QUEUE_NAMES, createBullMQConnection, hopeSubmissionDlq } from "../queue.js";

const log = pino(createLoggingConfig({ logLevel: env.logLevel, isDev: env.isDev }));

export type HopeSubmissionJobData = {
  assessmentId: string;
  locationId: string;
  assessmentType: "01" | "02" | "03";
  submittedByUserId?: string;
};

export type HopeSubmissionJobResult = {
  assessmentId: string;
  submissionId: string;
  submittedAt: string;
  iqiesTrackingId: string | null;
  status: "submitted";
};

/**
 * Pure handler — separated for testability.
 *
 * Loads the assessment, computes payloadHash, records submission row,
 * calls iQIES API (stub — real implementation pending sandbox credentials),
 * updates assessment status to "submitted".
 */
export async function hopeSubmissionHandler(
  job: Job<HopeSubmissionJobData>,
): Promise<HopeSubmissionJobResult> {
  const { assessmentId, locationId, assessmentType, submittedByUserId } = job.data;

  log.info(
    { assessmentId, locationId, assessmentType, attempt: job.attemptsMade + 1 },
    "hope-submission: submitting to iQIES",
  );

  // Load assessment from DB
  const [assessment] = await db
    .select()
    .from(hopeAssessments)
    .where(and(eq(hopeAssessments.id, assessmentId), eq(hopeAssessments.locationId, locationId)))
    .limit(1);

  if (!assessment) {
    throw new Error(`Assessment ${assessmentId} not found for iQIES submission`);
  }

  // Compute attempt number
  const maxAttemptRow = await db
    .select({ maxAttempt: max(hopeIqiesSubmissions.attemptNumber) })
    .from(hopeIqiesSubmissions)
    .where(eq(hopeIqiesSubmissions.assessmentId, assessmentId))
    .then((rows) => rows[0]);

  const attemptNumber = (maxAttemptRow?.maxAttempt ?? 0) + 1;

  // Compute SHA-256 of the full assessment data payload
  // In production: hash the serialized iQIES XML. Stub: hash JSON.
  const payloadForHash = JSON.stringify({
    assessmentId,
    assessmentType,
    assessmentDate: assessment.assessmentDate,
    electionDate: assessment.electionDate,
    data: assessment.data,
    submittedAt: new Date().toISOString(),
  });
  const payloadHash = sha256(payloadForHash);

  // --- iQIES API call (STUB — requires real sandbox credentials) ---------------
  // When iQIES sandbox credentials are available (see MASTER_PROMPT.md ⚡ actions):
  //
  // const xml = packageHOPEXml(assessment);
  // const response = await fetch(`${env.iqiesApiUrl}/submissions`, {
  //   method: "POST",
  //   headers: {
  //     "Content-Type": "application/xml",
  //     Authorization: `Bearer ${iqiesToken}`,
  //   },
  //   body: xml,
  // });
  // if (!response.ok) throw new Error(`iQIES rejected: HTTP ${response.status}`);
  // const iqiesTrackingId = response.headers.get("X-iQIES-Tracking-ID");
  // const status = iqiesTrackingId ? "accepted" : "pending";
  // ────────────────────────────────────────────────────────────────────────────

  const iqiesTrackingId: string | null = null; // stub until sandbox wired
  const submissionStatus = "pending" as const; // will flip to accepted/rejected via webhook

  // Record submission in DB
  const [submissionRow] = await db
    .insert(hopeIqiesSubmissions)
    .values({
      assessmentId,
      locationId,
      attemptNumber,
      submittedByUserId: submittedByUserId ?? null,
      submissionStatus,
      correctionType: "none",
      payloadHash,
    })
    .returning();

  if (!submissionRow) throw new Error("Failed to insert submission row");

  // Update assessment status → submitted
  await db
    .update(hopeAssessments)
    .set({ status: "submitted", updatedAt: new Date() })
    .where(eq(hopeAssessments.id, assessmentId));

  log.info(
    { assessmentId, submissionId: submissionRow.id, payloadHash, attempt: attemptNumber },
    "hope-submission: submitted",
  );

  return {
    assessmentId,
    submissionId: submissionRow.id,
    submittedAt: submissionRow.submittedAt.toISOString(),
    iqiesTrackingId,
    status: "submitted",
  };
}

/**
 * Returns true when all BullMQ retry attempts are exhausted.
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
    log.info(
      { jobId: job.id, assessmentId: result.assessmentId, submissionId: result.submissionId },
      "hope-submission completed",
    );
  });

  worker.on("failed", async (job, err) => {
    if (!job) {
      log.error({ err }, "hope-submission: job reference lost on failure");
      return;
    }

    const maxAttempts = job.opts.attempts ?? 3;
    const exhausted = isAllAttemptsExhausted(job.attemptsMade, maxAttempts);

    log.error(
      {
        jobId: job.id,
        assessmentId: job.data.assessmentId,
        attempt: job.attemptsMade,
        maxAttempts,
        exhausted,
        err,
      },
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

      // Mark assessment as needs_correction in DB
      try {
        await db
          .update(hopeAssessments)
          .set({ status: "needs_correction", updatedAt: new Date() })
          .where(eq(hopeAssessments.id, job.data.assessmentId));
      } catch (dbErr) {
        log.error({ dbErr }, "hope-submission: failed to update status after DLQ");
      }

      // Emit Socket.IO rejection event
      complianceEvents.emit("hope:submission:rejected", {
        assessmentId: job.data.assessmentId,
        submissionId: job.id ?? "unknown",
        patientId: "unknown", // patientId not in job data — fetched in monitor if needed
        rejectionCodes: ["DLQ_EXHAUSTED"],
        rejectionDetails: `iQIES submission exhausted all ${maxAttempts} retries: ${err.message}`,
      });

      log.fatal(
        { assessmentId: job.data.assessmentId, locationId: job.data.locationId },
        "HOPE SUBMISSION DLQ ALERT — P1: iQIES submission exhausted all retries. Manual intervention required.",
      );
    }
  });

  return worker;
}
