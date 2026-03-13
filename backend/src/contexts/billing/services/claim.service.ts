/**
 * ClaimService — T3-7a
 *
 * State machine + CRUD for the claim lifecycle.
 * Emits Socket.IO events on every state transition via a module-level
 * event emitter that is wired in app.ts via setClaimEventEmitter().
 */

import { db } from "@/db/client.js";
import { billHolds, claimRevisions, claims } from "@/db/schema/claims.table.js";
import type {
  BillHoldInsert,
  BillHoldRow,
  ClaimRevisionInsert,
  ClaimRow,
} from "@/db/schema/claims.table.js";
import { createBullMQConnection } from "@/jobs/queue.js";
import { Queue } from "bullmq";
import { and, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type {
  ClaimListQuery,
  ClaimState,
  CreateClaimBody,
  HoldBody,
  ReplaceClaimBody,
} from "../schemas/claim.schema.js";
import { ClaimReadinessService } from "./claimReadiness.service.js";
import { X12Service } from "./x12.service.js";
import type { X12GeneratorInput } from "./x12.service.js";

// ── Socket.IO event emitter placeholder ──────────────────────────────────────
// In production this is wired to the Socket.IO server via claimEvents.
// Defined as a module-level object; wired in app.ts via setClaimEventEmitter().
type ClaimEventEmitter = {
  emit(event: string, data: unknown): void;
};
let _emitter: ClaimEventEmitter | null = null;
export function setClaimEventEmitter(e: ClaimEventEmitter): void {
  _emitter = e;
}
function emitEvent(event: string, data: unknown): void {
  _emitter?.emit(event, data);
}

// ── BullMQ claim submission queue (lazy-initialised) ──────────────────────────
let _submissionQueue: Queue | null = null;
function getSubmissionQueue(): Queue {
  if (!_submissionQueue) {
    _submissionQueue = new Queue("claim-submission", {
      connection: createBullMQConnection(),
      defaultJobOptions: {
        removeOnComplete: { count: 100 },
        removeOnFail: false,
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
      },
    });
  }
  return _submissionQueue;
}

// ── Valid state transition map ────────────────────────────────────────────────

const VALID_TRANSITIONS: Readonly<Record<ClaimState, readonly ClaimState[]>> = {
  DRAFT: ["NOT_READY", "READY_FOR_AUDIT"],
  NOT_READY: ["READY_FOR_AUDIT"],
  READY_FOR_AUDIT: ["AUDIT_FAILED", "READY_TO_SUBMIT"],
  AUDIT_FAILED: ["READY_FOR_AUDIT"],
  READY_TO_SUBMIT: ["QUEUED"],
  QUEUED: ["SUBMITTED"],
  SUBMITTED: ["ACCEPTED", "REJECTED"],
  ACCEPTED: ["PAID", "VOIDED"],
  REJECTED: ["DRAFT"],
  DENIED: ["VOIDED"],
  PAID: ["VOIDED"],
  VOIDED: [],
};

// ── Custom errors ─────────────────────────────────────────────────────────────

export class ClaimNotFoundError extends Error {
  constructor(id: string) {
    super(`Claim ${id} not found`);
    this.name = "ClaimNotFoundError";
  }
}

export class InvalidClaimTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Transition from ${from} to ${to} is not permitted`);
    this.name = "InvalidClaimTransitionError";
  }
}

export class ClaimAlreadyOnHoldError extends Error {
  constructor(id: string) {
    super(`Claim ${id} is already on hold`);
    this.name = "ClaimAlreadyOnHoldError";
  }
}

export class ClaimNotOnHoldError extends Error {
  constructor(id: string) {
    super(`Claim ${id} is not on hold`);
    this.name = "ClaimNotOnHoldError";
  }
}

export class ClaimNotReadyError extends Error {
  constructor(id: string, state: string) {
    super(`Claim ${id} cannot be queued: state is ${state}, expected READY_TO_SUBMIT`);
    this.name = "ClaimNotReadyError";
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

function assertTransitionAllowed(from: ClaimState, to: ClaimState): void {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed.includes(to)) {
    throw new InvalidClaimTransitionError(from, to);
  }
}

async function fetchClaimOrThrow(id: string, locationId: string): Promise<ClaimRow> {
  const rows = await db
    .select()
    .from(claims)
    .where(and(eq(claims.id, id), eq(claims.locationId, locationId)))
    .limit(1);

  const row = rows[0];
  if (!row) throw new ClaimNotFoundError(id);
  return row;
}

/**
 * Core transition: validates, writes claim + revision in a transaction,
 * emits the `claim:state:changed` event, returns the updated claim row.
 */
async function applyTransition(
  claim: ClaimRow,
  toState: ClaimState,
  userId: string,
  reason?: string,
): Promise<ClaimRow> {
  assertTransitionAllowed(claim.state as ClaimState, toState);

  const now = new Date();

  const updated = await db.transaction(async (tx) => {
    const revisionInsert: ClaimRevisionInsert = {
      claimId: claim.id,
      locationId: claim.locationId,
      fromState: claim.state,
      toState,
      reason: reason ?? null,
      snapshot: claim as unknown as Record<string, unknown>,
      transitionedBy: userId,
    };

    await tx.insert(claimRevisions).values(revisionInsert);

    const rows = await tx
      .update(claims)
      .set({ state: toState, updatedAt: now })
      .where(eq(claims.id, claim.id))
      .returning();

    const row = rows[0];
    if (!row) throw new ClaimNotFoundError(claim.id);
    return row;
  });

  emitEvent("claim:state:changed", {
    claimId: claim.id,
    fromState: claim.state,
    toState,
    patientId: claim.patientId,
    locationId: claim.locationId,
  });

  return updated;
}

// ── ClaimLine shape as stored in JSONB ───────────────────────────────────────

interface StoredClaimLine {
  revenueCode: string;
  hcpcsCode?: string | null;
  serviceDate: string;
  units: number;
  unitCharge: number;
  lineCharge: number;
  levelOfCare?: string | null;
}

function storedLinesToX12Lines(claimLines: unknown): X12GeneratorInput["lines"] {
  const lines = claimLines as StoredClaimLine[];
  return lines.map((l) => ({
    revenueCode: l.revenueCode,
    hcpcsCode: l.hcpcsCode ?? null,
    serviceDate: l.serviceDate,
    units: l.units,
    lineCharge: l.lineCharge,
  }));
}

// ── Public service ────────────────────────────────────────────────────────────

// biome-ignore lint/complexity/noStaticOnlyClass: service namespace pattern
export class ClaimService {
  // ── createClaim ─────────────────────────────────────────────────────────────

  static async createClaim(
    body: CreateClaimBody,
    userId: string,
    locationId: string,
    log: FastifyBaseLogger,
  ): Promise<ClaimRow> {
    // Compute total charge from claim lines
    const totalCharge = body.claimLines.reduce((sum, line) => sum + line.lineCharge, 0).toFixed(2);

    // Build a provisional claim row (not yet in DB) to run readiness checks
    const provisionalId = crypto.randomUUID();
    const now = new Date();
    const provisionalClaim: ClaimRow = {
      id: provisionalId,
      patientId: body.patientId,
      locationId,
      payerId: body.payerId,
      benefitPeriodId: body.benefitPeriodId ?? null,
      billType: "original",
      statementFromDate: body.statementFromDate,
      statementToDate: body.statementToDate,
      totalCharge,
      state: "DRAFT",
      isOnHold: false,
      correctedFromId: null,
      claimLines: body.claimLines,
      payloadHash: null,
      x12Hash: null,
      clearinghouseIcn: null,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    const readiness = await ClaimReadinessService.check(provisionalClaim);
    const initialState: ClaimState = readiness.ready ? "READY_FOR_AUDIT" : "NOT_READY";

    log.info(
      { claimId: provisionalId, initialState, blockers: readiness.blockers.length },
      "claim:create",
    );

    const inserted = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(claims)
        .values({
          id: provisionalId,
          patientId: body.patientId,
          locationId,
          payerId: body.payerId,
          benefitPeriodId: body.benefitPeriodId ?? null,
          billType: "original",
          statementFromDate: body.statementFromDate,
          statementToDate: body.statementToDate,
          totalCharge,
          state: initialState,
          claimLines: body.claimLines,
          createdBy: userId,
        })
        .returning();

      const claim = rows[0];
      if (!claim) throw new Error("Failed to insert claim");

      const revisionInsert: ClaimRevisionInsert = {
        claimId: claim.id,
        locationId,
        fromState: "DRAFT",
        toState: initialState,
        reason: "Initial creation",
        snapshot: {},
        transitionedBy: userId,
      };
      await tx.insert(claimRevisions).values(revisionInsert);

      return claim;
    });

    emitEvent("claim:state:changed", {
      claimId: inserted.id,
      fromState: "DRAFT",
      toState: initialState,
      patientId: inserted.patientId,
      locationId: inserted.locationId,
    });

    return inserted;
  }

  // ── getClaim ────────────────────────────────────────────────────────────────

  static async getClaim(id: string, locationId: string): Promise<ClaimRow | null> {
    const rows = await db
      .select()
      .from(claims)
      .where(and(eq(claims.id, id), eq(claims.locationId, locationId)))
      .limit(1);

    return rows[0] ?? null;
  }

  // ── listClaims ──────────────────────────────────────────────────────────────

  static async listClaims(
    query: ClaimListQuery,
    locationId: string,
  ): Promise<{ claims: ClaimRow[]; total: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const offset = (page - 1) * limit;

    const conditions = [eq(claims.locationId, locationId)];

    if (query.state !== undefined) {
      conditions.push(eq(claims.state, query.state));
    }
    if (query.payerId !== undefined) {
      conditions.push(eq(claims.payerId, query.payerId));
    }
    if (query.patientId !== undefined) {
      conditions.push(eq(claims.patientId, query.patientId));
    }
    if (query.benefitPeriodId !== undefined) {
      conditions.push(eq(claims.benefitPeriodId, query.benefitPeriodId));
    }
    if (query.isOnHold !== undefined) {
      conditions.push(eq(claims.isOnHold, query.isOnHold));
    }
    if (query.fromDate !== undefined) {
      conditions.push(gte(claims.statementFromDate, query.fromDate));
    }
    if (query.toDate !== undefined) {
      conditions.push(lte(claims.statementToDate, query.toDate));
    }

    const where = and(...conditions);

    const countRows = await db.select({ value: count() }).from(claims).where(where);
    const total = countRows[0]?.value ?? 0;

    const rows = await db
      .select()
      .from(claims)
      .where(where)
      .orderBy(desc(claims.createdAt))
      .limit(limit)
      .offset(offset);

    return { claims: rows, total };
  }

  // ── transitionState ─────────────────────────────────────────────────────────

  static async transitionState(
    claimId: string,
    toState: ClaimState,
    userId: string,
    locationId: string,
    reason?: string,
    log?: FastifyBaseLogger,
  ): Promise<ClaimRow> {
    const claim = await fetchClaimOrThrow(claimId, locationId);
    log?.info({ claimId, from: claim.state, to: toState }, "claim:transition");
    return applyTransition(claim, toState, userId, reason);
  }

  // ── holdClaim ───────────────────────────────────────────────────────────────

  static async holdClaim(
    claimId: string,
    body: HoldBody,
    userId: string,
    locationId: string,
  ): Promise<BillHoldRow> {
    const claim = await fetchClaimOrThrow(claimId, locationId);

    if (claim.isOnHold) {
      throw new ClaimAlreadyOnHoldError(claimId);
    }

    const holdInsert: BillHoldInsert = {
      claimId,
      locationId,
      reason: body.reason,
      holdNote: body.holdNote ?? null,
      placedBy: userId,
    };

    const hold = await db.transaction(async (tx) => {
      const holdRows = await tx.insert(billHolds).values(holdInsert).returning();
      const inserted = holdRows[0];
      if (!inserted) throw new Error("Failed to insert bill hold");

      await tx
        .update(claims)
        .set({ isOnHold: true, updatedAt: new Date() })
        .where(eq(claims.id, claimId));

      return inserted;
    });

    return hold;
  }

  // ── unholdClaim ─────────────────────────────────────────────────────────────

  static async unholdClaim(claimId: string, userId: string, locationId: string): Promise<void> {
    const claim = await fetchClaimOrThrow(claimId, locationId);

    if (!claim.isOnHold) {
      throw new ClaimNotOnHoldError(claimId);
    }

    const now = new Date();

    // Find the active (unreleased) hold for this claim
    const activeHoldRows = await db
      .select()
      .from(billHolds)
      .where(and(eq(billHolds.claimId, claimId), sql`${billHolds.releasedAt} IS NULL`))
      .orderBy(desc(billHolds.placedAt))
      .limit(1);

    const activeHold = activeHoldRows[0];

    await db.transaction(async (tx) => {
      if (activeHold) {
        await tx
          .update(billHolds)
          .set({ releasedBy: userId, releasedAt: now })
          .where(eq(billHolds.id, activeHold.id));
      }

      await tx
        .update(claims)
        .set({ isOnHold: false, updatedAt: now })
        .where(eq(claims.id, claimId));
    });
  }

  // ── generateAndAttachX12 ─────────────────────────────────────────────────────

  static async generateAndAttachX12(
    claimId: string,
    userId: string,
    locationId: string,
  ): Promise<ClaimRow> {
    // userId is reserved for audit logging in a future enhancement
    void userId;

    const claim = await fetchClaimOrThrow(claimId, locationId);

    // TODO(T3-7a enhancement): Decrypt PHI fields from the patients table.
    // For now we supply UNKNOWN placeholders so the X12 document is
    // structurally valid but not PHI-complete. Full decryption requires
    // the break-glass-aware PHI resolver which is gated on T3-7b.
    const x12Input: X12GeneratorInput = {
      claimId: claim.id,
      billType: claim.billType,
      statementFromDate: claim.statementFromDate,
      statementToDate: claim.statementToDate,
      totalCharge: claim.totalCharge,
      payerId: claim.payerId,
      lines: storedLinesToX12Lines(claim.claimLines),
      ...(claim.clearinghouseIcn ? { priorClaimIcn: claim.clearinghouseIcn } : {}),
    };

    const { payloadHash, x12Hash } = X12Service.generate(x12Input);

    const updatedRows = await db
      .update(claims)
      .set({ payloadHash, x12Hash, updatedAt: new Date() })
      .where(and(eq(claims.id, claimId), eq(claims.locationId, locationId)))
      .returning();

    const updated = updatedRows[0];
    if (!updated) throw new ClaimNotFoundError(claimId);
    return updated;
  }

  // ── queueSubmission ─────────────────────────────────────────────────────────

  static async queueSubmission(
    claimIds: string[],
    locationId: string,
    log: FastifyBaseLogger,
  ): Promise<{ queued: string[]; skipped: { claimId: string; reason: string }[] }> {
    const rows = await db
      .select()
      .from(claims)
      .where(and(eq(claims.locationId, locationId), inArray(claims.id, claimIds)));

    const rowMap = new Map<string, ClaimRow>(rows.map((r) => [r.id, r]));
    const queued: string[] = [];
    const skipped: { claimId: string; reason: string }[] = [];

    const queue = getSubmissionQueue();

    for (const id of claimIds) {
      const claim = rowMap.get(id);
      if (!claim) {
        skipped.push({ claimId: id, reason: "Claim not found" });
        continue;
      }
      if (claim.state !== "READY_TO_SUBMIT") {
        skipped.push({
          claimId: id,
          reason: `State is ${claim.state}, expected READY_TO_SUBMIT`,
        });
        continue;
      }

      try {
        await applyTransition(claim, "QUEUED", locationId, "Bulk submission queued");

        const job = await queue.add(
          "submit-claim",
          { claimId: id, locationId },
          { jobId: `claim-submit-${id}` },
        );

        log.info({ claimId: id, jobId: job.id }, "claim:queued");
        queued.push(id);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        log.error({ claimId: id, err }, "claim:queue:failed");
        emitEvent("claim:submission:failed", {
          claimId: id,
          jobId: null,
          error: message,
        });
        skipped.push({ claimId: id, reason: message });
      }
    }

    return { queued, skipped };
  }

  // ── replaceClaim ─────────────────────────────────────────────────────────────

  static async replaceClaim(
    claimId: string,
    body: ReplaceClaimBody,
    userId: string,
    locationId: string,
    log: FastifyBaseLogger,
  ): Promise<ClaimRow> {
    const original = await fetchClaimOrThrow(claimId, locationId);

    // Void the original claim first
    await applyTransition(original, "VOIDED", userId, `Replaced: ${body.replacementReason}`);

    const claimLines = body.claimLines ?? (original.claimLines as ReplaceClaimBody["claimLines"]);
    const lines = claimLines ?? [];
    const totalCharge = (lines as Array<{ lineCharge: number }>)
      .reduce((sum, l) => sum + l.lineCharge, 0)
      .toFixed(2);

    // Build provisional replacement to check readiness
    const provisionalReplacement: ClaimRow = {
      ...original,
      id: crypto.randomUUID(),
      payerId: body.payerId ?? original.payerId,
      statementFromDate: body.statementFromDate ?? original.statementFromDate,
      statementToDate: body.statementToDate ?? original.statementToDate,
      totalCharge,
      claimLines: claimLines ?? original.claimLines,
      isOnHold: false,
      state: "DRAFT",
    };

    const readiness = await ClaimReadinessService.check(provisionalReplacement);
    const initialState: ClaimState = readiness.ready ? "READY_FOR_AUDIT" : "NOT_READY";

    log.info({ originalClaimId: claimId, initialState }, "claim:replace");

    const replacement = await db.transaction(async (tx) => {
      const rows = await tx
        .insert(claims)
        .values({
          id: provisionalReplacement.id,
          patientId: original.patientId,
          locationId,
          payerId: body.payerId ?? original.payerId,
          benefitPeriodId: original.benefitPeriodId,
          billType: "replacement",
          statementFromDate: body.statementFromDate ?? original.statementFromDate,
          statementToDate: body.statementToDate ?? original.statementToDate,
          totalCharge,
          state: initialState,
          correctedFromId: original.id,
          claimLines: claimLines ?? original.claimLines,
          createdBy: userId,
        })
        .returning();

      const claim = rows[0];
      if (!claim) throw new Error("Failed to insert replacement claim");

      const revisionInsert: ClaimRevisionInsert = {
        claimId: claim.id,
        locationId,
        fromState: "DRAFT",
        toState: initialState,
        reason: `Replacement for claim ${original.id}: ${body.replacementReason}`,
        snapshot: {},
        transitionedBy: userId,
      };
      await tx.insert(claimRevisions).values(revisionInsert);

      return claim;
    });

    emitEvent("claim:state:changed", {
      claimId: replacement.id,
      fromState: "DRAFT",
      toState: initialState,
      patientId: replacement.patientId,
      locationId: replacement.locationId,
    });

    return replacement;
  }

  // ── voidClaim ────────────────────────────────────────────────────────────────

  static async voidClaim(
    claimId: string,
    userId: string,
    locationId: string,
    reason: string,
  ): Promise<ClaimRow> {
    const claim = await fetchClaimOrThrow(claimId, locationId);
    return applyTransition(claim, "VOIDED", userId, reason);
  }

  // ── retryRejectedClaim ────────────────────────────────────────────────────────

  static async retryRejectedClaim(
    claimId: string,
    userId: string,
    locationId: string,
    log: FastifyBaseLogger,
  ): Promise<ClaimRow> {
    const claim = await fetchClaimOrThrow(claimId, locationId);

    if (claim.state !== "REJECTED") {
      throw new InvalidClaimTransitionError(claim.state, "DRAFT");
    }

    // REJECTED → DRAFT per the state machine
    const draft = await applyTransition(claim, "DRAFT", userId, "Retry after rejection");

    // Re-run readiness check and advance to initial computed state
    const readiness = await ClaimReadinessService.check(draft);
    const nextState: ClaimState = readiness.ready ? "READY_FOR_AUDIT" : "NOT_READY";

    log.info({ claimId, nextState, blockers: readiness.blockers.length }, "claim:retry");

    return applyTransition(draft, nextState, userId, "Readiness re-evaluated after retry");
  }
}
