/**
 * BenefitPeriodService — T3-4 Benefit Period Control System
 *
 * CMS rules implemented:
 *   - Period sequence: 1×90d, 1×90d, then 60d per subsequent period (42 CFR §418.21)
 *   - H→H transfer: inherit periodNumber, always 60d, clock does not restart
 *   - F2F required for period 3+ (42 CFR §418.22)
 *   - F2F window: recertDueDate − 30 days to recertDueDate
 *   - Status transitions: upcoming → current → recert_due → at_risk → past_due
 *   - Billing risk derivation: missed recert, F2F deficiency, past_due
 *   - Recalculation preview with Valkey-stored token (TTL 5 min)
 *   - Reporting period: at most one per patient (unique constraint + transactional swap)
 *   - All multi-table writes use db.transaction()
 *   - RLS context injected via parameterized sql tag
 */

import { randomUUID } from "node:crypto";
import { logAudit } from "@/contexts/identity/services/audit.service.js";
import { db } from "@/db/client.js";
import {
  type BenefitPeriodInsert,
  type BenefitPeriodRow,
  benefitPeriods,
} from "@/db/schema/benefit-periods.table.js";
import { complianceAlerts } from "@/db/schema/compliance-alerts.table.js";
import { noticesOfElection } from "@/db/schema/noe.table.js";
import { patients } from "@/db/schema/patients.table.js";
import { and, asc, eq, lte, ne, notInArray, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type Valkey from "iovalkey";
import {
  type BenefitPeriodDetailResponse,
  type BenefitPeriodListQuery,
  type BenefitPeriodListResponseType,
  type BenefitPeriodResponse,
  type BenefitPeriodTimelineResponse,
  type CommitRecalculationBody,
  type CorrectPeriodBody,
  type RecalculationPreviewResponse,
  type RecertifyBody,
  type SetReportingPeriodBody,
  getPeriodLengthDays,
  isF2FRequired,
} from "../schemas/benefitPeriod.schema.js";

// ── Custom errors ─────────────────────────────────────────────────────────────

export class BenefitPeriodNotFoundError extends Error {
  constructor(id: string) {
    super(`Benefit period ${id} not found`);
    this.name = "BenefitPeriodNotFoundError";
  }
}

export class InvalidPreviewTokenError extends Error {
  constructor() {
    super("Preview token is invalid or has expired");
    this.name = "InvalidPreviewTokenError";
  }
}

export class BenefitPeriodAuthorizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BenefitPeriodAuthorizationError";
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

type UserCtx = {
  id: string;
  locationId: string;
  role: string;
};

type StatusTransition = {
  periodId: string;
  patientId: string;
  locationId: string;
  periodNumber: number;
  oldStatus: string;
  newStatus: string;
  billingRisk: boolean;
  recertDueDate: string | null;
  f2fStatus: string;
  f2fWindowStart: string | null;
  f2fWindowEnd: string | null;
  f2fRequired: boolean;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const PREVIEW_TTL_SECONDS = 300; // 5 minutes
const PREVIEW_KEY_PREFIX = "benefit-period:preview:";

const TERMINAL_STATUSES = ["closed", "revoked", "transferred_out", "discharged"] as const;

// ── RLS helper ────────────────────────────────────────────────────────────────

async function applyRlsContext(
  tx: { execute: (typeof db)["execute"] },
  user: UserCtx,
): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.location_id', ${user.locationId}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_user_id', ${user.id}, true)`);
  await tx.execute(sql`SELECT set_config('app.user_role', ${user.role}, true)`);
}

// ── Date arithmetic helpers ───────────────────────────────────────────────────

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  const msA = new Date(a).getTime();
  const msB = new Date(b).getTime();
  return Math.floor((msB - msA) / 86_400_000);
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Row mapper ────────────────────────────────────────────────────────────────

function rowToResponse(
  row: BenefitPeriodRow & { periodLengthDays?: number | null },
): BenefitPeriodResponse {
  const lengthDays =
    row.periodLengthDays != null ? row.periodLengthDays : daysBetween(row.startDate, row.endDate);
  return {
    id: row.id,
    patientId: row.patientId,
    locationId: row.locationId,
    periodNumber: row.periodNumber,
    startDate: row.startDate,
    endDate: row.endDate,
    periodLengthDays: lengthDays,
    status: row.status as BenefitPeriodResponse["status"],
    admissionType: (row.admissionType ?? "new_admission") as BenefitPeriodResponse["admissionType"],
    isTransferDerived: row.isTransferDerived,
    sourceAdmissionId: row.sourceAdmissionId ?? null,
    isReportingPeriod: row.isReportingPeriod,
    recertDueDate: row.recertDueDate ?? null,
    recertStatus: row.recertStatus as BenefitPeriodResponse["recertStatus"],
    recertCompletedAt: row.recertCompletedAt?.toISOString() ?? null,
    recertPhysicianId: row.recertPhysicianId ?? null,
    f2fRequired: row.f2fRequired,
    f2fStatus: row.f2fStatus as BenefitPeriodResponse["f2fStatus"],
    f2fDocumentedAt: row.f2fDocumentedAt ?? null,
    f2fProviderId: row.f2fProviderId ?? null,
    f2fWindowStart: row.f2fWindowStart ?? null,
    f2fWindowEnd: row.f2fWindowEnd ?? null,
    billingRisk: row.billingRisk,
    billingRiskReason: row.billingRiskReason ?? null,
    noeId: row.noeId ?? null,
    concurrentCareStart: row.concurrentCareStart ?? null,
    concurrentCareEnd: row.concurrentCareEnd ?? null,
    revocationDate: row.revocationDate ?? null,
    correctionHistory: (row.correctionHistory as BenefitPeriodResponse["correctionHistory"]) ?? [],
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

// ── Service ───────────────────────────────────────────────────────────────────

export class BenefitPeriodService {
  constructor(
    private readonly valkey: Valkey,
    private readonly log: FastifyBaseLogger,
  ) {}

  /**
   * Initialize benefit periods for a newly admitted patient.
   *
   * For standard admission: creates period 1 (90d) and pre-creates period 2 (90d).
   * For H→H transfer: creates a single period at the inherited periodNumber, length 60d.
   */
  async initializePeriods(
    input: {
      patientId: string;
      locationId: string;
      admissionDate: string;
      admissionType: "new_admission" | "hospice_to_hospice_transfer" | "revocation_readmission";
      noeId?: string;
      inheritedPeriodNumber?: number;
      sourceAdmissionId?: string;
    },
    user: UserCtx,
  ): Promise<BenefitPeriodResponse[]> {
    const rows = await db.transaction(async (tx) => {
      await applyRlsContext(tx, user);

      const periodsToCreate: BenefitPeriodInsert[] = [];

      if (input.admissionType === "hospice_to_hospice_transfer") {
        const periodNumber = input.inheritedPeriodNumber ?? 1;
        const startDate = input.admissionDate;
        const endDate = addDays(startDate, 60);
        const f2fReq = isF2FRequired(periodNumber);
        const recertDueDate = periodNumber >= 2 ? addDays(endDate, -14) : null;
        const f2fWindowStart = f2fReq && recertDueDate ? addDays(recertDueDate, -30) : null;
        const f2fWindowEnd = f2fReq && recertDueDate ? recertDueDate : null;

        periodsToCreate.push({
          patientId: input.patientId,
          locationId: input.locationId,
          periodNumber,
          startDate,
          endDate,
          status: "current",
          admissionType: "hospice_to_hospice_transfer",
          isTransferDerived: true,
          sourceAdmissionId: input.sourceAdmissionId ?? null,
          noeId: input.noeId ?? null,
          f2fRequired: f2fReq,
          f2fStatus: f2fReq ? "not_yet_due" : "not_required",
          f2fWindowStart,
          f2fWindowEnd,
          recertDueDate,
          recertStatus: "not_yet_due",
        });
      } else {
        // Standard or revocation readmission: start from period 1
        let currentStart = input.admissionDate;
        for (let p = 1; p <= 2; p++) {
          const length = getPeriodLengthDays(p);
          const endDate = addDays(currentStart, length);
          const f2fReq = isF2FRequired(p);
          const recertDueDate = p >= 2 ? addDays(endDate, -14) : null;
          const f2fWindowStart = f2fReq && recertDueDate ? addDays(recertDueDate, -30) : null;
          const f2fWindowEnd = f2fReq && recertDueDate ? recertDueDate : null;

          periodsToCreate.push({
            patientId: input.patientId,
            locationId: input.locationId,
            periodNumber: p,
            startDate: currentStart,
            endDate,
            status: p === 1 ? "current" : "upcoming",
            admissionType: input.admissionType,
            isTransferDerived: false,
            noeId: p === 1 ? (input.noeId ?? null) : null,
            f2fRequired: f2fReq,
            f2fStatus: f2fReq ? "not_yet_due" : "not_required",
            f2fWindowStart,
            f2fWindowEnd,
            recertDueDate,
            recertStatus: "not_yet_due",
          });

          currentStart = addDays(endDate, 1);
        }
      }

      return tx.insert(benefitPeriods).values(periodsToCreate).returning();
    });

    await logAudit("create", user.id, null, {
      userRole: user.role,
      locationId: user.locationId,
      resourceType: "benefit_periods",
      details: { patientId: input.patientId, count: rows.length },
    });

    return rows.map(rowToResponse);
  }

  /**
   * List benefit periods with optional filters and pagination.
   */
  async listPeriods(
    query: BenefitPeriodListQuery,
    user: UserCtx,
  ): Promise<BenefitPeriodListResponseType> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const offset = (page - 1) * limit;

    const rows = await db.transaction(async (tx) => {
      await applyRlsContext(tx, user);

      let q = tx
        .select({
          bp: benefitPeriods,
          patientData: patients.data,
          noeStatus: noticesOfElection.status,
          noeSubmittedAt: noticesOfElection.submittedAt,
        })
        .from(benefitPeriods)
        .leftJoin(patients, eq(benefitPeriods.patientId, patients.id))
        .leftJoin(noticesOfElection, eq(benefitPeriods.noeId, noticesOfElection.id))
        .$dynamic();

      if (query.status) {
        q = q.where(eq(benefitPeriods.status, query.status)) as typeof q;
      }
      if (query.patientId) {
        q = q.where(eq(benefitPeriods.patientId, query.patientId)) as typeof q;
      }
      if (query.recertDueBefore) {
        q = q.where(lte(benefitPeriods.recertDueDate, query.recertDueBefore)) as typeof q;
      }
      if (query.billingRisk !== undefined) {
        q = q.where(eq(benefitPeriods.billingRisk, query.billingRisk)) as typeof q;
      }

      return q.orderBy(asc(benefitPeriods.createdAt)).limit(limit).offset(offset);
    });

    const items: BenefitPeriodDetailResponse[] = rows.map((r) => {
      const pData = r.patientData as Record<string, unknown> | null;
      const humanName = (
        pData?.name as Array<{ given?: string[]; family?: string }> | undefined
      )?.[0];
      const patientName = humanName
        ? `${humanName.given?.join(" ") ?? ""} ${humanName.family ?? ""}`.trim()
        : "[unknown]";

      const base: BenefitPeriodDetailResponse = {
        ...rowToResponse(r.bp as BenefitPeriodRow),
        patient: { id: r.bp.patientId, name: patientName },
      };

      if (r.bp.noeId && r.noeStatus) {
        base.noe = {
          id: r.bp.noeId,
          status: r.noeStatus,
          ...(r.noeSubmittedAt ? { filedAt: r.noeSubmittedAt.toISOString() } : {}),
        };
      }

      return base;
    });

    return { items, total: items.length, page, limit };
  }

  /**
   * Get a patient's full benefit period timeline + active alerts.
   */
  async getPatientTimeline(
    patientId: string,
    user: UserCtx,
  ): Promise<BenefitPeriodTimelineResponse> {
    const rows = await db.transaction(async (tx) => {
      await applyRlsContext(tx, user);
      return tx
        .select()
        .from(benefitPeriods)
        .where(eq(benefitPeriods.patientId, patientId))
        .orderBy(asc(benefitPeriods.periodNumber));
    });

    if (rows.length === 0) {
      return {
        patientId,
        admissionType: "new_admission",
        periods: [],
        activeAlerts: [],
      };
    }

    const alertRows = await db
      .select({
        id: complianceAlerts.id,
        type: complianceAlerts.type,
        severity: complianceAlerts.severity,
        description: complianceAlerts.description,
      })
      .from(complianceAlerts)
      .where(
        and(eq(complianceAlerts.patientId, patientId), ne(complianceAlerts.status, "resolved")),
      );

    const firstRow = rows[0];
    const admissionType = (firstRow?.admissionType ??
      "new_admission") as BenefitPeriodTimelineResponse["admissionType"];

    return {
      patientId,
      admissionType,
      periods: rows.map(rowToResponse),
      activeAlerts: alertRows.map((a) => ({
        id: a.id,
        type: a.type,
        severity: a.severity,
        description: a.description,
      })),
    };
  }

  /**
   * Get a single benefit period with patient name and NOE data.
   */
  async getPeriod(id: string, user: UserCtx): Promise<BenefitPeriodDetailResponse> {
    const rows = await db.transaction(async (tx) => {
      await applyRlsContext(tx, user);
      return tx
        .select({
          bp: benefitPeriods,
          patientData: patients.data,
          noeStatus: noticesOfElection.status,
          noeSubmittedAt: noticesOfElection.submittedAt,
        })
        .from(benefitPeriods)
        .leftJoin(patients, eq(benefitPeriods.patientId, patients.id))
        .leftJoin(noticesOfElection, eq(benefitPeriods.noeId, noticesOfElection.id))
        .where(eq(benefitPeriods.id, id))
        .limit(1);
    });

    const r = rows[0];
    if (!r) throw new BenefitPeriodNotFoundError(id);

    const pData = r.patientData as Record<string, unknown> | null;
    const humanName = (
      pData?.name as Array<{ given?: string[]; family?: string }> | undefined
    )?.[0];
    const patientName = humanName
      ? `${humanName.given?.join(" ") ?? ""} ${humanName.family ?? ""}`.trim()
      : "[unknown]";

    const result: BenefitPeriodDetailResponse = {
      ...rowToResponse(r.bp as BenefitPeriodRow),
      patient: { id: r.bp.patientId, name: patientName },
    };

    if (r.bp.noeId && r.noeStatus) {
      result.noe = {
        id: r.bp.noeId,
        status: r.noeStatus,
        ...(r.noeSubmittedAt ? { filedAt: r.noeSubmittedAt.toISOString() } : {}),
      };
    }

    return result;
  }

  /**
   * Mark a period as the patient's reporting period.
   * Clears any existing isReportingPeriod for the same patient in the same transaction.
   */
  async setReportingPeriod(
    id: string,
    _body: SetReportingPeriodBody,
    user: UserCtx,
  ): Promise<BenefitPeriodDetailResponse> {
    const row = await db.transaction(async (tx) => {
      await applyRlsContext(tx, user);

      const [existing] = await tx
        .select({ patientId: benefitPeriods.patientId })
        .from(benefitPeriods)
        .where(eq(benefitPeriods.id, id))
        .limit(1);
      if (!existing) throw new BenefitPeriodNotFoundError(id);

      // Clear prior reporting period for this patient
      await tx
        .update(benefitPeriods)
        .set({ isReportingPeriod: false, updatedAt: new Date() })
        .where(
          and(
            eq(benefitPeriods.patientId, existing.patientId),
            ne(benefitPeriods.id, id),
            eq(benefitPeriods.isReportingPeriod, true),
          ),
        );

      const [updated] = await tx
        .update(benefitPeriods)
        .set({ isReportingPeriod: true, updatedAt: new Date() })
        .where(eq(benefitPeriods.id, id))
        .returning();
      return updated;
    });

    if (!row) throw new BenefitPeriodNotFoundError(id);

    await logAudit("update", user.id, null, {
      userRole: user.role,
      locationId: user.locationId,
      resourceType: "benefit_period",
      resourceId: id,
      details: { action: "set_reporting_period" },
    });

    return this.getPeriod(id, user);
  }

  /**
   * Preview recalculation of all periods for a patient starting from the given period.
   * Stores result in Valkey with TTL; returns preview without mutating the DB.
   */
  async recalculateFromPeriod(id: string, user: UserCtx): Promise<RecalculationPreviewResponse> {
    const rows = await db.transaction(async (tx) => {
      await applyRlsContext(tx, user);

      const [pivot] = await tx
        .select()
        .from(benefitPeriods)
        .where(eq(benefitPeriods.id, id))
        .limit(1);
      if (!pivot) throw new BenefitPeriodNotFoundError(id);

      return tx
        .select()
        .from(benefitPeriods)
        .where(
          and(
            eq(benefitPeriods.patientId, pivot.patientId),
            // All periods from this one onward
            sql`${benefitPeriods.periodNumber} >= ${pivot.periodNumber}`,
          ),
        )
        .orderBy(asc(benefitPeriods.periodNumber));
    });

    // Compute what the cascade would look like
    type AffectedPeriod = RecalculationPreviewResponse["affectedPeriods"][number];
    const affectedPeriods: AffectedPeriod[] = [];
    let runningStart = rows[0]?.startDate ?? todayStr();

    for (const row of rows) {
      const expectedStart = runningStart;
      const length = row.isTransferDerived ? 60 : getPeriodLengthDays(row.periodNumber);
      const expectedEnd = addDays(expectedStart, length);

      if (row.startDate !== expectedStart) {
        affectedPeriods.push({
          id: row.id,
          periodNumber: row.periodNumber,
          field: "startDate",
          oldValue: row.startDate,
          newValue: expectedStart,
        });
      }
      if (row.endDate !== expectedEnd) {
        affectedPeriods.push({
          id: row.id,
          periodNumber: row.periodNumber,
          field: "endDate",
          oldValue: row.endDate,
          newValue: expectedEnd,
        });
      }

      runningStart = addDays(expectedEnd, 1);
    }

    const previewToken = randomUUID();
    const expiresAt = new Date(Date.now() + PREVIEW_TTL_SECONDS * 1000).toISOString();

    const previewData: RecalculationPreviewResponse = {
      previewToken,
      expiresAt,
      affectedPeriods,
      changesSummary: `${affectedPeriods.length} field(s) across ${new Set(affectedPeriods.map((p) => p.id)).size} period(s) will be updated`,
    };

    await this.valkey.set(
      `${PREVIEW_KEY_PREFIX}${previewToken}`,
      JSON.stringify(previewData),
      "EX",
      PREVIEW_TTL_SECONDS,
    );

    return previewData;
  }

  /**
   * Commit a previously generated recalculation preview.
   * Validates the preview token from Valkey, applies changes, writes correctionHistory.
   */
  async commitRecalculation(
    id: string,
    body: CommitRecalculationBody,
    user: UserCtx,
  ): Promise<BenefitPeriodDetailResponse> {
    const raw = await this.valkey.get(`${PREVIEW_KEY_PREFIX}${body.previewToken}`);
    if (!raw) throw new InvalidPreviewTokenError();

    const preview = JSON.parse(raw) as RecalculationPreviewResponse;

    // Group changes by period id
    const changesByPeriod = new Map<
      string,
      Array<{ field: string; oldValue: unknown; newValue: unknown }>
    >();
    for (const ap of preview.affectedPeriods) {
      const list = changesByPeriod.get(ap.id) ?? [];
      list.push({ field: ap.field, oldValue: ap.oldValue, newValue: ap.newValue });
      changesByPeriod.set(ap.id, list);
    }

    await db.transaction(async (tx) => {
      await applyRlsContext(tx, user);

      for (const [periodId, changes] of changesByPeriod.entries()) {
        const [existing] = await tx
          .select({ correctionHistory: benefitPeriods.correctionHistory })
          .from(benefitPeriods)
          .where(eq(benefitPeriods.id, periodId))
          .limit(1);
        if (!existing) continue;

        const history = (existing.correctionHistory as unknown[]) ?? [];
        const newEntries = changes.map((c) => ({
          correctedAt: new Date().toISOString(),
          correctedByUserId: user.id,
          field: c.field,
          oldValue: c.oldValue,
          newValue: c.newValue,
          reason: "Recalculation cascade",
          previewApproved: true,
        }));

        const setClause: Record<string, unknown> = {
          correctionHistory: [...history, ...newEntries],
          updatedAt: new Date(),
        };
        for (const c of changes) {
          if (c.field === "startDate") setClause.startDate = c.newValue;
          if (c.field === "endDate") setClause.endDate = c.newValue;
        }

        await tx.update(benefitPeriods).set(setClause).where(eq(benefitPeriods.id, periodId));
      }
    });

    // Invalidate the preview token
    await this.valkey.del(`${PREVIEW_KEY_PREFIX}${body.previewToken}`);

    await logAudit("update", user.id, null, {
      userRole: user.role,
      locationId: user.locationId,
      resourceType: "benefit_period",
      resourceId: id,
      details: { action: "commit_recalculation", affectedCount: changesByPeriod.size },
    });

    return this.getPeriod(id, user);
  }

  /**
   * Complete a recertification for a benefit period.
   * Transitions recertStatus → 'completed', sets recertCompletedAt + recertPhysicianId.
   */
  async completeRecertification(
    id: string,
    body: RecertifyBody,
    user: UserCtx,
  ): Promise<BenefitPeriodDetailResponse> {
    const row = await db.transaction(async (tx) => {
      await applyRlsContext(tx, user);

      const [updated] = await tx
        .update(benefitPeriods)
        .set({
          recertStatus: "completed",
          recertCompletedAt: new Date(body.completedAt),
          recertPhysicianId: body.physicianId,
          updatedAt: new Date(),
        })
        .where(eq(benefitPeriods.id, id))
        .returning({ id: benefitPeriods.id });
      return updated;
    });

    if (!row) throw new BenefitPeriodNotFoundError(id);

    await logAudit("update", user.id, null, {
      userRole: user.role,
      locationId: user.locationId,
      resourceType: "benefit_period",
      resourceId: id,
      details: { action: "complete_recertification", physicianId: body.physicianId },
    });

    return this.getPeriod(id, user);
  }

  /**
   * Revoke a patient's election — sets status='revoked', revocationDate.
   */
  async revokeElection(
    id: string,
    revocationDate: string,
    user: UserCtx,
  ): Promise<BenefitPeriodDetailResponse> {
    const row = await db.transaction(async (tx) => {
      await applyRlsContext(tx, user);

      const [updated] = await tx
        .update(benefitPeriods)
        .set({
          status: "revoked",
          revocationDate,
          updatedAt: new Date(),
        })
        .where(eq(benefitPeriods.id, id))
        .returning({ id: benefitPeriods.id });
      return updated;
    });

    if (!row) throw new BenefitPeriodNotFoundError(id);

    await logAudit("update", user.id, null, {
      userRole: user.role,
      locationId: user.locationId,
      resourceType: "benefit_period",
      resourceId: id,
      details: { action: "revoke_election", revocationDate },
    });

    return this.getPeriod(id, user);
  }

  /**
   * Preview a field correction.
   * For date fields (startDate, endDate): routes through recalculate flow.
   * For non-date fields: returns an auto-approve preview.
   */
  async previewCorrection(
    id: string,
    body: CorrectPeriodBody,
    user: UserCtx,
  ): Promise<RecalculationPreviewResponse> {
    const isDateField = body.field === "startDate" || body.field === "endDate";

    if (isDateField) {
      // Apply the proposed date change temporarily to derive cascade
      const rows = await db.transaction(async (tx) => {
        await applyRlsContext(tx, user);

        const [pivot] = await tx
          .select()
          .from(benefitPeriods)
          .where(eq(benefitPeriods.id, id))
          .limit(1);
        if (!pivot) throw new BenefitPeriodNotFoundError(id);

        return tx
          .select()
          .from(benefitPeriods)
          .where(
            and(
              eq(benefitPeriods.patientId, pivot.patientId),
              sql`${benefitPeriods.periodNumber} >= ${pivot.periodNumber}`,
            ),
          )
          .orderBy(asc(benefitPeriods.periodNumber));
      });

      type AffectedPeriod = RecalculationPreviewResponse["affectedPeriods"][number];
      const affectedPeriods: AffectedPeriod[] = [];
      let runningStart =
        body.field === "startDate" ? (body.newValue as string) : (rows[0]?.startDate ?? todayStr());

      for (const row of rows) {
        const expectedStart = runningStart;
        const length = row.isTransferDerived ? 60 : getPeriodLengthDays(row.periodNumber);
        let expectedEnd = addDays(expectedStart, length);

        if (row.id === id && body.field === "endDate") {
          expectedEnd = body.newValue as string;
        }
        if (row.startDate !== expectedStart) {
          affectedPeriods.push({
            id: row.id,
            periodNumber: row.periodNumber,
            field: "startDate",
            oldValue: row.startDate,
            newValue: expectedStart,
          });
        }
        if (row.endDate !== expectedEnd) {
          affectedPeriods.push({
            id: row.id,
            periodNumber: row.periodNumber,
            field: "endDate",
            oldValue: row.endDate,
            newValue: expectedEnd,
          });
        }
        runningStart = addDays(expectedEnd, 1);
      }

      const previewToken = randomUUID();
      const expiresAt = new Date(Date.now() + PREVIEW_TTL_SECONDS * 1000).toISOString();
      const previewData: RecalculationPreviewResponse = {
        previewToken,
        expiresAt,
        affectedPeriods,
        changesSummary: `Date correction cascades to ${new Set(affectedPeriods.map((p) => p.id)).size} period(s)`,
      };

      await this.valkey.set(
        `${PREVIEW_KEY_PREFIX}${previewToken}`,
        JSON.stringify(previewData),
        "EX",
        PREVIEW_TTL_SECONDS,
      );
      return previewData;
    }

    // Non-date field: auto-approve preview
    const [existing] = await db
      .select({ id: benefitPeriods.id, periodNumber: benefitPeriods.periodNumber })
      .from(benefitPeriods)
      .where(eq(benefitPeriods.id, id))
      .limit(1);
    if (!existing) throw new BenefitPeriodNotFoundError(id);

    const previewToken = randomUUID();
    const expiresAt = new Date(Date.now() + PREVIEW_TTL_SECONDS * 1000).toISOString();
    const previewData: RecalculationPreviewResponse = {
      previewToken,
      expiresAt,
      affectedPeriods: [
        {
          id,
          periodNumber: existing.periodNumber,
          field: body.field,
          oldValue: null, // fetched at commit time
          newValue: body.newValue,
        },
      ],
      changesSummary: `Correct field '${body.field}' on period #${existing.periodNumber}`,
    };

    await this.valkey.set(
      `${PREVIEW_KEY_PREFIX}${previewToken}`,
      JSON.stringify(previewData),
      "EX",
      PREVIEW_TTL_SECONDS,
    );
    return previewData;
  }

  /**
   * Commit a field correction (non-date fields auto-commit; date fields use preview flow).
   */
  async commitCorrection(
    id: string,
    body: CorrectPeriodBody,
    user: UserCtx,
  ): Promise<BenefitPeriodDetailResponse> {
    const isDateField = body.field === "startDate" || body.field === "endDate";

    if (isDateField) {
      const preview = await this.previewCorrection(id, body, user);
      return this.commitRecalculation(id, { previewToken: preview.previewToken }, user);
    }

    await db.transaction(async (tx) => {
      await applyRlsContext(tx, user);

      const [existing] = await tx
        .select()
        .from(benefitPeriods)
        .where(eq(benefitPeriods.id, id))
        .limit(1);
      if (!existing) throw new BenefitPeriodNotFoundError(id);

      const history = (existing.correctionHistory as unknown[]) ?? [];
      const entry = {
        correctedAt: new Date().toISOString(),
        correctedByUserId: user.id,
        field: body.field,
        oldValue: (existing as Record<string, unknown>)[body.field] ?? null,
        newValue: body.newValue,
        reason: body.reason,
        previewApproved: false,
      };

      const setClause: Record<string, unknown> = {
        correctionHistory: [...history, entry],
        updatedAt: new Date(),
        [body.field]: body.newValue,
      };

      await tx.update(benefitPeriods).set(setClause).where(eq(benefitPeriods.id, id));
    });

    await logAudit("update", user.id, null, {
      userRole: user.role,
      locationId: user.locationId,
      resourceType: "benefit_period",
      resourceId: id,
      details: { action: "correct_field", field: body.field },
    });

    return this.getPeriod(id, user);
  }

  /**
   * Derive and persist status transitions for all active periods in a location.
   * Called by the BullMQ worker. Returns the list of transitions for alert emission.
   * This method is idempotent.
   */
  async deriveStatuses(locationId: string): Promise<StatusTransition[]> {
    const today = todayStr();
    const systemUser: UserCtx = {
      id: "00000000-0000-0000-0000-000000000000",
      locationId,
      role: "super_admin",
    };

    const rows = await db.transaction(async (tx) => {
      await applyRlsContext(tx, systemUser);
      return tx
        .select()
        .from(benefitPeriods)
        .where(
          and(
            eq(benefitPeriods.locationId, locationId),
            notInArray(benefitPeriods.status, [...TERMINAL_STATUSES]),
          ),
        );
    });

    const transitions: StatusTransition[] = [];

    for (const row of rows) {
      const endDate = row.endDate;
      const at7 = addDays(endDate, -7);
      const at14 = addDays(endDate, -14);

      // ── Status derivation ─────────────────────────────────────────────
      let newStatus: BenefitPeriodRow["status"] = row.status;

      if (today >= endDate) {
        if (!["past_due", ...TERMINAL_STATUSES].includes(row.status)) {
          newStatus = "past_due";
        }
      } else if (today >= at7) {
        if (!["at_risk", "past_due"].includes(row.status)) {
          newStatus = "at_risk";
        }
      } else if (today >= at14) {
        if (!["recert_due", "at_risk", "past_due"].includes(row.status)) {
          newStatus = "recert_due";
        }
      } else {
        // Beyond 14 days — current or upcoming depending on startDate
        if (today >= row.startDate && ["recert_due", "at_risk"].includes(row.status)) {
          newStatus = "current";
        } else if (today >= row.startDate && row.status === "upcoming") {
          newStatus = "current";
        }
      }

      // ── F2F status derivation ──────────────────────────────────────────
      let newF2FStatus = row.f2fStatus;
      const f2fWindowStart = row.f2fWindowStart;
      const f2fWindowEnd = row.f2fWindowEnd;

      if (!row.f2fRequired) {
        newF2FStatus = "not_required";
      } else if (row.f2fDocumentedAt) {
        // Check if within window
        if (
          f2fWindowStart &&
          f2fWindowEnd &&
          row.f2fDocumentedAt >= f2fWindowStart &&
          row.f2fDocumentedAt <= f2fWindowEnd
        ) {
          newF2FStatus = "documented";
        }
      } else if (f2fWindowStart && f2fWindowEnd) {
        if (today >= f2fWindowEnd) {
          newF2FStatus = "missing";
        } else if (today >= f2fWindowStart) {
          newF2FStatus = "due_soon";
        } else {
          newF2FStatus = "not_yet_due";
        }
      }

      // ── Billing risk derivation ────────────────────────────────────────
      let billingRisk = false;
      let billingRiskReason: string | null = null;

      if (row.recertStatus === "missed") {
        billingRisk = true;
        billingRiskReason = "MISSED_RECERTIFICATION";
      } else if (
        row.f2fRequired &&
        ["missing", "invalid", "recert_blocked"].includes(newF2FStatus)
      ) {
        billingRisk = true;
        billingRiskReason = "F2F_DEFICIENT";
      } else if (newStatus === "past_due") {
        billingRisk = true;
        billingRiskReason = "PERIOD_PAST_DUE";
      }

      // ── Persist if changed ────────────────────────────────────────────
      const hasStatusChange = newStatus !== row.status;
      const hasF2FChange = newF2FStatus !== row.f2fStatus;
      const hasBillingChange = billingRisk !== row.billingRisk;

      if (hasStatusChange || hasF2FChange || hasBillingChange) {
        await db.transaction(async (tx) => {
          await applyRlsContext(tx, systemUser);
          await tx
            .update(benefitPeriods)
            .set({
              status: newStatus,
              f2fStatus: newF2FStatus,
              billingRisk,
              billingRiskReason,
              updatedAt: new Date(),
            })
            .where(eq(benefitPeriods.id, row.id));
        });
      }

      if (hasStatusChange) {
        transitions.push({
          periodId: row.id,
          patientId: row.patientId,
          locationId: row.locationId,
          periodNumber: row.periodNumber,
          oldStatus: row.status,
          newStatus,
          billingRisk,
          recertDueDate: row.recertDueDate ?? null,
          f2fStatus: newF2FStatus,
          f2fWindowStart: row.f2fWindowStart ?? null,
          f2fWindowEnd: row.f2fWindowEnd ?? null,
          f2fRequired: row.f2fRequired,
        });
      }
    }

    return transitions;
  }

  /**
   * Get all distinct location IDs that have active benefit periods.
   * Used by the daily worker to determine which locations to process.
   */
  async getActiveLocationIds(): Promise<string[]> {
    const rows = await db
      .selectDistinct({ locationId: benefitPeriods.locationId })
      .from(benefitPeriods)
      .where(notInArray(benefitPeriods.status, [...TERMINAL_STATUSES]));
    return rows.map((r) => r.locationId);
  }
}
