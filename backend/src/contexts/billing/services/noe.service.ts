/**
 * NOEService — Notice of Election / Notice of Termination or Revocation workflow.
 *
 * T3-2a: NOE/NOTR Filing Workbench
 *
 * CMS rules implemented:
 *   - NOE: 5 business days from election date (42 CFR §418.21)
 *   - NOTR: 5 business days from revocation date
 *   - State machine with 9 statuses; invalid transitions throw InvalidFilingTransitionError
 *   - Late override requires supervisor or admin role
 *   - correctNOE / correctNOTR wrap in db.transaction() — voids old, creates new
 *   - autoCreateNOTROnRevocation wraps in db.transaction() — closes NOE, creates NOTR draft
 *   - All mutations emit audit log entries
 *   - RLS context injected via parameterized sql tag (never string interpolation)
 */

import type { AlertService } from "@/contexts/compliance/services/alert.service.js";
import { logAudit } from "@/contexts/identity/services/audit.service.js";
import { db } from "@/db/client.js";
import { noticesOfElection } from "@/db/schema/noe.table.js";
import { noticesOfTerminationRevocation } from "@/db/schema/notr.table.js";
import { complianceEvents } from "@/events/compliance-events.js";
import { addBusinessDays } from "@/utils/business-days.js";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type Valkey from "iovalkey";
import type {
  CMSResponseBody,
  CorrectNOEBody,
  CreateNOEBody,
  CreateNOTRBody,
  FilingHistoryEvent,
  FilingHistoryResponse,
  FilingQueueQuery,
  FilingQueueResponse,
  LateOverrideBody,
  NOEResponse,
  NOEWithHistoryResponse,
  NOTRResponse,
  ReadinessResponse,
} from "../schemas/noe.schema.js";

// ── Custom errors ──────────────────────────────────────────────────────────────

export class InvalidFilingTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot transition filing status from '${from}' to '${to}'`);
    this.name = "InvalidFilingTransitionError";
  }
}

export class NOENotFoundError extends Error {
  constructor(id: string) {
    super(`Notice of Election ${id} not found`);
    this.name = "NOENotFoundError";
  }
}

export class NOTRNotFoundError extends Error {
  constructor(id: string) {
    super(`Notice of Termination/Revocation ${id} not found`);
    this.name = "NOTRNotFoundError";
  }
}

export class FilingAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FilingAuthorizationError";
  }
}

// ── State machine ──────────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  draft: ["ready_for_submission", "voided"],
  ready_for_submission: ["submitted", "voided"],
  submitted: ["accepted", "rejected", "late_pending_override", "voided"],
  rejected: ["needs_correction", "voided"],
  needs_correction: ["ready_for_submission", "voided"],
  late_pending_override: ["submitted", "voided"],
  accepted: ["closed"],
  closed: [],
  voided: [],
};

function assertValidTransition(from: string, to: string): void {
  const allowed = VALID_TRANSITIONS[from];
  if (!allowed || !allowed.includes(to)) {
    throw new InvalidFilingTransitionError(from, to);
  }
}

// ── RLS helper ─────────────────────────────────────────────────────────────────

type RlsCtx = { execute: (typeof db)["execute"] };

async function applyRlsContext(tx: RlsCtx, locationId: string, userId: string): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);
}

// ── Row mappers ────────────────────────────────────────────────────────────────

function noeRowToResponse(row: typeof noticesOfElection.$inferSelect): NOEResponse {
  return {
    id: row.id,
    patientId: row.patientId,
    locationId: row.locationId,
    status: row.status as NOEResponse["status"],
    electionDate: row.electionDate,
    deadlineDate: row.deadlineDate,
    isLate: row.isLate,
    lateReason: row.lateReason ?? null,
    overrideApprovedBy: row.overrideApprovedBy ?? null,
    overrideApprovedAt: row.overrideApprovedAt?.toISOString() ?? null,
    overrideReason: row.overrideReason ?? null,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    submittedByUserId: row.submittedByUserId ?? null,
    responseCode: row.responseCode ?? null,
    responseMessage: row.responseMessage ?? null,
    attemptCount: row.attemptCount,
    correctedFromId: row.correctedFromId ?? null,
    isClaimBlocking: row.isClaimBlocking,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function notrRowToResponse(row: typeof noticesOfTerminationRevocation.$inferSelect): NOTRResponse {
  return {
    id: row.id,
    noeId: row.noeId,
    patientId: row.patientId,
    locationId: row.locationId,
    status: row.status as NOTRResponse["status"],
    revocationDate: row.revocationDate,
    revocationReason: row.revocationReason,
    deadlineDate: row.deadlineDate,
    isLate: row.isLate,
    lateReason: row.lateReason ?? null,
    overrideApprovedBy: row.overrideApprovedBy ?? null,
    overrideApprovedAt: row.overrideApprovedAt?.toISOString() ?? null,
    overrideReason: row.overrideReason ?? null,
    receivingHospiceId: row.receivingHospiceId ?? null,
    receivingHospiceName: row.receivingHospiceName ?? null,
    transferDate: row.transferDate ?? null,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    submittedByUserId: row.submittedByUserId ?? null,
    responseCode: row.responseCode ?? null,
    responseMessage: row.responseMessage ?? null,
    attemptCount: row.attemptCount,
    correctedFromId: row.correctedFromId ?? null,
    isClaimBlocking: row.isClaimBlocking,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── Utility ────────────────────────────────────────────────────────────────────

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

// ── Service ────────────────────────────────────────────────────────────────────

export class NOEService {
  constructor(
    private readonly valkey: Valkey,
    private readonly log: FastifyBaseLogger,
    private readonly alertService: AlertService,
  ) {}

  // ── NOE methods ──────────────────────────────────────────────────────────────

  /**
   * Create a new NOE in draft status.
   * deadlineDate = electionDate + 5 business days (42 CFR §418.21).
   */
  async createNOE(
    patientId: string,
    locationId: string,
    userId: string,
    body: CreateNOEBody,
  ): Promise<NOEResponse> {
    const electionDate = new Date(body.electionDate);
    const deadlineDate = addBusinessDays(electionDate, 5);
    const deadlineDateStr = deadlineDate.toISOString().slice(0, 10);

    const row = await db.transaction(async (tx) => {
      await applyRlsContext(tx, locationId, userId);

      const [inserted] = await tx
        .insert(noticesOfElection)
        .values({
          patientId,
          locationId,
          electionDate: body.electionDate,
          deadlineDate: deadlineDateStr,
          status: "draft",
        })
        .returning();

      return inserted;
    });

    if (!row) {
      throw new Error("Failed to create NOE");
    }

    await logAudit("create", userId, patientId, {
      userRole: "clinician",
      locationId,
      resourceType: "notice_of_election",
      resourceId: row.id,
      details: { electionDate: body.electionDate, deadlineDate: deadlineDateStr },
    });

    this.log.info({ noeId: row.id, patientId, locationId }, "NOE created");
    return noeRowToResponse(row);
  }

  /**
   * Get the most recent active NOE for a patient, plus synthetic history.
   */
  async getNOE(
    patientId: string,
    locationId: string,
    userId: string,
  ): Promise<NOEWithHistoryResponse> {
    const rows = await db.transaction(async (tx) => {
      await applyRlsContext(tx, locationId, userId);
      return tx
        .select()
        .from(noticesOfElection)
        .where(
          and(
            eq(noticesOfElection.patientId, patientId),
            eq(noticesOfElection.locationId, locationId),
          ),
        )
        .orderBy(noticesOfElection.createdAt);
    });

    if (rows.length === 0) {
      throw new NOENotFoundError(patientId);
    }

    // Most recent non-voided, or last if all voided
    const active =
      rows.find((r) => r.status !== "voided" && r.status !== "closed") ?? rows[rows.length - 1];

    if (!active) {
      throw new NOENotFoundError(patientId);
    }

    await logAudit("view", userId, patientId, {
      userRole: "clinician",
      locationId,
      resourceType: "notice_of_election",
      resourceId: active.id,
    });

    const history: FilingHistoryEvent[] = rows.map((r) => ({
      event: r.correctedFromId ? "correction" : "created",
      timestamp: r.createdAt.toISOString(),
      userId: r.submittedByUserId ?? null,
      details: { status: r.status, attemptCount: r.attemptCount },
    }));

    return { noe: noeRowToResponse(active), history };
  }

  /**
   * Transition NOE from ready_for_submission → submitted.
   * Marks isLate if current date exceeds deadlineDate.
   */
  async submitNOE(id: string, userId: string, locationId: string): Promise<NOEResponse> {
    const [existing] = await db
      .select()
      .from(noticesOfElection)
      .where(eq(noticesOfElection.id, id))
      .limit(1);

    if (!existing) {
      throw new NOENotFoundError(id);
    }

    assertValidTransition(existing.status, "submitted");

    const now = new Date();
    const isLate = now > new Date(existing.deadlineDate);

    const row = await db.transaction(async (tx) => {
      await applyRlsContext(tx, locationId, userId);

      const [updated] = await tx
        .update(noticesOfElection)
        .set({
          status: "submitted",
          submittedAt: now,
          submittedByUserId: userId,
          isLate,
          isClaimBlocking: isLate,
          updatedAt: now,
        })
        .where(eq(noticesOfElection.id, id))
        .returning();

      return updated;
    });

    if (!row) {
      throw new NOENotFoundError(id);
    }

    await logAudit("update", userId, row.patientId, {
      userRole: "clinician",
      locationId,
      resourceType: "notice_of_election",
      resourceId: id,
      details: { transition: "ready_for_submission → submitted", isLate },
    });

    this.log.info({ noeId: id, isLate }, "NOE submitted");
    return noeRowToResponse(row);
  }

  /**
   * Record the CMS response code for a submitted NOE.
   * accepted → moves to 'accepted'; rejected → moves to 'rejected'.
   */
  async recordCMSResponse(
    id: string,
    body: CMSResponseBody,
    locationId: string,
  ): Promise<NOEResponse> {
    const [existing] = await db
      .select()
      .from(noticesOfElection)
      .where(eq(noticesOfElection.id, id))
      .limit(1);

    if (!existing) {
      throw new NOENotFoundError(id);
    }

    const nextStatus = body.accepted ? "accepted" : "rejected";
    assertValidTransition(existing.status, nextStatus);

    const now = new Date();

    const row = await db.transaction(async (tx) => {
      await applyRlsContext(tx, locationId, SYSTEM_USER_ID);

      const [updated] = await tx
        .update(noticesOfElection)
        .set({
          status: nextStatus,
          responseCode: body.responseCode,
          responseMessage: body.responseMessage,
          updatedAt: now,
          ...(body.accepted ? { isClaimBlocking: false } : {}),
        })
        .where(eq(noticesOfElection.id, id))
        .returning();

      return updated;
    });

    if (!row) {
      throw new NOENotFoundError(id);
    }

    if (body.accepted) {
      complianceEvents.emit("noe:accepted", {
        noeId: id,
        patientId: row.patientId,
      });
    } else {
      complianceEvents.emit("noe:rejected", {
        noeId: id,
        patientId: row.patientId,
        responseCode: body.responseCode,
      });
    }

    await logAudit("update", SYSTEM_USER_ID, row.patientId, {
      userRole: "super_admin",
      locationId,
      resourceType: "notice_of_election",
      resourceId: id,
      details: { transition: `submitted → ${nextStatus}`, responseCode: body.responseCode },
    });

    this.log.info(
      { noeId: id, nextStatus, responseCode: body.responseCode },
      "CMS response recorded for NOE",
    );
    return noeRowToResponse(row);
  }

  /**
   * Correct a rejected/needs_correction NOE.
   * Wraps in transaction: voids old row, creates new with correctedFromId set.
   */
  async correctNOE(
    id: string,
    userId: string,
    body: CorrectNOEBody,
    locationId: string,
  ): Promise<NOEResponse> {
    const [existing] = await db
      .select()
      .from(noticesOfElection)
      .where(eq(noticesOfElection.id, id))
      .limit(1);

    if (!existing) {
      throw new NOENotFoundError(id);
    }

    // Can correct from rejected or needs_correction
    if (!["rejected", "needs_correction"].includes(existing.status)) {
      throw new InvalidFilingTransitionError(
        existing.status,
        "correction (voiding original, creating new draft)",
      );
    }

    const electionDate = new Date(body.electionDate);
    const deadlineDate = addBusinessDays(electionDate, 5);
    const deadlineDateStr = deadlineDate.toISOString().slice(0, 10);
    const now = new Date();

    const row = await db.transaction(async (tx) => {
      await applyRlsContext(tx, locationId, userId);

      // Void the old NOE
      await tx
        .update(noticesOfElection)
        .set({ status: "voided", updatedAt: now })
        .where(eq(noticesOfElection.id, id));

      // Create corrected NOE
      const priorSnapshot = {
        id: existing.id,
        status: "voided" as const,
        electionDate: existing.electionDate,
        deadlineDate: existing.deadlineDate,
        attemptCount: existing.attemptCount,
      };

      const [inserted] = await tx
        .insert(noticesOfElection)
        .values({
          patientId: existing.patientId,
          locationId,
          electionDate: body.electionDate,
          deadlineDate: deadlineDateStr,
          status: "draft",
          correctedFromId: id,
          attemptCount: existing.attemptCount + 1,
          priorPayloadSnapshot: priorSnapshot,
          ...(body.lateReason ? { lateReason: body.lateReason } : {}),
        })
        .returning();

      return inserted;
    });

    if (!row) {
      throw new Error("Failed to create corrected NOE");
    }

    await logAudit("update", userId, row.patientId, {
      userRole: "clinician",
      locationId,
      resourceType: "notice_of_election",
      resourceId: row.id,
      details: {
        action: "correction",
        voidedId: id,
        newId: row.id,
        attemptCount: row.attemptCount,
      },
    });

    this.log.info({ newNoeId: row.id, voidedNoeId: id }, "NOE corrected");
    return noeRowToResponse(row);
  }

  /**
   * Approve a late override — supervisor/admin only.
   * Transitions late_pending_override → submitted.
   */
  async lateOverride(
    id: string,
    userId: string,
    userRole: string,
    body: LateOverrideBody,
    locationId: string,
  ): Promise<NOEResponse> {
    if (userRole !== "supervisor" && userRole !== "admin" && userRole !== "super_admin") {
      throw new FilingAuthorizationError("Late override requires supervisor or admin role");
    }

    const [existing] = await db
      .select()
      .from(noticesOfElection)
      .where(eq(noticesOfElection.id, id))
      .limit(1);

    if (!existing) {
      throw new NOENotFoundError(id);
    }

    assertValidTransition(existing.status, "submitted");

    const now = new Date();

    const row = await db.transaction(async (tx) => {
      await applyRlsContext(tx, locationId, userId);

      const [updated] = await tx
        .update(noticesOfElection)
        .set({
          status: "submitted",
          overrideApprovedBy: userId,
          overrideApprovedAt: now,
          overrideReason: body.overrideReason,
          submittedAt: now,
          submittedByUserId: userId,
          updatedAt: now,
        })
        .where(eq(noticesOfElection.id, id))
        .returning();

      return updated;
    });

    if (!row) {
      throw new NOENotFoundError(id);
    }

    await logAudit("update", userId, row.patientId, {
      userRole,
      locationId,
      resourceType: "notice_of_election",
      resourceId: id,
      details: { action: "late_override", overrideReason: body.overrideReason },
    });

    this.log.info({ noeId: id, approvedBy: userId }, "NOE late override approved");
    return noeRowToResponse(row);
  }

  /**
   * Check if a NOE is ready for submission.
   */
  async checkNOEReadiness(
    id: string,
    locationId: string,
    userId: string,
  ): Promise<ReadinessResponse> {
    const [row] = await db
      .select()
      .from(noticesOfElection)
      .where(and(eq(noticesOfElection.id, id), eq(noticesOfElection.locationId, locationId)))
      .limit(1);

    if (!row) {
      throw new NOENotFoundError(id);
    }

    type CheckItem = { check: string; passed: boolean; message?: string };
    const checklist: CheckItem[] = [
      {
        check: "election_date_present",
        passed: !!row.electionDate,
        ...(row.electionDate ? {} : { message: "Election date is required" }),
      },
      {
        check: "deadline_date_computed",
        passed: !!row.deadlineDate,
        ...(row.deadlineDate ? {} : { message: "Deadline date must be computed" }),
      },
      {
        check: "status_allows_submission",
        passed: row.status === "ready_for_submission" || row.status === "draft",
        ...(row.status === "ready_for_submission" || row.status === "draft"
          ? {}
          : { message: `Status '${row.status}' does not allow submission` }),
      },
      {
        check: "late_reason_if_late",
        passed: !row.isLate || !!row.lateReason,
        ...(row.isLate && !row.lateReason
          ? { message: "Late reason required for overdue filing" }
          : {}),
      },
    ];

    await logAudit("view", userId, row.patientId, {
      userRole: "clinician",
      locationId,
      resourceType: "notice_of_election",
      resourceId: id,
      details: { action: "readiness_check" },
    });

    return {
      ready: checklist.every((c) => c.passed),
      checklist,
    };
  }

  /**
   * Get the full filing history (all attempts) for a NOE.
   */
  async getNOEHistory(
    id: string,
    locationId: string,
    userId: string,
  ): Promise<FilingHistoryResponse> {
    const [base] = await db
      .select()
      .from(noticesOfElection)
      .where(and(eq(noticesOfElection.id, id), eq(noticesOfElection.locationId, locationId)))
      .limit(1);

    if (!base) {
      throw new NOENotFoundError(id);
    }

    // Collect all corrections linked to this NOE
    const corrections = await db
      .select()
      .from(noticesOfElection)
      .where(eq(noticesOfElection.correctedFromId, id));

    await logAudit("view", userId, base.patientId, {
      userRole: "clinician",
      locationId,
      resourceType: "notice_of_election",
      resourceId: id,
      details: { action: "history" },
    });

    const all = [base, ...corrections].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );

    const events: FilingHistoryEvent[] = all.map((r) => ({
      event: r.correctedFromId ? "correction_created" : "initial_created",
      timestamp: r.createdAt.toISOString(),
      userId: r.submittedByUserId ?? null,
      details: {
        id: r.id,
        status: r.status,
        attemptCount: r.attemptCount,
        responseCode: r.responseCode ?? null,
      },
    }));

    return { events };
  }

  // ── NOTR methods ─────────────────────────────────────────────────────────────

  /**
   * Create a NOTR draft for a patient.
   * deadlineDate = revocationDate + 5 business days.
   */
  async createNOTR(
    patientId: string,
    noeId: string,
    locationId: string,
    userId: string,
    body: CreateNOTRBody,
  ): Promise<NOTRResponse> {
    const revocationDate = new Date(body.revocationDate);
    const deadlineDate = addBusinessDays(revocationDate, 5);
    const deadlineDateStr = deadlineDate.toISOString().slice(0, 10);

    const row = await db.transaction(async (tx) => {
      await applyRlsContext(tx, locationId, userId);

      const [inserted] = await tx
        .insert(noticesOfTerminationRevocation)
        .values({
          noeId,
          patientId,
          locationId,
          revocationDate: body.revocationDate,
          revocationReason: body.revocationReason,
          deadlineDate: deadlineDateStr,
          status: "draft",
          receivingHospiceId: body.receivingHospiceId ?? null,
          receivingHospiceName: body.receivingHospiceName ?? null,
          transferDate: body.transferDate ?? null,
        })
        .returning();

      return inserted;
    });

    if (!row) {
      throw new Error("Failed to create NOTR");
    }

    await logAudit("create", userId, patientId, {
      userRole: "clinician",
      locationId,
      resourceType: "notice_of_termination_revocation",
      resourceId: row.id,
      details: { noeId, revocationDate: body.revocationDate, deadlineDate: deadlineDateStr },
    });

    this.log.info({ notrId: row.id, noeId, patientId }, "NOTR created");
    return notrRowToResponse(row);
  }

  /**
   * Get the most recent NOTR for a patient.
   */
  async getNOTR(
    patientId: string,
    locationId: string,
    userId: string,
  ): Promise<{ notr: NOTRResponse; history: FilingHistoryEvent[] }> {
    const rows = await db.transaction(async (tx) => {
      await applyRlsContext(tx, locationId, userId);
      return tx
        .select()
        .from(noticesOfTerminationRevocation)
        .where(
          and(
            eq(noticesOfTerminationRevocation.patientId, patientId),
            eq(noticesOfTerminationRevocation.locationId, locationId),
          ),
        )
        .orderBy(noticesOfTerminationRevocation.createdAt);
    });

    if (rows.length === 0) {
      throw new NOTRNotFoundError(patientId);
    }

    const active =
      rows.find((r) => r.status !== "voided" && r.status !== "closed") ?? rows[rows.length - 1];

    if (!active) {
      throw new NOTRNotFoundError(patientId);
    }

    await logAudit("view", userId, patientId, {
      userRole: "clinician",
      locationId,
      resourceType: "notice_of_termination_revocation",
      resourceId: active.id,
    });

    const history: FilingHistoryEvent[] = rows.map((r) => ({
      event: r.correctedFromId ? "correction" : "created",
      timestamp: r.createdAt.toISOString(),
      userId: r.submittedByUserId ?? null,
      details: { status: r.status, attemptCount: r.attemptCount },
    }));

    return { notr: notrRowToResponse(active), history };
  }

  /**
   * Submit a NOTR — transitions ready_for_submission → submitted.
   */
  async submitNOTR(id: string, userId: string, locationId: string): Promise<NOTRResponse> {
    const [existing] = await db
      .select()
      .from(noticesOfTerminationRevocation)
      .where(eq(noticesOfTerminationRevocation.id, id))
      .limit(1);

    if (!existing) {
      throw new NOTRNotFoundError(id);
    }

    assertValidTransition(existing.status, "submitted");

    const now = new Date();
    const isLate = now > new Date(existing.deadlineDate);

    const row = await db.transaction(async (tx) => {
      await applyRlsContext(tx, locationId, userId);

      const [updated] = await tx
        .update(noticesOfTerminationRevocation)
        .set({
          status: "submitted",
          submittedAt: now,
          submittedByUserId: userId,
          isLate,
          isClaimBlocking: isLate,
          updatedAt: now,
        })
        .where(eq(noticesOfTerminationRevocation.id, id))
        .returning();

      return updated;
    });

    if (!row) {
      throw new NOTRNotFoundError(id);
    }

    await logAudit("update", userId, row.patientId, {
      userRole: "clinician",
      locationId,
      resourceType: "notice_of_termination_revocation",
      resourceId: id,
      details: { transition: "ready_for_submission → submitted", isLate },
    });

    this.log.info({ notrId: id, isLate }, "NOTR submitted");
    return notrRowToResponse(row);
  }

  /**
   * Record CMS response for a NOTR.
   */
  async recordNOTRCMSResponse(
    id: string,
    body: CMSResponseBody,
    locationId: string,
  ): Promise<NOTRResponse> {
    const [existing] = await db
      .select()
      .from(noticesOfTerminationRevocation)
      .where(eq(noticesOfTerminationRevocation.id, id))
      .limit(1);

    if (!existing) {
      throw new NOTRNotFoundError(id);
    }

    const nextStatus = body.accepted ? "accepted" : "rejected";
    assertValidTransition(existing.status, nextStatus);

    const now = new Date();

    const row = await db.transaction(async (tx) => {
      await applyRlsContext(tx, locationId, SYSTEM_USER_ID);

      const [updated] = await tx
        .update(noticesOfTerminationRevocation)
        .set({
          status: nextStatus,
          responseCode: body.responseCode,
          responseMessage: body.responseMessage,
          updatedAt: now,
          ...(body.accepted ? { isClaimBlocking: false } : {}),
        })
        .where(eq(noticesOfTerminationRevocation.id, id))
        .returning();

      return updated;
    });

    if (!row) {
      throw new NOTRNotFoundError(id);
    }

    if (body.accepted) {
      complianceEvents.emit("notr:accepted", {
        notrId: id,
        patientId: row.patientId,
      });
    }

    await logAudit("update", SYSTEM_USER_ID, row.patientId, {
      userRole: "super_admin",
      locationId,
      resourceType: "notice_of_termination_revocation",
      resourceId: id,
      details: { transition: `submitted → ${nextStatus}`, responseCode: body.responseCode },
    });

    return notrRowToResponse(row);
  }

  /**
   * Correct a rejected/needs_correction NOTR.
   */
  async correctNOTR(
    id: string,
    userId: string,
    body: CreateNOTRBody,
    locationId: string,
  ): Promise<NOTRResponse> {
    const [existing] = await db
      .select()
      .from(noticesOfTerminationRevocation)
      .where(eq(noticesOfTerminationRevocation.id, id))
      .limit(1);

    if (!existing) {
      throw new NOTRNotFoundError(id);
    }

    if (!["rejected", "needs_correction"].includes(existing.status)) {
      throw new InvalidFilingTransitionError(
        existing.status,
        "correction (voiding original, creating new draft)",
      );
    }

    const revocationDate = new Date(body.revocationDate);
    const deadlineDate = addBusinessDays(revocationDate, 5);
    const deadlineDateStr = deadlineDate.toISOString().slice(0, 10);
    const now = new Date();

    const row = await db.transaction(async (tx) => {
      await applyRlsContext(tx, locationId, userId);

      await tx
        .update(noticesOfTerminationRevocation)
        .set({ status: "voided", updatedAt: now })
        .where(eq(noticesOfTerminationRevocation.id, id));

      const priorSnapshot = {
        id: existing.id,
        status: "voided" as const,
        revocationDate: existing.revocationDate,
        deadlineDate: existing.deadlineDate,
        attemptCount: existing.attemptCount,
      };

      const [inserted] = await tx
        .insert(noticesOfTerminationRevocation)
        .values({
          noeId: existing.noeId,
          patientId: existing.patientId,
          locationId,
          revocationDate: body.revocationDate,
          revocationReason: body.revocationReason,
          deadlineDate: deadlineDateStr,
          status: "draft",
          correctedFromId: id,
          attemptCount: existing.attemptCount + 1,
          priorPayloadSnapshot: priorSnapshot,
          receivingHospiceId: body.receivingHospiceId ?? null,
          receivingHospiceName: body.receivingHospiceName ?? null,
          transferDate: body.transferDate ?? null,
        })
        .returning();

      return inserted;
    });

    if (!row) {
      throw new Error("Failed to create corrected NOTR");
    }

    await logAudit("update", userId, row.patientId, {
      userRole: "clinician",
      locationId,
      resourceType: "notice_of_termination_revocation",
      resourceId: row.id,
      details: {
        action: "correction",
        voidedId: id,
        newId: row.id,
        attemptCount: row.attemptCount,
      },
    });

    this.log.info({ newNotrId: row.id, voidedNotrId: id }, "NOTR corrected");
    return notrRowToResponse(row);
  }

  /**
   * Approve a late NOTR override — supervisor/admin only.
   */
  async lateOverrideNOTR(
    id: string,
    userId: string,
    userRole: string,
    body: LateOverrideBody,
    locationId: string,
  ): Promise<NOTRResponse> {
    if (userRole !== "supervisor" && userRole !== "admin" && userRole !== "super_admin") {
      throw new FilingAuthorizationError("Late override requires supervisor or admin role");
    }

    const [existing] = await db
      .select()
      .from(noticesOfTerminationRevocation)
      .where(eq(noticesOfTerminationRevocation.id, id))
      .limit(1);

    if (!existing) {
      throw new NOTRNotFoundError(id);
    }

    assertValidTransition(existing.status, "submitted");

    const now = new Date();

    const row = await db.transaction(async (tx) => {
      await applyRlsContext(tx, locationId, userId);

      const [updated] = await tx
        .update(noticesOfTerminationRevocation)
        .set({
          status: "submitted",
          overrideApprovedBy: userId,
          overrideApprovedAt: now,
          overrideReason: body.overrideReason,
          submittedAt: now,
          submittedByUserId: userId,
          updatedAt: now,
        })
        .where(eq(noticesOfTerminationRevocation.id, id))
        .returning();

      return updated;
    });

    if (!row) {
      throw new NOTRNotFoundError(id);
    }

    await logAudit("update", userId, row.patientId, {
      userRole,
      locationId,
      resourceType: "notice_of_termination_revocation",
      resourceId: id,
      details: { action: "late_override", overrideReason: body.overrideReason },
    });

    this.log.info({ notrId: id, approvedBy: userId }, "NOTR late override approved");
    return notrRowToResponse(row);
  }

  /**
   * Check NOTR readiness for submission.
   */
  async checkNOTRReadiness(
    id: string,
    locationId: string,
    userId: string,
  ): Promise<ReadinessResponse> {
    const [row] = await db
      .select()
      .from(noticesOfTerminationRevocation)
      .where(
        and(
          eq(noticesOfTerminationRevocation.id, id),
          eq(noticesOfTerminationRevocation.locationId, locationId),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NOTRNotFoundError(id);
    }

    type CheckItem = { check: string; passed: boolean; message?: string };
    const checklist: CheckItem[] = [
      {
        check: "revocation_date_present",
        passed: !!row.revocationDate,
        ...(row.revocationDate ? {} : { message: "Revocation date is required" }),
      },
      {
        check: "revocation_reason_present",
        passed: !!row.revocationReason,
        ...(row.revocationReason ? {} : { message: "Revocation reason is required" }),
      },
      {
        check: "deadline_date_computed",
        passed: !!row.deadlineDate,
        ...(row.deadlineDate ? {} : { message: "Deadline date must be computed" }),
      },
      {
        check: "status_allows_submission",
        passed: row.status === "ready_for_submission" || row.status === "draft",
        ...(row.status === "ready_for_submission" || row.status === "draft"
          ? {}
          : { message: `Status '${row.status}' does not allow submission` }),
      },
      {
        check: "late_reason_if_late",
        passed: !row.isLate || !!row.lateReason,
        ...(row.isLate && !row.lateReason
          ? { message: "Late reason required for overdue filing" }
          : {}),
      },
    ];

    await logAudit("view", userId, row.patientId, {
      userRole: "clinician",
      locationId,
      resourceType: "notice_of_termination_revocation",
      resourceId: id,
      details: { action: "readiness_check" },
    });

    return {
      ready: checklist.every((c) => c.passed),
      checklist,
    };
  }

  /**
   * Get full filing history for a NOTR.
   */
  async getNOTRHistory(
    id: string,
    locationId: string,
    userId: string,
  ): Promise<FilingHistoryResponse> {
    const [base] = await db
      .select()
      .from(noticesOfTerminationRevocation)
      .where(
        and(
          eq(noticesOfTerminationRevocation.id, id),
          eq(noticesOfTerminationRevocation.locationId, locationId),
        ),
      )
      .limit(1);

    if (!base) {
      throw new NOTRNotFoundError(id);
    }

    const corrections = await db
      .select()
      .from(noticesOfTerminationRevocation)
      .where(eq(noticesOfTerminationRevocation.correctedFromId, id));

    await logAudit("view", userId, base.patientId, {
      userRole: "clinician",
      locationId,
      resourceType: "notice_of_termination_revocation",
      resourceId: id,
      details: { action: "history" },
    });

    const all = [base, ...corrections].sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
    );

    const events: FilingHistoryEvent[] = all.map((r) => ({
      event: r.correctedFromId ? "correction_created" : "initial_created",
      timestamp: r.createdAt.toISOString(),
      userId: r.submittedByUserId ?? null,
      details: {
        id: r.id,
        status: r.status,
        attemptCount: r.attemptCount,
        responseCode: r.responseCode ?? null,
      },
    }));

    return { events };
  }

  // ── Filing Queue ─────────────────────────────────────────────────────────────

  /**
   * Get the unified filing queue (NOE + NOTR) for a location.
   * Supervisor/admin can see all; clinician sees location-scoped.
   */
  async getFilingQueue(
    locationId: string,
    userId: string,
    query: FilingQueueQuery,
  ): Promise<FilingQueueResponse> {
    const activeStatuses = [
      "draft",
      "ready_for_submission",
      "submitted",
      "rejected",
      "needs_correction",
      "late_pending_override",
    ] as const;

    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    // Build NOE filter conditions
    const noeConditions = [
      eq(noticesOfElection.locationId, locationId),
      inArray(noticesOfElection.status, [...activeStatuses]),
    ];
    if (query.status) {
      noeConditions.push(eq(noticesOfElection.status, query.status));
    }
    if (query.isLate !== undefined) {
      noeConditions.push(eq(noticesOfElection.isLate, query.isLate));
    }
    if (query.isClaimBlocking !== undefined) {
      noeConditions.push(eq(noticesOfElection.isClaimBlocking, query.isClaimBlocking));
    }

    // Build NOTR filter conditions
    const notrConditions = [
      eq(noticesOfTerminationRevocation.locationId, locationId),
      inArray(noticesOfTerminationRevocation.status, [...activeStatuses]),
    ];
    if (query.status) {
      notrConditions.push(eq(noticesOfTerminationRevocation.status, query.status));
    }
    if (query.isLate !== undefined) {
      notrConditions.push(eq(noticesOfTerminationRevocation.isLate, query.isLate));
    }
    if (query.isClaimBlocking !== undefined) {
      notrConditions.push(
        eq(noticesOfTerminationRevocation.isClaimBlocking, query.isClaimBlocking),
      );
    }

    type QueueItem = {
      type: "NOE" | "NOTR";
      id: string;
      patientId: string;
      locationId: string;
      status: string;
      deadlineDate: string;
      isLate: boolean;
      isClaimBlocking: boolean;
      attemptCount: number;
      createdAt: Date;
      updatedAt: Date;
    };

    const [noeRows, notrRows] = await Promise.all([
      query.type && query.type !== "NOE"
        ? Promise.resolve([])
        : db
            .select({
              id: noticesOfElection.id,
              patientId: noticesOfElection.patientId,
              locationId: noticesOfElection.locationId,
              status: noticesOfElection.status,
              deadlineDate: noticesOfElection.deadlineDate,
              isLate: noticesOfElection.isLate,
              isClaimBlocking: noticesOfElection.isClaimBlocking,
              attemptCount: noticesOfElection.attemptCount,
              createdAt: noticesOfElection.createdAt,
              updatedAt: noticesOfElection.updatedAt,
            })
            .from(noticesOfElection)
            .where(and(...noeConditions)),
      query.type && query.type !== "NOTR"
        ? Promise.resolve([])
        : db
            .select({
              id: noticesOfTerminationRevocation.id,
              patientId: noticesOfTerminationRevocation.patientId,
              locationId: noticesOfTerminationRevocation.locationId,
              status: noticesOfTerminationRevocation.status,
              deadlineDate: noticesOfTerminationRevocation.deadlineDate,
              isLate: noticesOfTerminationRevocation.isLate,
              isClaimBlocking: noticesOfTerminationRevocation.isClaimBlocking,
              attemptCount: noticesOfTerminationRevocation.attemptCount,
              createdAt: noticesOfTerminationRevocation.createdAt,
              updatedAt: noticesOfTerminationRevocation.updatedAt,
            })
            .from(noticesOfTerminationRevocation)
            .where(and(...notrConditions)),
    ]);

    const combined: QueueItem[] = [
      ...noeRows.map((r) => ({ type: "NOE" as const, ...r })),
      ...notrRows.map((r) => ({ type: "NOTR" as const, ...r })),
    ];

    // Sort by deadlineDate ascending (most urgent first)
    combined.sort((a, b) => {
      const dateA = new Date(a.deadlineDate).getTime();
      const dateB = new Date(b.deadlineDate).getTime();
      return dateA - dateB;
    });

    const paginated = combined.slice(offset, offset + limit);

    await logAudit("view", userId, null, {
      userRole: "clinician",
      locationId,
      resourceType: "filing_queue",
      details: { total: combined.length },
    });

    return {
      data: paginated.map((item) => ({
        id: item.id,
        type: item.type,
        patientId: item.patientId,
        locationId: item.locationId,
        status: item.status as FilingQueueResponse["data"][number]["status"],
        deadlineDate: item.deadlineDate,
        isLate: item.isLate,
        isClaimBlocking: item.isClaimBlocking,
        attemptCount: item.attemptCount,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      total: combined.length,
    };
  }

  /**
   * Auto-create a NOTR on patient revocation.
   * Called by clinical workflows when a patient revokes hospice election.
   *
   * Wraps in transaction:
   *  1. Closes the active NOE (accepted → closed)
   *  2. Creates a NOTR draft with 5-business-day deadline
   *  3. Emits notr:created socket event
   *  4. Upserts NOTR_DEADLINE alert
   */
  async autoCreateNOTROnRevocation(
    patientId: string,
    noeId: string,
    locationId: string,
    revocationDate: Date,
    reason: string,
  ): Promise<NOTRResponse> {
    const deadlineDate = addBusinessDays(revocationDate, 5);
    const revocationDateStr = revocationDate.toISOString().slice(0, 10);
    const deadlineDateStr = deadlineDate.toISOString().slice(0, 10);

    const notrRow = await db.transaction(async (tx) => {
      await applyRlsContext(tx, locationId, SYSTEM_USER_ID);

      // Close the active NOE
      await tx
        .update(noticesOfElection)
        .set({ status: "closed", updatedAt: new Date() })
        .where(
          and(
            eq(noticesOfElection.id, noeId),
            or(eq(noticesOfElection.status, "accepted"), eq(noticesOfElection.status, "submitted")),
          ),
        );

      // Create NOTR draft
      const [inserted] = await tx
        .insert(noticesOfTerminationRevocation)
        .values({
          noeId,
          patientId,
          locationId,
          revocationDate: revocationDateStr,
          revocationReason: reason,
          deadlineDate: deadlineDateStr,
          status: "draft",
        })
        .returning();

      return inserted;
    });

    if (!notrRow) {
      throw new Error("Failed to auto-create NOTR");
    }

    // Emit socket event
    complianceEvents.emit("notr:created", {
      notrId: notrRow.id,
      noeId,
      patientId,
      deadline: deadlineDateStr,
    });

    // Upsert NOTR_DEADLINE alert
    const patientName = `Patient:${patientId}`;
    const daysRemaining = Math.ceil(
      (deadlineDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24),
    );

    await this.alertService
      .upsertAlert({
        type: "NOTR_DEADLINE",
        severity: "warning",
        patientId,
        patientName,
        locationId,
        dueDate: deadlineDateStr,
        daysRemaining: Math.max(0, daysRemaining),
        description: `NOTR must be filed by ${deadlineDateStr} (5 business days from revocation)`,
        rootCause: "Patient revoked hospice election",
        nextAction: `Submit NOTR to CMS MAC by ${deadlineDateStr}`,
      })
      .catch((err: unknown) =>
        this.log.error({ err, patientId }, "Failed to upsert NOTR_DEADLINE alert"),
      );

    await logAudit("create", SYSTEM_USER_ID, patientId, {
      userRole: "super_admin",
      locationId,
      resourceType: "notice_of_termination_revocation",
      resourceId: notrRow.id,
      details: { action: "auto_create_on_revocation", noeId, revocationDate: revocationDateStr },
    });

    this.log.info({ notrId: notrRow.id, noeId, patientId }, "NOTR auto-created on revocation");
    return notrRowToResponse(notrRow);
  }
}
