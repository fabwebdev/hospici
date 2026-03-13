/**
 * NoteReviewService — 7-state note review workflow.
 *
 * State machine: PENDING → IN_REVIEW → REVISION_REQUESTED → RESUBMITTED →
 *                IN_REVIEW → APPROVED. ESCALATED from IN_REVIEW or REVISION_REQUESTED.
 *                LOCKED set by T3-5 only.
 *
 * Key invariants:
 *   - APPROVED notes: no edits permitted (enforced here + RLS)
 *   - ESCALATED: always requires escalationReason (audit mandatory)
 *   - revision_count incremented on every REVISION_REQUESTED transition
 *   - first_pass_approved = true when APPROVED and revision_count === 0
 *   - All transitions logged to audit_logs
 *
 * Cache: Valkey key `review:queue:{locationId}` TTL 30s — invalidated on every write.
 */

import type { AlertService } from "@/contexts/compliance/services/alert.service.js";
import { logAudit } from "@/contexts/identity/services/audit.service.js";
import { db } from "@/db/client.js";
import { encounters } from "@/db/schema/encounters.table.js";
import { patients } from "@/db/schema/patients.table.js";
import { decryptPhi } from "@/shared-kernel/services/phi-encryption.service.js";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import type Valkey from "iovalkey";
import type {
  AssignReviewBodyType,
  EscalateReviewBodyType,
  ReviewHistoryResponseType,
  ReviewQueueItemType,
  ReviewQueueQueryType,
  ReviewQueueResponseType,
  RevisionRequestType,
  SubmitReviewBodyType,
} from "../schemas/noteReview.schema.js";

// ── Custom errors ─────────────────────────────────────────────────────────────

export class NoteReviewNotFoundError extends Error {
  constructor(encounterId: string) {
    super(`Encounter ${encounterId} not found`);
    this.name = "NoteReviewNotFoundError";
  }
}

export class NoteReviewInvalidTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Invalid review status transition: ${from} → ${to}`);
    this.name = "NoteReviewInvalidTransitionError";
  }
}

export class NoteReviewApprovedError extends Error {
  constructor() {
    super("APPROVED and LOCKED notes cannot be edited");
    this.name = "NoteReviewApprovedError";
  }
}

export class NoteReviewEscalationReasonRequired extends Error {
  constructor() {
    super("escalationReason is required when escalating a review");
    this.name = "NoteReviewEscalationReasonRequired";
  }
}

// ── User context ──────────────────────────────────────────────────────────────

type UserCtx = {
  id: string;
  locationId: string;
  role: string;
};

// ── Valid state machine transitions ───────────────────────────────────────────

const NOTE_REVIEW_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["IN_REVIEW"],
  IN_REVIEW: ["REVISION_REQUESTED", "APPROVED", "ESCALATED"],
  REVISION_REQUESTED: ["RESUBMITTED", "ESCALATED"],
  RESUBMITTED: ["IN_REVIEW"],
  APPROVED: ["LOCKED"],
  LOCKED: [],
  ESCALATED: ["IN_REVIEW"],
};

// ── RLS helper ────────────────────────────────────────────────────────────────

async function applyRlsContext(
  tx: { execute: (typeof db)["execute"] },
  user: UserCtx,
): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.current_user_id', ${user.id}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_location_id', ${user.locationId}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_role', ${user.role}, true)`);
}

// ── Valkey cache helpers ───────────────────────────────────────────────────────

const CACHE_TTL_SECONDS = 30;

function cacheKey(locationId: string): string {
  return `review:queue:${locationId}`;
}

async function invalidateCache(valkey: Valkey, locationId: string): Promise<void> {
  await valkey.del(cacheKey(locationId));
}

// ── Patient name helper ───────────────────────────────────────────────────────

async function getPatientDisplayName(patientId: string): Promise<string> {
  const [pat] = await db
    .select({ data: patients.data })
    .from(patients)
    .where(eq(patients.id, patientId))
    .limit(1);

  if (!pat) return "[unknown patient]";

  try {
    const plaintext = await decryptPhi(pat.data as string);
    const fhirData = JSON.parse(plaintext) as {
      name?: Array<{ family?: string; given?: string[] }>;
    };
    const name = fhirData.name?.[0];
    if (name) {
      return `${name.given?.join(" ") ?? ""} ${name.family ?? ""}`.trim() || "[unknown patient]";
    }
    return "[unknown patient]";
  } catch {
    return "[encrypted]";
  }
}

// ── Row → ReviewQueueItem mapper ──────────────────────────────────────────────

function rowToQueueItem(
  row: typeof encounters.$inferSelect,
  patientName: string,
): ReviewQueueItemType {
  return {
    encounterId: row.id,
    patientId: row.patientId,
    patientName,
    locationId: row.locationId,
    clinicianId: row.clinicianId,
    visitType: row.visitType,
    visitedAt: row.visitedAt.toISOString(),
    reviewStatus: row.reviewStatus,
    reviewerId: row.reviewerId ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
    escalatedAt: row.escalatedAt?.toISOString() ?? null,
    escalationReason: row.escalationReason ?? null,
    revisionRequests: (row.revisionRequests as RevisionRequestType[]) ?? [],
    priority: row.reviewPriority,
    assignedReviewerId: row.assignedReviewerId ?? null,
    dueBy: row.dueBy?.toISOString() ?? null,
    billingImpact: row.billingImpact,
    complianceImpact: row.complianceImpact,
    firstPassApproved: row.firstPassApproved,
    revisionCount: row.revisionCount,
    vantageChartDraft: row.vantageChartDraft ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── State machine validator ────────────────────────────────────────────────────

function assertValidTransition(from: string, to: string): void {
  const allowed = NOTE_REVIEW_TRANSITIONS[from] ?? [];
  if (!allowed.includes(to)) {
    throw new NoteReviewInvalidTransitionError(from, to);
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

export class NoteReviewService {
  constructor(
    private readonly valkey: Valkey,
    private readonly alertService: AlertService,
  ) {}

  /**
   * List the review queue for the caller's location.
   * Cached in Valkey for 30s (per location, unfiltered).
   * PHI_ACCESS roles see real patient names; others see "[redacted]".
   */
  async listQueue(
    user: UserCtx,
    filters: ReviewQueueQueryType = {},
  ): Promise<ReviewQueueResponseType> {
    const hasFilters = Object.keys(filters).length > 0;

    if (!hasFilters) {
      const cached = await this.valkey.get(cacheKey(user.locationId));
      if (cached) {
        const parsed = JSON.parse(cached) as ReviewQueueResponseType;
        return this.applyPhiRedaction(parsed, user);
      }
    }

    const rows = await db.transaction(async (tx) => {
      await applyRlsContext(tx, user);

      let query = tx.select().from(encounters).$dynamic();

      // Default: exclude APPROVED + LOCKED
      if (!filters.status) {
        query = query.where(
          and(ne(encounters.reviewStatus, "APPROVED"), ne(encounters.reviewStatus, "LOCKED")),
        ) as typeof query;
      } else {
        query = query.where(eq(encounters.reviewStatus, filters.status)) as typeof query;
      }

      if (filters.assignedReviewerId) {
        query = query.where(
          eq(encounters.assignedReviewerId, filters.assignedReviewerId),
        ) as typeof query;
      }
      if (filters.priority !== undefined) {
        query = query.where(eq(encounters.reviewPriority, filters.priority)) as typeof query;
      }
      if (filters.billingImpact !== undefined) {
        query = query.where(eq(encounters.billingImpact, filters.billingImpact)) as typeof query;
      }
      if (filters.complianceImpact !== undefined) {
        query = query.where(
          eq(encounters.complianceImpact, filters.complianceImpact),
        ) as typeof query;
      }
      if (filters.patientId) {
        query = query.where(eq(encounters.patientId, filters.patientId)) as typeof query;
      }

      return query;
    });

    const items = await Promise.all(
      rows.map(async (enc) => {
        const patientName = await getPatientDisplayName(enc.patientId);
        return rowToQueueItem(enc, patientName);
      }),
    );

    const response: ReviewQueueResponseType = { data: items, total: items.length };

    if (!hasFilters) {
      await this.valkey.set(
        cacheKey(user.locationId),
        JSON.stringify(response),
        "EX",
        CACHE_TTL_SECONDS,
      );
    }

    return this.applyPhiRedaction(response, user);
  }

  /**
   * Submit a review — transition status + optionally attach RevisionRequests.
   * APPROVED and LOCKED notes cannot be further edited.
   */
  async submitReview(
    encounterId: string,
    body: SubmitReviewBodyType,
    reviewer: UserCtx,
  ): Promise<ReviewQueueItemType> {
    const updated = await db.transaction(async (tx) => {
      await applyRlsContext(tx, reviewer);

      const [existing] = await tx
        .select()
        .from(encounters)
        .where(eq(encounters.id, encounterId))
        .limit(1);

      if (!existing) throw new NoteReviewNotFoundError(encounterId);

      const currentStatus = existing.reviewStatus;

      if (currentStatus === "APPROVED" || currentStatus === "LOCKED") {
        throw new NoteReviewApprovedError();
      }

      assertValidTransition(currentStatus, body.status);

      if (body.status === "ESCALATED" && !body.escalationReason) {
        throw new NoteReviewEscalationReasonRequired();
      }

      const isRevisionRequested = body.status === "REVISION_REQUESTED";
      const isApproved = body.status === "APPROVED";

      const newRevisionCount = isRevisionRequested
        ? existing.revisionCount + 1
        : existing.revisionCount;

      const firstPassApproved =
        isApproved && existing.revisionCount === 0 ? true : existing.firstPassApproved;

      const [row] = await tx
        .update(encounters)
        .set({
          reviewStatus: body.status,
          reviewerId: reviewer.id,
          reviewedAt: new Date(),
          ...(body.status === "ESCALATED"
            ? { escalatedAt: new Date(), escalationReason: body.escalationReason }
            : {}),
          ...(body.revisionRequests !== undefined
            ? { revisionRequests: body.revisionRequests }
            : {}),
          revisionCount: newRevisionCount,
          firstPassApproved,
          updatedAt: new Date(),
        })
        .where(eq(encounters.id, encounterId))
        .returning();

      if (!row) throw new NoteReviewNotFoundError(encounterId);
      return row;
    });

    await invalidateCache(this.valkey, reviewer.locationId);

    // Emit NOTE_REVIEW_REQUIRED alert when returning from REVISION_REQUESTED
    if (body.status === "REVISION_REQUESTED") {
      const patientName = await getPatientDisplayName(updated.patientId);
      await this.alertService.upsertAlert({
        type: "NOTE_REVIEW_REQUIRED",
        severity: "warning",
        patientId: updated.patientId,
        patientName,
        locationId: updated.locationId,
        dueDate: null,
        daysRemaining: 0,
        description: "Note has been returned for revision",
        rootCause: "Supervisor requested revisions on clinical note",
        nextAction: "Clinician must address revision requests and resubmit",
      });
    }

    await logAudit("update", reviewer.id, updated.patientId, {
      userRole: reviewer.role,
      locationId: reviewer.locationId,
      resourceType: "encounter_review",
      resourceId: encounterId,
      details: {
        toStatus: body.status,
        revisionCount: updated.revisionCount,
      },
    });

    return rowToQueueItem(updated, "[redacted]");
  }

  /**
   * Assign a reviewer to an encounter.
   */
  async assignReview(
    encounterId: string,
    body: AssignReviewBodyType,
    actor: UserCtx,
  ): Promise<ReviewQueueItemType> {
    const updated = await db.transaction(async (tx) => {
      await applyRlsContext(tx, actor);

      const [existing] = await tx
        .select({ id: encounters.id })
        .from(encounters)
        .where(eq(encounters.id, encounterId))
        .limit(1);

      if (!existing) throw new NoteReviewNotFoundError(encounterId);

      const [row] = await tx
        .update(encounters)
        .set({
          assignedReviewerId: body.assignedReviewerId,
          ...(body.priority !== undefined ? { reviewPriority: body.priority } : {}),
          ...(body.dueBy !== undefined ? { dueBy: new Date(body.dueBy) } : {}),
          updatedAt: new Date(),
        })
        .where(eq(encounters.id, encounterId))
        .returning();

      if (!row) throw new NoteReviewNotFoundError(encounterId);
      return row;
    });

    await invalidateCache(this.valkey, actor.locationId);

    await logAudit("update", actor.id, updated.patientId, {
      userRole: actor.role,
      locationId: actor.locationId,
      resourceType: "encounter_review_assignment",
      resourceId: encounterId,
      details: { assignedReviewerId: body.assignedReviewerId },
    });

    return rowToQueueItem(updated, "[redacted]");
  }

  /**
   * Escalate a review — always requires reason (audit pattern).
   */
  async escalate(
    encounterId: string,
    body: EscalateReviewBodyType,
    actor: UserCtx,
  ): Promise<ReviewQueueItemType> {
    if (!body.escalationReason?.trim()) {
      throw new NoteReviewEscalationReasonRequired();
    }

    const updated = await db.transaction(async (tx) => {
      await applyRlsContext(tx, actor);

      const [existing] = await tx
        .select({ reviewStatus: encounters.reviewStatus })
        .from(encounters)
        .where(eq(encounters.id, encounterId))
        .limit(1);

      if (!existing) throw new NoteReviewNotFoundError(encounterId);

      assertValidTransition(existing.reviewStatus, "ESCALATED");

      const [row] = await tx
        .update(encounters)
        .set({
          reviewStatus: "ESCALATED",
          escalatedAt: new Date(),
          escalationReason: body.escalationReason,
          reviewerId: actor.id,
          updatedAt: new Date(),
        })
        .where(eq(encounters.id, encounterId))
        .returning();

      if (!row) throw new NoteReviewNotFoundError(encounterId);
      return row;
    });

    await invalidateCache(this.valkey, actor.locationId);

    await logAudit("update", actor.id, updated.patientId, {
      userRole: actor.role,
      locationId: actor.locationId,
      resourceType: "encounter_review_escalation",
      resourceId: encounterId,
      details: { escalationReason: body.escalationReason },
    });

    return rowToQueueItem(updated, "[redacted]");
  }

  /**
   * Get revision history for an encounter.
   */
  async getHistory(encounterId: string, actor: UserCtx): Promise<ReviewHistoryResponseType> {
    const [enc] = await db.transaction(async (tx) => {
      await applyRlsContext(tx, actor);
      return tx.select().from(encounters).where(eq(encounters.id, encounterId)).limit(1);
    });

    if (!enc) throw new NoteReviewNotFoundError(encounterId);

    const revisionRequests = (enc.revisionRequests as RevisionRequestType[]) ?? [];

    const history =
      revisionRequests.length > 0
        ? [
            {
              timestamp: enc.reviewedAt?.toISOString() ?? enc.updatedAt.toISOString(),
              fromStatus: null,
              toStatus: enc.reviewStatus,
              actorId: enc.reviewerId ?? actor.id,
              revisionRequests,
              escalationReason: enc.escalationReason ?? null,
              draftSnapshot: enc.vantageChartDraft ?? null,
            },
          ]
        : [];

    return {
      encounterId: enc.id,
      currentStatus: enc.reviewStatus,
      currentDraft: enc.vantageChartDraft ?? null,
      history,
    };
  }

  /**
   * Bulk-acknowledge PENDING encounters → IN_REVIEW.
   */
  async bulkAcknowledge(encounterIds: string[], actor: UserCtx): Promise<{ acknowledged: number }> {
    await db.transaction(async (tx) => {
      await applyRlsContext(tx, actor);

      await tx
        .update(encounters)
        .set({
          reviewStatus: "IN_REVIEW",
          reviewerId: actor.id,
          reviewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(inArray(encounters.id, encounterIds), eq(encounters.reviewStatus, "PENDING")));
    });

    await invalidateCache(this.valkey, actor.locationId);

    await logAudit("update", actor.id, null, {
      userRole: actor.role,
      locationId: actor.locationId,
      resourceType: "encounter_review_bulk_acknowledge",
      details: { count: encounterIds.length },
    });

    return { acknowledged: encounterIds.length };
  }

  /**
   * Daily BullMQ job: check for overdue reviews (dueBy < now, not APPROVED/LOCKED).
   */
  async checkOverdueReviews(): Promise<{ checkedAt: string; overdueCount: number }> {
    const now = new Date();

    const overdueRows = await db
      .select({
        encounterId: encounters.id,
        patientId: encounters.patientId,
        locationId: encounters.locationId,
        dueBy: encounters.dueBy,
      })
      .from(encounters)
      .where(
        and(
          ne(encounters.reviewStatus, "APPROVED"),
          ne(encounters.reviewStatus, "LOCKED"),
          sql`${encounters.dueBy} < ${now}`,
          sql`${encounters.dueBy} IS NOT NULL`,
        ),
      );

    for (const row of overdueRows) {
      const patientName = await getPatientDisplayName(row.patientId);

      await this.alertService.upsertAlert({
        type: "NOTE_OVERDUE_REVIEW",
        severity: "warning",
        patientId: row.patientId,
        patientName,
        locationId: row.locationId,
        dueDate: row.dueBy?.toISOString().split("T")[0] ?? null,
        daysRemaining: 0,
        description: "Note review SLA exceeded — review due date has passed",
        rootCause: "Review not completed before dueBy date",
        nextAction: "Supervisor must immediately review and approve or request revision",
      });
    }

    return { checkedAt: now.toISOString(), overdueCount: overdueRows.length };
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private applyPhiRedaction(
    response: ReviewQueueResponseType,
    user: UserCtx,
  ): ReviewQueueResponseType {
    const hasPhiAccess = [
      "clinician",
      "rn",
      "md",
      "super_admin",
      "admin",
      "don",
      "supervisor",
    ].includes(user.role);
    if (hasPhiAccess) return response;
    return {
      ...response,
      data: response.data.map((item) => ({ ...item, patientName: "[redacted]" })),
    };
  }
}
