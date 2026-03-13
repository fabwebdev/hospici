/**
 * Claim Submission Worker — T3-7a
 *
 * Processes jobs from the `claim-submission` queue.
 * Each job represents a single claim to be transmitted to the clearinghouse.
 *
 * On success: transitions claim → SUBMITTED, records ClaimSubmission row.
 * On DLQ promotion (exhausted retries): transitions claim → REJECTED,
 *   emits Socket.IO `claim:submission:failed` event.
 *
 * Queue config: 3 retries, exponential backoff starting at 2s.
 */

import { env } from "@/config/env.js";
import { createLoggingConfig } from "@/config/logging.config.js";
import { db } from "@/db/client.js";
import { claimSubmissions, claims } from "@/db/schema/claims.table.js";
import type { Job } from "bullmq";
import { Worker } from "bullmq";
import { and, eq, sql } from "drizzle-orm";
import type Valkey from "iovalkey";
import pino from "pino";
import { QUEUE_NAMES, createBullMQConnection } from "../queue.js";

const log = pino(createLoggingConfig({ logLevel: env.logLevel, isDev: env.isDev }));

export type ClaimSubmissionJobData = {
  claimId: string;
  locationId: string;
  userId: string;
};

export type ClaimSubmissionJobResult = {
  claimId: string;
  submissionId: string;
  responseCode: string | null;
  submittedAt: string;
};

// ── Socket.IO emitter (injected from app.ts) ───────────────────────────────────

type EventEmitter = { emit(event: string, data: unknown): void };
let _emitter: EventEmitter | null = null;

export function setClaimSubmissionEventEmitter(e: EventEmitter): void {
  _emitter = e;
}

// ── Clearinghouse stub ─────────────────────────────────────────────────────────
// TODO(T3-7a): replace with real clearinghouse HTTP call (Availity / Change Healthcare).
// Returns a simulated accepted response.

async function submitToClearinghouse(
  claimId: string,
  _locationId: string,
): Promise<{ batchId: string; responseCode: string; responseMessage: string }> {
  // Stub: in production, POST the 837i to the clearinghouse REST API.
  // Batch ID and ICN would come from the clearinghouse 999 acknowledgment.
  await Promise.resolve(); // satisfy async
  return {
    batchId: `BATCH-${Date.now()}`,
    responseCode: "000", // 000 = accepted
    responseMessage: "Claim accepted (stub — clearinghouse integration pending)",
  };
}

// ── Job handler ────────────────────────────────────────────────────────────────

export async function claimSubmissionHandler(
  job: Job<ClaimSubmissionJobData>,
): Promise<ClaimSubmissionJobResult> {
  const { claimId, locationId, userId } = job.data;

  log.info(
    { claimId, jobId: job.id, attempt: job.attemptsMade + 1 },
    "Processing claim submission",
  );

  // Inject RLS context (worker runs outside HTTP context)
  await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
  await db.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);

  // Verify claim exists and is QUEUED
  const claimRows = await db
    .select()
    .from(claims)
    .where(and(eq(claims.id, claimId), eq(claims.locationId, locationId)))
    .limit(1);

  const claim = claimRows[0];
  if (!claim) {
    throw new Error(`Claim ${claimId} not found or not accessible`);
  }

  if (claim.state !== "QUEUED") {
    log.warn({ claimId, state: claim.state }, "Claim is not QUEUED — skipping submission");
    // Return a no-op result rather than throwing, so the job doesn't retry
    return {
      claimId,
      submissionId: "noop",
      responseCode: null,
      submittedAt: new Date().toISOString(),
    };
  }

  // Submit to clearinghouse
  const response = await submitToClearinghouse(claimId, locationId);

  // Record the submission attempt + transition to SUBMITTED in a transaction
  const submissionId = await db.transaction(async (tx) => {
    const [submissionRow] = await tx
      .insert(claimSubmissions)
      .values({
        claimId,
        locationId,
        batchId: response.batchId,
        responseCode: response.responseCode,
        responseMessage: response.responseMessage,
        submittedAt: new Date(),
        responseReceivedAt: new Date(),
        jobId: job.id ?? null,
        attemptNumber: job.attemptsMade + 1,
      })
      .returning({ id: claimSubmissions.id });

    await tx
      .update(claims)
      .set({ state: "SUBMITTED", updatedAt: new Date() })
      .where(eq(claims.id, claimId));

    return submissionRow?.id ?? "unknown";
  });

  _emitter?.emit("claim:state:changed", {
    claimId,
    fromState: "QUEUED",
    toState: "SUBMITTED",
    locationId,
  });

  log.info({ claimId, submissionId, batchId: response.batchId }, "Claim submitted successfully");

  return {
    claimId,
    submissionId,
    responseCode: response.responseCode,
    submittedAt: new Date().toISOString(),
  };
}

// ── DLQ handler ────────────────────────────────────────────────────────────────

async function handleDlq(
  claimId: string,
  locationId: string,
  userId: string,
  error: string,
): Promise<void> {
  try {
    await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    await db.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);

    await db
      .update(claims)
      .set({ state: "REJECTED", updatedAt: new Date() })
      .where(and(eq(claims.id, claimId), eq(claims.locationId, locationId)));

    _emitter?.emit("claim:submission:failed", {
      claimId,
      error,
      locationId,
    });

    log.error({ claimId, error }, "Claim submission moved to DLQ — claim transitioned to REJECTED");
  } catch (dlqErr) {
    log.error({ claimId, dlqErr }, "Failed to handle DLQ transition");
  }
}

// ── Worker factory ─────────────────────────────────────────────────────────────

export function createClaimSubmissionWorker(
  _valkey?: Valkey,
): Worker<ClaimSubmissionJobData, ClaimSubmissionJobResult> {
  const worker = new Worker<ClaimSubmissionJobData, ClaimSubmissionJobResult>(
    QUEUE_NAMES.CLAIM_SUBMISSION,
    claimSubmissionHandler,
    {
      connection: createBullMQConnection(),
      concurrency: 5,
      limiter: { max: 10, duration: 1000 }, // 10 submissions/sec max
    },
  );

  worker.on("failed", async (job, err) => {
    if (!job) return;
    const isExhausted = (job.attemptsMade ?? 0) >= 3;
    if (isExhausted) {
      const { claimId, locationId, userId } = job.data;
      await handleDlq(claimId, locationId, userId, err.message);
    } else {
      log.warn(
        { claimId: job.data.claimId, attempt: job.attemptsMade, err: err.message },
        "Claim submission failed — will retry",
      );
    }
  });

  worker.on("error", (err) => {
    log.error({ err }, "Claim submission worker error");
  });

  return worker;
}
