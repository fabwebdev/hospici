/**
 * chartAudit.service.ts — T3-13 Chart Audit Mode service.
 */

import { AuditService } from "@/contexts/identity/services/audit.service.js";
import { db } from "@/db/client.js";
import {
  carePlans,
  encounters,
  hopeAssessments,
  idgMeetings,
  medications,
  noticesOfElection,
  noticesOfTerminationRevocation,
  orders,
  patients,
  reviewChecklistTemplates,
  reviewQueueViews,
  signatureRequests,
} from "@/db/schema/index.js";
import { decryptPhi } from "@/shared-kernel/services/phi-encryption.service.js";
import { and, count, desc, eq, isNull, or } from "drizzle-orm";
import type {
  ChartAuditDashboardResponseType,
  ChartAuditDetailResponseType,
  ChartAuditQueueQueryType,
  ChartAuditQueueResponseType,
  ChartAuditQueueRowType,
  ChartBulkActionBodyType,
  CreateReviewQueueViewBodyType,
  MissingDocumentType,
  PatchReviewQueueViewBodyType,
  ReviewChecklistTemplateType,
  ReviewQueueBulkActionBodyType,
  ReviewQueueViewType,
} from "../schemas/chartAudit.schema.js";

// ── Local user type (mirrors request.user from rls.middleware) ─────────────────

type RequestUser = {
  id: string;
  role: string;
  locationId: string;
  locationIds: string[];
  permissions: string[];
  breakGlass: boolean;
};

// ── Custom errors ──────────────────────────────────────────────────────────────

export class ChartAuditNotFoundError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = "ChartAuditNotFoundError";
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────

async function getPatientDisplayName(patientId: string): Promise<string> {
  const [pat] = await db.select({ data: patients.data }).from(patients).where(eq(patients.id, patientId));
  if (!pat) return "Unknown";
  try {
    const plain = await decryptPhi(pat.data as string);
    const parsed = JSON.parse(plain) as { name?: { text?: string }[] };
    return parsed.name?.[0]?.text ?? "Unknown";
  } catch {
    return "Redacted";
  }
}

// ── Service ────────────────────────────────────────────────────────────────────

export class ChartAuditService {
  // ── Checklist templates ────────────────────────────────────────────────────

  async getActiveTemplate(
    discipline: string,
    visitType: string,
    locationId: string,
  ): Promise<ReviewChecklistTemplateType | null> {
    const rows = await db
      .select()
      .from(reviewChecklistTemplates)
      .where(
        and(
          eq(reviewChecklistTemplates.discipline, discipline),
          eq(reviewChecklistTemplates.visitType, visitType),
          eq(reviewChecklistTemplates.isActive, true),
          or(
            isNull(reviewChecklistTemplates.locationId),
            eq(reviewChecklistTemplates.locationId, locationId),
          ),
        ),
      )
      .orderBy(desc(reviewChecklistTemplates.version))
      .limit(1);

    if (rows.length === 0) return null;
    return this.mapTemplate(rows[0]!);
  }

  async getTemplateHistory(
    discipline: string,
    visitType: string,
    locationId: string,
  ): Promise<ReviewChecklistTemplateType[]> {
    const rows = await db
      .select()
      .from(reviewChecklistTemplates)
      .where(
        and(
          eq(reviewChecklistTemplates.discipline, discipline),
          eq(reviewChecklistTemplates.visitType, visitType),
          or(
            isNull(reviewChecklistTemplates.locationId),
            eq(reviewChecklistTemplates.locationId, locationId),
          ),
        ),
      )
      .orderBy(desc(reviewChecklistTemplates.version));

    return rows.map((r) => this.mapTemplate(r));
  }

  private mapTemplate(r: typeof reviewChecklistTemplates.$inferSelect): ReviewChecklistTemplateType {
    return {
      id: r.id,
      locationId: r.locationId ?? null,
      discipline: r.discipline,
      visitType: r.visitType,
      items: r.items as ReviewChecklistTemplateType["items"],
      version: r.version,
      isActive: r.isActive,
      effectiveDate: r.effectiveDate,
      createdById: r.createdById ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  // ── Chart audit queue ──────────────────────────────────────────────────────

  async getQueue(
    user: RequestUser,
    query: ChartAuditQueueQueryType,
  ): Promise<ChartAuditQueueResponseType> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 25;
    const offset = (page - 1) * limit;

    const patientRows = await db
      .select({ id: patients.id })
      .from(patients)
      .where(eq(patients.locationId, user.locationId))
      .limit(limit)
      .offset(offset);

    const [countRow] = await db
      .select({ count: count() })
      .from(patients)
      .where(eq(patients.locationId, user.locationId));

    const data: ChartAuditQueueRowType[] = await Promise.all(
      patientRows.map(async (pat) => {
        const patientName = await getPatientDisplayName(pat.id);

        const encRows = await db
          .select({
            assignedReviewerId: encounters.assignedReviewerId,
            billingImpact: encounters.billingImpact,
            complianceImpact: encounters.complianceImpact,
            updatedAt: encounters.updatedAt,
          })
          .from(encounters)
          .where(
            and(
              eq(encounters.patientId, pat.id),
              eq(encounters.locationId, user.locationId),
            ),
          )
          .orderBy(desc(encounters.updatedAt))
          .limit(10);

        const hasBilling = encRows.some((e) => e.billingImpact);
        const hasCompliance = encRows.some((e) => e.complianceImpact);
        const assignedReviewerId = encRows[0]?.assignedReviewerId ?? null;
        const lastActivityAt = encRows[0]?.updatedAt?.toISOString() ?? null;

        return {
          patientId: pat.id,
          patientName,
          primaryDiscipline: "RN",
          reviewStatus: "NOT_STARTED" as const,
          missingDocCount: 0,
          surveyReadinessScore: 0,
          assignedReviewerId,
          assignedReviewerName: null,
          lastActivityAt,
          billingImpact: hasBilling,
          complianceImpact: hasCompliance,
        };
      }),
    );

    return {
      data,
      total: Number(countRow?.count ?? 0),
      page,
      limit,
    };
  }

  // ── Chart audit dashboard ──────────────────────────────────────────────────

  async getDashboard(user: RequestUser): Promise<ChartAuditDashboardResponseType> {
    const [totalRow] = await db
      .select({ count: count() })
      .from(patients)
      .where(eq(patients.locationId, user.locationId));

    const total = Number(totalRow?.count ?? 0);

    return {
      total,
      byStatus: { NOT_STARTED: total, IN_PROGRESS: 0, COMPLETE: 0, FLAGGED: 0 },
      byDiscipline: { RN: total },
      byReviewer: [],
      bySeverity: { critical: 0, warning: 0 },
      avgSurveyReadinessScore: 0,
    };
  }

  // ── Single-patient chart audit detail ─────────────────────────────────────

  async getPatientChartAudit(
    patientId: string,
    user: RequestUser,
  ): Promise<ChartAuditDetailResponseType> {
    const now = new Date();

    const [
      encounterRows,
      hopeRows,
      noeRows,
      notrRows,
      orderRows,
      sigRows,
      carePlanRows,
      medRows,
      idgRows,
    ] = await Promise.all([
      db.select().from(encounters).where(eq(encounters.patientId, patientId)),
      db.select().from(hopeAssessments).where(eq(hopeAssessments.patientId, patientId)),
      db
        .select()
        .from(noticesOfElection)
        .where(eq(noticesOfElection.patientId, patientId))
        .orderBy(desc(noticesOfElection.createdAt))
        .limit(1),
      db
        .select()
        .from(noticesOfTerminationRevocation)
        .where(eq(noticesOfTerminationRevocation.patientId, patientId))
        .orderBy(desc(noticesOfTerminationRevocation.createdAt))
        .limit(1),
      db.select().from(orders).where(eq(orders.patientId, patientId)),
      db.select().from(signatureRequests).where(eq(signatureRequests.patientId, patientId)),
      db
        .select()
        .from(carePlans)
        .where(eq(carePlans.patientId, patientId))
        .orderBy(desc(carePlans.updatedAt))
        .limit(1),
      db.select().from(medications).where(eq(medications.patientId, patientId)),
      db
        .select()
        .from(idgMeetings)
        .where(eq(idgMeetings.patientId, patientId))
        .orderBy(desc(idgMeetings.scheduledAt)),
    ]);

    // ── Encounters section ─────────────────────────────────────────────────
    const encTotal = encounterRows.length;
    const encPending = encounterRows.filter(
      (e) => e.reviewStatus === "PENDING" || e.reviewStatus === "IN_REVIEW",
    ).length;
    const encApproved = encounterRows.filter((e) => e.reviewStatus === "APPROVED").length;
    const encLocked = encounterRows.filter((e) => e.reviewStatus === "LOCKED").length;
    const encOverdue = encounterRows.filter(
      (e) =>
        e.dueBy !== null &&
        e.dueBy < now &&
        e.reviewStatus !== "APPROVED" &&
        e.reviewStatus !== "LOCKED",
    ).length;

    // ── HOPE section ───────────────────────────────────────────────────────
    const hopeRequired = 2;
    const hopeFiled = hopeRows.filter(
      (h) => h.status === "submitted" || h.status === "accepted",
    ).length;
    const hopeMissing: string[] = [];
    if (!hopeRows.some((h) => h.assessmentType === "A1")) hopeMissing.push("Admission HOPE Assessment");
    if (!hopeRows.some((h) => h.assessmentType === "D1")) hopeMissing.push("Discharge HOPE Assessment");

    // ── NOE/NOTR section ───────────────────────────────────────────────────
    const latestNoe = noeRows[0];
    const latestNotr = notrRows[0];
    const noeStatus = (latestNoe?.status as string) ?? "NOT_FILED";
    const notrRequired = !!latestNotr;
    const notrStatus = (latestNotr?.status as string) ?? null;

    // ── Orders section ─────────────────────────────────────────────────────
    const ordTotal = orderRows.length;
    const ordUnsigned = orderRows.filter(
      (o) => o.status === "PENDING_SIGNATURE" || o.status === "DRAFT",
    ).length;
    const ordExpired = orderRows.filter((o) => o.status === "EXPIRED").length;

    // ── Signatures section ─────────────────────────────────────────────────
    const sigRequired = sigRows.length;
    const sigObtained = sigRows.filter(
      (s) => s.status === "SIGNED" || s.status === "PARTIALLY_SIGNED",
    ).length;
    const sigMissing = sigRows
      .filter((s) => s.status !== "SIGNED" && s.status !== "NO_SIGNATURE_REQUIRED")
      .map((s) => s.documentType as string);

    // ── Care plan section ──────────────────────────────────────────────────
    const latestCarePlan = carePlanRows[0];
    const cpPresent = !!latestCarePlan;
    const cpLastUpdated = latestCarePlan?.updatedAt?.toISOString() ?? null;
    const cpDisciplinesComplete = cpPresent
      ? Object.keys((latestCarePlan.disciplineSections as Record<string, unknown>) ?? {})
      : [];

    // ── Medications section ────────────────────────────────────────────────
    const medActive = medRows.filter((m) => m.status === "ACTIVE").length;
    const medUnreconciled = 0; // No pending_review status — stub
    const medTeachingPending = 0;

    // ── IDG meetings section ───────────────────────────────────────────────
    const lastIdg = idgRows[0];
    const lastHeldDate = lastIdg?.completedAt?.toISOString() ?? null;
    const nextDueMs = lastIdg?.completedAt
      ? lastIdg.completedAt.getTime() + 15 * 24 * 60 * 60 * 1000
      : now.getTime() + 15 * 24 * 60 * 60 * 1000;
    const nextDueDate = new Date(nextDueMs).toISOString();
    const idgOverdue = new Date(nextDueMs) < now;

    // ── Missing documents ──────────────────────────────────────────────────
    const missingDocs: MissingDocumentType[] = [];

    if (noeStatus === "NOT_FILED" || noeStatus === "draft") {
      missingDocs.push({
        type: "NOE",
        description: "Notice of Election not filed",
        dueBy: null,
        severity: "critical",
      });
    }
    for (const m of hopeMissing) {
      missingDocs.push({ type: "HOPE", description: m, dueBy: null, severity: "critical" });
    }
    if (ordUnsigned > 0) {
      missingDocs.push({
        type: "UNSIGNED_ORDERS",
        description: `${ordUnsigned} order(s) pending physician signature`,
        dueBy: null,
        severity: "warning",
      });
    }
    if (idgOverdue) {
      missingDocs.push({
        type: "IDG_OVERDUE",
        description: "IDG meeting overdue (42 CFR §418.56 — required every 15 days)",
        dueBy: null,
        severity: "critical",
      });
    }
    if (!cpPresent) {
      missingDocs.push({
        type: "CARE_PLAN",
        description: "Care plan not present",
        dueBy: null,
        severity: "critical",
      });
    }

    // ── Survey readiness score ─────────────────────────────────────────────
    const criticalBlockers = missingDocs.filter((d) => d.severity === "critical");
    const warnDocs = missingDocs.filter((d) => d.severity === "warning");
    let score = 100 - criticalBlockers.length * 20 - warnDocs.length * 5;
    score = Math.max(0, Math.min(100, score));

    await AuditService.log(
      "view",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "patient",
        resourceId: patientId,
        details: { action: "CHART_AUDIT_VIEWED", auditDate: now.toISOString() },
      },
    );

    return {
      patientId,
      auditDate: now.toISOString(),
      sections: {
        encounters: {
          total: encTotal,
          pending: encPending,
          approved: encApproved,
          locked: encLocked,
          overdue: encOverdue,
        },
        hopeAssessments: { required: hopeRequired, filed: hopeFiled, missing: hopeMissing },
        noeNotr: { noeStatus, notrRequired, notrStatus },
        orders: { total: ordTotal, unsigned: ordUnsigned, expired: ordExpired },
        signatures: { required: sigRequired, obtained: sigObtained, missing: sigMissing },
        carePlan: {
          present: cpPresent,
          lastUpdated: cpLastUpdated,
          disciplinesComplete: cpDisciplinesComplete,
        },
        medications: {
          active: medActive,
          unreconciled: medUnreconciled,
          teachingPending: medTeachingPending,
        },
        idgMeetings: { lastHeld: lastHeldDate, nextDue: nextDueDate, overdue: idgOverdue },
      },
      surveyReadiness: {
        score,
        blockers: criticalBlockers.map((d) => d.description),
        warnings: warnDocs.map((d) => d.description),
      },
      missingDocuments: missingDocs,
    };
  }

  // ── Saved views ────────────────────────────────────────────────────────────

  async listViews(user: RequestUser, viewScope?: string): Promise<ReviewQueueViewType[]> {
    const conditions = [eq(reviewQueueViews.locationId, user.locationId)];
    if (viewScope) {
      conditions.push(
        eq(reviewQueueViews.viewScope, viewScope as "note_review" | "chart_audit"),
      );
    }

    const rows = await db
      .select()
      .from(reviewQueueViews)
      .where(
        and(
          ...conditions,
          or(
            eq(reviewQueueViews.ownerId, user.id),
            eq(reviewQueueViews.isShared, true),
          ),
        ),
      )
      .orderBy(desc(reviewQueueViews.isPinned), desc(reviewQueueViews.isDefault));

    return rows.map((r) => this.mapView(r));
  }

  async createView(
    user: RequestUser,
    body: CreateReviewQueueViewBodyType,
  ): Promise<ReviewQueueViewType> {
    if (body.isDefault) {
      await db
        .update(reviewQueueViews)
        .set({ isDefault: false })
        .where(
          and(
            eq(reviewQueueViews.ownerId, user.id),
            eq(reviewQueueViews.viewScope, body.viewScope),
            eq(reviewQueueViews.isDefault, true),
          ),
        );
    }

    const inserted = await db
      .insert(reviewQueueViews)
      .values({
        ownerId: user.id,
        locationId: user.locationId,
        name: body.name,
        viewScope: body.viewScope,
        filters: body.filters ?? {},
        sortConfig: body.sortConfig ?? { sortBy: "lastActivityAt", sortDir: "desc" },
        columnConfig: body.columnConfig ?? { visibleColumns: [], columnOrder: [] },
        groupBy: body.groupBy ?? null,
        isShared: body.isShared ?? false,
        isPinned: body.isPinned ?? false,
        isDefault: body.isDefault ?? false,
      })
      .returning();

    const row = inserted[0];
    if (!row) throw new Error("Failed to insert review queue view");

    await AuditService.log(
      "create",
      user.id,
      null,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "review_queue_view",
        resourceId: row.id,
        details: { name: body.name, viewScope: body.viewScope },
      },
    );

    return this.mapView(row);
  }

  async patchView(
    viewId: string,
    user: RequestUser,
    body: PatchReviewQueueViewBodyType,
  ): Promise<ReviewQueueViewType> {
    const [existing] = await db
      .select()
      .from(reviewQueueViews)
      .where(and(eq(reviewQueueViews.id, viewId), eq(reviewQueueViews.ownerId, user.id)));

    if (!existing) throw new ChartAuditNotFoundError(`View ${viewId} not found`);

    if (body.isDefault === true && !existing.isDefault) {
      await db
        .update(reviewQueueViews)
        .set({ isDefault: false })
        .where(
          and(
            eq(reviewQueueViews.ownerId, user.id),
            eq(reviewQueueViews.viewScope, existing.viewScope),
            eq(reviewQueueViews.isDefault, true),
          ),
        );
    }

    const updates: Partial<typeof reviewQueueViews.$inferInsert> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.filters !== undefined) updates.filters = body.filters;
    if (body.sortConfig !== undefined) updates.sortConfig = body.sortConfig;
    if (body.columnConfig !== undefined) updates.columnConfig = body.columnConfig;
    if (body.groupBy !== undefined) updates.groupBy = body.groupBy;
    if (body.isShared !== undefined) updates.isShared = body.isShared;
    if (body.isPinned !== undefined) updates.isPinned = body.isPinned;
    if (body.isDefault !== undefined) updates.isDefault = body.isDefault;

    const patched = await db
      .update(reviewQueueViews)
      .set(updates)
      .where(eq(reviewQueueViews.id, viewId))
      .returning();

    const updated = patched[0];
    if (!updated) throw new ChartAuditNotFoundError(`View ${viewId} not found after update`);

    return this.mapView(updated);
  }

  async deleteView(viewId: string, user: RequestUser): Promise<void> {
    const [existing] = await db
      .select()
      .from(reviewQueueViews)
      .where(and(eq(reviewQueueViews.id, viewId), eq(reviewQueueViews.ownerId, user.id)));

    if (!existing) throw new ChartAuditNotFoundError(`View ${viewId} not found`);

    await db.delete(reviewQueueViews).where(eq(reviewQueueViews.id, viewId));

    await AuditService.log(
      "delete",
      user.id,
      null,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "review_queue_view",
        resourceId: viewId,
        details: { name: existing.name },
      },
    );
  }

  private mapView(r: typeof reviewQueueViews.$inferSelect): ReviewQueueViewType {
    return {
      id: r.id,
      ownerId: r.ownerId,
      locationId: r.locationId,
      name: r.name,
      viewScope: r.viewScope,
      filters: (r.filters as Record<string, unknown>) ?? {},
      sortConfig: (r.sortConfig as { sortBy: string; sortDir: "asc" | "desc" }) ?? {
        sortBy: "lastActivityAt",
        sortDir: "desc",
      },
      columnConfig: (r.columnConfig as { visibleColumns: string[]; columnOrder: string[] }) ?? {
        visibleColumns: [],
        columnOrder: [],
      },
      groupBy: r.groupBy ?? null,
      isShared: r.isShared,
      isPinned: r.isPinned,
      isDefault: r.isDefault,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  }

  // ── Bulk chart-level QA actions ────────────────────────────────────────────

  async bulkChartAction(
    user: RequestUser,
    body: ChartBulkActionBodyType,
  ): Promise<{ action: string; affected: number; patientIds: string[] }> {
    if (body.action === "EXPORT_CSV") {
      await AuditService.log(
        "export",
        user.id,
        null,
        {
          userRole: user.role,
          locationId: user.locationId,
          resourceType: "patient",
          details: { action: "CHART_AUDIT_BULK_EXPORT_CSV", patientCount: body.patientIds.length },
        },
      );
      return { action: "EXPORT_CSV", affected: body.patientIds.length, patientIds: body.patientIds };
    }

    await db.transaction(async (tx) => {
      if (body.action === "ASSIGN" && body.assignedReviewerId) {
        for (const patientId of body.patientIds) {
          await tx
            .update(encounters)
            .set({ assignedReviewerId: body.assignedReviewerId, updatedAt: new Date() })
            .where(
              and(
                eq(encounters.patientId, patientId),
                eq(encounters.locationId, user.locationId),
              ),
            );
        }
      } else if (body.action === "REQUEST_REVISION") {
        for (const patientId of body.patientIds) {
          await tx
            .update(encounters)
            .set({ reviewStatus: "REVISION_REQUESTED", updatedAt: new Date() })
            .where(
              and(
                eq(encounters.patientId, patientId),
                eq(encounters.locationId, user.locationId),
              ),
            );
        }
      }
    });

    await AuditService.log(
      "update",
      user.id,
      null,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "patient",
        details: {
          action: `CHART_AUDIT_BULK_${body.action}`,
          patientCount: body.patientIds.length,
          assignedReviewerId: body.assignedReviewerId,
        },
      },
    );

    return { action: body.action, affected: body.patientIds.length, patientIds: body.patientIds };
  }

  // ── Note-review bulk actions ───────────────────────────────────────────────

  async bulkReviewQueueAction(
    user: RequestUser,
    body: ReviewQueueBulkActionBodyType,
  ): Promise<{ action: string; affected: number; encounterIds: string[] }> {
    await db.transaction(async (tx) => {
      if (body.action === "ASSIGN" && body.assignedReviewerId) {
        for (const encId of body.encounterIds) {
          await tx
            .update(encounters)
            .set({ assignedReviewerId: body.assignedReviewerId, updatedAt: new Date() })
            .where(and(eq(encounters.id, encId), eq(encounters.locationId, user.locationId)));
        }
      } else if (body.action === "REQUEST_REVISION") {
        for (const encId of body.encounterIds) {
          await tx
            .update(encounters)
            .set({ reviewStatus: "REVISION_REQUESTED", updatedAt: new Date() })
            .where(and(eq(encounters.id, encId), eq(encounters.locationId, user.locationId)));
        }
      } else if (body.action === "ACKNOWLEDGE") {
        for (const encId of body.encounterIds) {
          await tx
            .update(encounters)
            .set({ reviewStatus: "IN_REVIEW", updatedAt: new Date() })
            .where(
              and(
                eq(encounters.id, encId),
                eq(encounters.locationId, user.locationId),
                eq(encounters.reviewStatus, "PENDING"),
              ),
            );
        }
      }
    });

    await AuditService.log(
      "update",
      user.id,
      null,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "encounter",
        details: {
          action: `REVIEW_QUEUE_BULK_${body.action}`,
          encounterCount: body.encounterIds.length,
          assignedReviewerId: body.assignedReviewerId,
        },
      },
    );

    return { action: body.action, affected: body.encounterIds.length, encounterIds: body.encounterIds };
  }

  // ── CSV generation ─────────────────────────────────────────────────────────

  buildQueueCsv(rows: ChartAuditQueueRowType[]): string {
    const header = [
      "patientId", "patientName", "primaryDiscipline", "reviewStatus",
      "missingDocCount", "surveyReadinessScore", "assignedReviewerId",
      "billingImpact", "complianceImpact", "lastActivityAt",
    ].join(",");

    const dataRows = rows.map((r) =>
      [
        r.patientId,
        `"${r.patientName}"`,
        r.primaryDiscipline,
        r.reviewStatus,
        r.missingDocCount,
        r.surveyReadinessScore,
        r.assignedReviewerId ?? "",
        r.billingImpact,
        r.complianceImpact,
        r.lastActivityAt ?? "",
      ].join(","),
    );

    return [header, ...dataRows].join("\n");
  }
}
