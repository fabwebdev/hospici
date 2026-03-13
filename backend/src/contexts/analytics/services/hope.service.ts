/**
 * HOPEService — HOPE Assessment and iQIES Submission Service (T3-1a)
 *
 * Full implementation replacing Phase 2 stubs.
 *
 * Responsibilities:
 *   - Create and manage HOPE-A (01), HOPE-UV (02), HOPE-D (03) assessments
 *   - Validate 7-day completion windows (HOPEWindowViolationError)
 *   - Run two-tier validation engine (blockingErrors + warnings)
 *   - Gate approval: ready_for_review → approved_for_submission (supervisor/admin only)
 *   - Enqueue approved assessments to hope-submission BullMQ queue
 *   - Track iQIES submission attempts with payloadHash
 *   - Reprocess rejected submissions (attempt N+1)
 *   - Revert approved-but-not-submitted assessments back to review
 *   - Quality benchmark queries (NQF measures + HCI vs national averages)
 *
 * All DB operations run inside RLS context (location_id set in session).
 */

import { createHash } from "node:crypto";
import {
  validateHOPEAdmissionWindow,
  validateHOPEDischargeWindow,
} from "@/contexts/analytics/schemas/hope.schema";
import type {
  CreateHOPEAssessmentBody,
  HOPEAssessmentListQuery,
  HOPEAssessmentListResponse,
  HOPEAssessmentResponse,
  HOPEAssessmentStatus,
  HOPEDashboardResponse,
  HOPEPatientTimeline,
  HOPEQualityBenchmark,
  HOPESubmissionListResponse,
  HOPESubmissionRow,
  HOPEValidationResult,
  PatchHOPEAssessmentBody,
} from "@/contexts/analytics/schemas/hopeAssessmentCrud.schema";
import { HOPEValidationService } from "@/contexts/analytics/services/hopeValidation.service.js";
import type { AuditService } from "@/contexts/identity/services/audit.service.js";
import type { HopeAssessmentSelect } from "@/db/schema/hope-assessments.table.js";
import {
  HQRP_NATIONAL_AVERAGES,
  HQRP_TARGET_RATES,
} from "@/db/schema/hope-quality-measures.table.js";
import type * as schema from "@/db/schema/index.js";
import type { Queue } from "bullmq";
import { and, asc, count, desc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { FastifyBaseLogger } from "fastify";
import type Valkey from "iovalkey";

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class HOPEWindowViolationError extends Error {
  constructor(
    public readonly assessmentType: "HOPE-A" | "HOPE-D",
    public readonly daysFromEvent: number,
    public readonly deadline: string,
  ) {
    super(
      `${assessmentType} must be completed within 7 calendar days. ` +
        `Assessment is ${daysFromEvent} days after the triggering event (deadline: ${deadline}).`,
    );
    this.name = "HOPEWindowViolationError";
  }
}

export class HOPESubmissionError extends Error {
  constructor(public readonly iqiesErrors: Array<{ errorCode: string; errorMessage: string }>) {
    super(`iQIES rejected HOPE submission with ${iqiesErrors.length} error(s).`);
    this.name = "HOPESubmissionError";
  }
}

export class HOPEApprovalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HOPEApprovalError";
  }
}

// ---------------------------------------------------------------------------
// Service deps
// ---------------------------------------------------------------------------

export interface HOPEServiceDeps {
  db: NodePgDatabase<typeof schema>;
  valkey: Valkey;
  log: FastifyBaseLogger;
  auditService: typeof AuditService;
  hopeSubmissionQueue: Queue;
}

// ---------------------------------------------------------------------------
// Helper: map DB row → response DTO
// ---------------------------------------------------------------------------

function toResponse(row: HopeAssessmentSelect): HOPEAssessmentResponse {
  return {
    id: row.id,
    patientId: row.patientId,
    locationId: row.locationId,
    assessmentType: row.assessmentType as "01" | "02" | "03",
    assessmentDate: row.assessmentDate,
    electionDate: row.electionDate,
    windowStart: row.windowStart,
    windowDeadline: row.windowDeadline,
    assignedClinicianId: row.assignedClinicianId ?? null,
    status: row.status as HOPEAssessmentStatus,
    completenessScore: row.completenessScore,
    fatalErrorCount: row.fatalErrorCount,
    warningCount: row.warningCount,
    symptomFollowUpRequired: row.symptomFollowUpRequired,
    symptomFollowUpDueAt: row.symptomFollowUpDueAt ?? null,
    data: (row.data as Record<string, unknown>) ?? {},
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Compute window dates from assessment type + election/discharge date
// ---------------------------------------------------------------------------

function computeWindowDates(
  assessmentType: "01" | "02" | "03",
  electionDate: string, // for A/D; visitDate (= assessmentDate) for UV
  assessmentDate: string,
): { windowStart: string; windowDeadline: string } {
  if (assessmentType === "02") {
    // HOPE-UV: same-day window
    return { windowStart: assessmentDate, windowDeadline: assessmentDate };
  }
  // HOPE-A and HOPE-D: 7-day window from electionDate/dischargeDate
  const start = new Date(electionDate);
  const deadline = new Date(electionDate);
  deadline.setDate(deadline.getDate() + 7);
  return {
    windowStart: start.toISOString().split("T")[0] ?? electionDate,
    windowDeadline: deadline.toISOString().split("T")[0] ?? electionDate,
  };
}

// ---------------------------------------------------------------------------
// SHA-256 hash utility for payloadHash
// ---------------------------------------------------------------------------

export function sha256(payload: string): string {
  return createHash("sha256").update(payload).digest("hex");
}

// ---------------------------------------------------------------------------
// HOPEService
// ---------------------------------------------------------------------------

export class HOPEService {
  private readonly validator = new HOPEValidationService();

  constructor(private readonly deps: HOPEServiceDeps) {}

  // ── Create ─────────────────────────────────────────────────────────────────

  async createAssessment(
    input: CreateHOPEAssessmentBody,
    userId: string,
  ): Promise<HOPEAssessmentResponse> {
    const { db, log, auditService } = this.deps;
    const { hopeAssessments } = await import("@/db/schema/hope-assessments.table.js");

    // Validate window for HOPE-A and HOPE-D
    if (input.assessmentType === "01") {
      const check = validateHOPEAdmissionWindow(input.electionDate, input.assessmentDate);
      if (!check.valid) {
        throw new HOPEWindowViolationError("HOPE-A", check.daysFromElection, check.deadline);
      }
    } else if (input.assessmentType === "03") {
      const check = validateHOPEDischargeWindow(input.electionDate, input.assessmentDate);
      if (!check.valid) {
        throw new HOPEWindowViolationError("HOPE-D", check.daysFromDischarge, check.deadline);
      }
    }

    const { windowStart, windowDeadline } = computeWindowDates(
      input.assessmentType,
      input.electionDate,
      input.assessmentDate,
    );

    const [row] = await db
      .insert(hopeAssessments)
      .values({
        patientId: input.patientId,
        locationId: input.locationId,
        assessmentType: input.assessmentType,
        assessmentDate: input.assessmentDate,
        electionDate: input.electionDate,
        windowStart,
        windowDeadline,
        assignedClinicianId: input.assignedClinicianId ?? null,
        status: "draft",
        data: input.data ?? {},
      })
      .returning();

    if (!row) throw new Error("HOPE assessment insert failed — no row returned");

    await auditService.log("create", userId, row.patientId, {
      userRole: "clinician",
      locationId: input.locationId,
      resourceType: "hope_assessment",
      resourceId: row.id,
      details: { assessmentType: row.assessmentType },
    });

    log.info(
      { assessmentId: row.id, type: row.assessmentType, patient: row.patientId },
      "hope.service: assessment created",
    );

    return toResponse(row);
  }

  // ── List ───────────────────────────────────────────────────────────────────

  async listAssessments(
    query: HOPEAssessmentListQuery,
    locationId: string,
  ): Promise<HOPEAssessmentListResponse> {
    const { db } = this.deps;
    const { hopeAssessments } = await import("@/db/schema/hope-assessments.table.js");

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    const conditions = [eq(hopeAssessments.locationId, locationId)];

    if (query.patientId) conditions.push(eq(hopeAssessments.patientId, query.patientId));
    if (query.assessmentType)
      conditions.push(eq(hopeAssessments.assessmentType, query.assessmentType));
    if (query.status) conditions.push(eq(hopeAssessments.status, query.status));
    if (query.assignedClinicianId)
      conditions.push(eq(hopeAssessments.assignedClinicianId, query.assignedClinicianId));
    if (query.dateFrom) conditions.push(gte(hopeAssessments.assessmentDate, query.dateFrom));
    if (query.dateTo) conditions.push(lte(hopeAssessments.assessmentDate, query.dateTo));
    if (query.windowOverdueOnly) {
      const today = new Date().toISOString().split("T")[0] ?? "";
      conditions.push(lte(hopeAssessments.windowDeadline, today));
    }

    const where = and(...conditions);

    const [rows, countRows] = await Promise.all([
      db
        .select()
        .from(hopeAssessments)
        .where(where)
        .orderBy(desc(hopeAssessments.windowDeadline))
        .limit(limit)
        .offset(offset),
      db.select({ total: count() }).from(hopeAssessments).where(where),
    ]);

    return {
      data: rows.map(toResponse),
      total: countRows[0]?.total ?? 0,
      page,
      limit,
    };
  }

  // ── Get ────────────────────────────────────────────────────────────────────

  async getAssessment(id: string, locationId: string): Promise<HOPEAssessmentResponse> {
    const { db } = this.deps;
    const { hopeAssessments } = await import("@/db/schema/hope-assessments.table.js");

    const [row] = await db
      .select()
      .from(hopeAssessments)
      .where(and(eq(hopeAssessments.id, id), eq(hopeAssessments.locationId, locationId)))
      .limit(1);

    if (!row) throw new Error(`HOPE assessment ${id} not found`);
    return toResponse(row);
  }

  // ── Patch ──────────────────────────────────────────────────────────────────

  async patchAssessment(
    id: string,
    input: PatchHOPEAssessmentBody,
    userId: string,
    locationId: string,
  ): Promise<HOPEAssessmentResponse> {
    const { db, auditService } = this.deps;
    const { hopeAssessments } = await import("@/db/schema/hope-assessments.table.js");

    const updateValues: Partial<HopeAssessmentSelect> = {
      updatedAt: new Date(),
    };

    if (Object.prototype.hasOwnProperty.call(input, "assignedClinicianId")) {
      updateValues.assignedClinicianId = input.assignedClinicianId ?? null;
    }
    if (input.status) updateValues.status = input.status;
    if (Object.prototype.hasOwnProperty.call(input, "symptomFollowUpRequired")) {
      updateValues.symptomFollowUpRequired = input.symptomFollowUpRequired ?? false;
    }
    if (Object.prototype.hasOwnProperty.call(input, "symptomFollowUpDueAt")) {
      updateValues.symptomFollowUpDueAt = input.symptomFollowUpDueAt ?? null;
    }
    if (input.data) updateValues.data = input.data;

    const [row] = await db
      .update(hopeAssessments)
      .set(updateValues)
      .where(and(eq(hopeAssessments.id, id), eq(hopeAssessments.locationId, locationId)))
      .returning();

    if (!row) throw new Error(`HOPE assessment ${id} not found or access denied`);

    await auditService.log("update", userId, row.patientId, {
      userRole: "clinician",
      locationId,
      resourceType: "hope_assessment",
      resourceId: row.id,
      details: { changes: Object.keys(input) },
    });

    return toResponse(row);
  }

  // ── Validate ───────────────────────────────────────────────────────────────

  async validateAssessment(id: string, locationId: string): Promise<HOPEValidationResult> {
    const { db } = this.deps;
    const { hopeAssessments } = await import("@/db/schema/hope-assessments.table.js");

    const [row] = await db
      .select()
      .from(hopeAssessments)
      .where(and(eq(hopeAssessments.id, id), eq(hopeAssessments.locationId, locationId)))
      .limit(1);

    if (!row) throw new Error(`HOPE assessment ${id} not found`);

    const result = this.validator.validate(row);

    // Write cached scores back to DB
    await db
      .update(hopeAssessments)
      .set({
        completenessScore: result.completenessScore,
        fatalErrorCount: result.blockingErrors.length,
        warningCount: result.warnings.length,
        updatedAt: new Date(),
      })
      .where(eq(hopeAssessments.id, id));

    return result;
  }

  // ── Approve ────────────────────────────────────────────────────────────────

  async approveAssessment(
    id: string,
    userId: string,
    role: string,
    locationId: string,
  ): Promise<HOPEAssessmentResponse> {
    const { db, auditService, log } = this.deps;
    const { hopeAssessments } = await import("@/db/schema/hope-assessments.table.js");

    if (role !== "supervisor" && role !== "admin" && role !== "super_admin") {
      throw new HOPEApprovalError(
        "Only supervisors and admins can approve assessments for iQIES submission.",
      );
    }

    const [existing] = await db
      .select()
      .from(hopeAssessments)
      .where(and(eq(hopeAssessments.id, id), eq(hopeAssessments.locationId, locationId)))
      .limit(1);

    if (!existing) throw new Error(`HOPE assessment ${id} not found`);

    if (existing.status !== "ready_for_review") {
      throw new HOPEApprovalError(
        `Cannot approve assessment with status '${existing.status}' — must be 'ready_for_review'.`,
      );
    }

    // Re-run validation — block if there are fatal errors
    const validation = this.validator.validate(existing);
    if (validation.blockingErrors.length > 0) {
      throw new HOPEApprovalError(
        `Cannot approve — ${validation.blockingErrors.length} blocking error(s) must be resolved first.`,
      );
    }

    const [row] = await db
      .update(hopeAssessments)
      .set({ status: "approved_for_submission", updatedAt: new Date() })
      .where(and(eq(hopeAssessments.id, id), eq(hopeAssessments.locationId, locationId)))
      .returning();

    if (!row) throw new Error("Approve update failed");

    await auditService.log("update", userId, row.patientId, {
      userRole: role,
      locationId,
      resourceType: "hope_assessment",
      resourceId: row.id,
    });

    // Enqueue for iQIES submission
    await this.enqueueForSubmission(row.id, row.locationId, userId);

    log.info({ assessmentId: row.id, approvedBy: userId }, "hope.service: assessment approved");
    return toResponse(row);
  }

  // ── Enqueue for iQIES ──────────────────────────────────────────────────────

  async enqueueForSubmission(
    assessmentId: string,
    locationId: string,
    userId: string,
  ): Promise<void> {
    const { hopeSubmissionQueue, log } = this.deps;
    const { hopeAssessments } = await import("@/db/schema/hope-assessments.table.js");

    // Fetch current assessment type for the job payload
    const [row] = await this.deps.db
      .select({ assessmentType: hopeAssessments.assessmentType })
      .from(hopeAssessments)
      .where(eq(hopeAssessments.id, assessmentId))
      .limit(1);

    await hopeSubmissionQueue.add(
      "hope-submission",
      {
        assessmentId,
        locationId,
        assessmentType: row?.assessmentType ?? "01",
        submittedByUserId: userId,
      },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: { count: 100 },
        removeOnFail: false,
      },
    );

    log.info({ assessmentId }, "hope.service: enqueued for iQIES submission");
  }

  // ── Reprocess submission (attempt N+1) ────────────────────────────────────

  async reprocessSubmission(
    submissionId: string,
    locationId: string,
    userId: string,
  ): Promise<HOPESubmissionRow> {
    const { db, auditService, log } = this.deps;
    const { hopeIqiesSubmissions } = await import("@/db/schema/hope-iqies-submissions.table.js");
    const { hopeAssessments } = await import("@/db/schema/hope-assessments.table.js");

    const [existing] = await db
      .select()
      .from(hopeIqiesSubmissions)
      .where(
        and(
          eq(hopeIqiesSubmissions.id, submissionId),
          eq(hopeIqiesSubmissions.locationId, locationId),
        ),
      )
      .limit(1);

    if (!existing) throw new Error(`Submission ${submissionId} not found`);
    if (
      existing.submissionStatus !== "rejected" &&
      existing.submissionStatus !== "correction_pending"
    ) {
      throw new Error(`Cannot reprocess submission with status '${existing.submissionStatus}'`);
    }

    // Find highest attempt number for this assessment
    const maxAttemptRows = await db
      .select({ maxAttempt: sql<number>`MAX(attempt_number)` })
      .from(hopeIqiesSubmissions)
      .where(eq(hopeIqiesSubmissions.assessmentId, existing.assessmentId));
    const maxAttempt = maxAttemptRows[0]?.maxAttempt ?? 0;

    // Create attempt N+1 (stub payloadHash — worker will compute real one)
    const [newRow] = await db
      .insert(hopeIqiesSubmissions)
      .values({
        assessmentId: existing.assessmentId,
        locationId,
        attemptNumber: (maxAttempt ?? 0) + 1,
        submittedByUserId: userId,
        submissionStatus: "pending",
        correctionType: "none",
        payloadHash: "reprocess-pending", // updated by worker on actual submission
      })
      .returning();

    if (!newRow) throw new Error("Reprocess insert failed");

    // Re-enqueue the assessment
    const [assessment] = await db
      .select()
      .from(hopeAssessments)
      .where(eq(hopeAssessments.id, existing.assessmentId))
      .limit(1);

    if (assessment) {
      await this.enqueueForSubmission(assessment.id, locationId, userId);
      await auditService.log("update", userId, assessment.patientId, {
        userRole: "clinician",
        locationId,
        resourceType: "hope_submission",
        resourceId: newRow.id,
        details: { originalSubmissionId: submissionId, attemptNumber: newRow.attemptNumber },
      });
    }

    log.info(
      { submissionId: newRow.id, attempt: newRow.attemptNumber },
      "hope.service: submission reprocessed",
    );

    return {
      id: newRow.id,
      assessmentId: newRow.assessmentId,
      locationId: newRow.locationId,
      attemptNumber: newRow.attemptNumber,
      submittedAt: newRow.submittedAt.toISOString(),
      responseReceivedAt: newRow.responseReceivedAt?.toISOString() ?? null,
      trackingId: newRow.trackingId ?? null,
      submittedByUserId: newRow.submittedByUserId ?? null,
      submissionStatus: newRow.submissionStatus,
      correctionType: newRow.correctionType,
      rejectionCodes: newRow.rejectionCodes ?? [],
      rejectionDetails: newRow.rejectionDetails ?? null,
      payloadHash: newRow.payloadHash,
      createdAt: newRow.createdAt.toISOString(),
    };
  }

  // ── Revert to review ───────────────────────────────────────────────────────

  async revertToReview(
    submissionId: string,
    locationId: string,
    userId: string,
    role: string,
  ): Promise<HOPEAssessmentResponse> {
    const { db, auditService } = this.deps;
    const { hopeIqiesSubmissions } = await import("@/db/schema/hope-iqies-submissions.table.js");
    const { hopeAssessments } = await import("@/db/schema/hope-assessments.table.js");

    if (role !== "supervisor" && role !== "admin" && role !== "super_admin") {
      throw new HOPEApprovalError("Only supervisors and admins can revert assessments to review.");
    }

    const [submission] = await db
      .select()
      .from(hopeIqiesSubmissions)
      .where(
        and(
          eq(hopeIqiesSubmissions.id, submissionId),
          eq(hopeIqiesSubmissions.locationId, locationId),
        ),
      )
      .limit(1);

    if (!submission) throw new Error(`Submission ${submissionId} not found`);

    const [row] = await db
      .update(hopeAssessments)
      .set({ status: "ready_for_review", updatedAt: new Date() })
      .where(
        and(
          eq(hopeAssessments.id, submission.assessmentId),
          eq(hopeAssessments.locationId, locationId),
        ),
      )
      .returning();

    if (!row) throw new Error("Revert update failed");

    await auditService.log("update", userId, row.patientId, {
      userRole: role,
      locationId,
      resourceType: "hope_assessment",
      resourceId: row.id,
      details: { submissionId },
    });

    return toResponse(row);
  }

  // ── Dashboard (T3-1b) ─────────────────────────────────────────────────────

  async getDashboard(locationId: string): Promise<HOPEDashboardResponse> {
    const { db, log } = this.deps;
    const { hopeAssessments } = await import("@/db/schema/hope-assessments.table.js");
    const { patients } = await import("@/db/schema/patients.table.js");
    const { decryptPhi } = await import("@/shared-kernel/services/phi-encryption.service.js");

    const today = new Date().toISOString().split("T")[0] ?? "";
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().split("T")[0] ?? "";
    const in48h = new Date(Date.now() + 2 * 86_400_000).toISOString().split("T")[0] ?? "";

    // Fetch all non-terminal assessments for this location
    const activeStatuses = [
      "draft",
      "in_progress",
      "ready_for_review",
      "approved_for_submission",
      "submitted",
      "rejected",
      "needs_correction",
    ] as const;
    const rows = await db
      .select()
      .from(hopeAssessments)
      .where(
        and(
          eq(hopeAssessments.locationId, locationId),
          inArray(hopeAssessments.status, [...activeStatuses]),
        ),
      )
      .orderBy(asc(hopeAssessments.windowDeadline));

    // Count widgets
    let dueToday = 0;
    let due48h = 0;
    let overdue = 0;
    let needsSymptomFollowUp = 0;
    let rejectedByIQIES = 0;
    let readyToSubmit = 0;

    for (const r of rows) {
      const deadline = r.windowDeadline;
      const inProgress = ["draft", "in_progress", "ready_for_review"].includes(r.status);

      if (r.status === "approved_for_submission") readyToSubmit++;
      if (r.status === "rejected") rejectedByIQIES++;
      if (r.symptomFollowUpRequired && r.status !== "accepted") needsSymptomFollowUp++;

      if (inProgress) {
        if (deadline < today) overdue++;
        else if (deadline === today) dueToday++;
        else if (deadline <= in48h) due48h++;
      }
    }

    // Fetch quality benchmarks for penalty risk
    const benchmarks = await this.getQualityBenchmarks(locationId);
    const hqrpPenaltyRisk = benchmarks.hqrpPenaltyRisk;

    // Build patient name map (decrypt in parallel)
    const uniquePatientIds = [...new Set(rows.map((r) => r.patientId))];
    const patientRows =
      uniquePatientIds.length > 0
        ? await db.select().from(patients).where(inArray(patients.id, uniquePatientIds))
        : [];

    const nameMap = new Map<string, string>();
    await Promise.all(
      patientRows.map(async (p) => {
        try {
          const plaintext = await decryptPhi(p.data as string);
          const fhirData = JSON.parse(plaintext) as {
            name?: Array<{ given: string[]; family: string }>;
          };
          const humanName = fhirData.name?.[0];
          const formatted = humanName
            ? `${humanName.given.join(" ")} ${humanName.family}`.trim()
            : `Patient ${p.id.slice(0, 8)}`;
          nameMap.set(p.id, formatted);
        } catch {
          nameMap.set(p.id, `Patient ${p.id.slice(0, 8)}`);
        }
      }),
    );

    const NEXT_ACTIONS: Record<string, string> = {
      draft: "Complete assessment",
      in_progress: "Continue assessment",
      ready_for_review: "Submit for supervisor review",
      approved_for_submission: "Submit to iQIES",
      submitted: "Awaiting iQIES response",
      accepted: "Complete",
      rejected: "Correct and resubmit",
      needs_correction: "Address correction required",
    };

    const assessmentList = rows.map((r) => ({
      id: r.id,
      patientName: nameMap.get(r.patientId) ?? `Patient ${r.patientId.slice(0, 8)}`,
      assessmentType: r.assessmentType as "01" | "02" | "03",
      status: r.status as HOPEAssessmentStatus,
      windowDeadline: r.windowDeadline,
      completenessScore: r.completenessScore,
      symptomFollowUpRequired: r.symptomFollowUpRequired,
      assignedClinicianId: r.assignedClinicianId ?? null,
      nextAction: NEXT_ACTIONS[r.status] ?? "Review assessment",
    }));

    log.info({ locationId, total: rows.length }, "hope.service: dashboard retrieved");

    return {
      dueToday,
      due48h,
      overdue,
      needsSymptomFollowUp,
      rejectedByIQIES,
      readyToSubmit,
      hqrpPenaltyRisk,
      assessmentList,
    };
  }

  // ── Patient timeline (T3-1b) ───────────────────────────────────────────────

  async getPatientTimeline(patientId: string, locationId: string): Promise<HOPEPatientTimeline> {
    const { db, log } = this.deps;
    const { hopeAssessments } = await import("@/db/schema/hope-assessments.table.js");
    const { hopeQualityMeasures } = await import("@/db/schema/hope-quality-measures.table.js");
    const { hopeReportingPeriods } = await import("@/db/schema/hope-reporting-periods.table.js");

    // Fetch all assessments for this patient
    const rows = await db
      .select()
      .from(hopeAssessments)
      .where(
        and(eq(hopeAssessments.patientId, patientId), eq(hopeAssessments.locationId, locationId)),
      )
      .orderBy(asc(hopeAssessments.assessmentDate));

    const admissions = rows.filter((r) => r.assessmentType === "01");
    const uvs = rows.filter((r) => r.assessmentType === "02");
    const discharges = rows.filter((r) => r.assessmentType === "03");

    const latestAdmission = admissions[admissions.length - 1];
    const latestDischarge = discharges[discharges.length - 1];
    const latestUV = uvs[uvs.length - 1];

    // Symptom follow-up: any active assessment with symptomFollowUpRequired=true
    const followUpRow = rows.find((r) => r.symptomFollowUpRequired && r.status !== "accepted");
    const followUpCompleted = followUpRow ? followUpRow.status === "accepted" : true;

    // HQRP penalty exposure: check current quarter measures
    const today = new Date();
    const quarter = Math.ceil((today.getMonth() + 1) / 3);
    const year = today.getFullYear();

    const [period] = await db
      .select()
      .from(hopeReportingPeriods)
      .where(
        and(
          eq(hopeReportingPeriods.locationId, locationId),
          eq(hopeReportingPeriods.calendarYear, year),
          eq(hopeReportingPeriods.quarter, quarter),
        ),
      )
      .limit(1);

    const measureShortfalls: string[] = [];
    if (period) {
      const measures = await db
        .select()
        .from(hopeQualityMeasures)
        .where(eq(hopeQualityMeasures.reportingPeriodId, period.id));
      for (const m of measures) {
        if (m.rate !== null && Number(m.rate) < 70) {
          measureShortfalls.push(m.measureCode);
        }
      }
    }

    log.info({ patientId, locationId }, "hope.service: patient timeline retrieved");

    // Next UV due: roughly 60 days after last UV or election date (clinical estimate, not CMS mandated)
    const nextUVDue = latestUV
      ? (new Date(new Date(latestUV.assessmentDate).getTime() + 60 * 86_400_000)
          .toISOString()
          .split("T")[0] ?? null)
      : latestAdmission
        ? (new Date(new Date(latestAdmission.electionDate).getTime() + 60 * 86_400_000)
            .toISOString()
            .split("T")[0] ?? null)
        : null;

    return {
      patientId,
      hopeA: {
        required: true, // all admitted patients need HOPE-A
        windowDeadline: latestAdmission?.windowDeadline ?? null,
        status: (latestAdmission?.status ?? null) as
          | import("@/contexts/analytics/schemas/hopeAssessmentCrud.schema.js").HOPEAssessmentStatus
          | null,
        assessmentId: latestAdmission?.id ?? null,
      },
      hopeUV: {
        count: uvs.length,
        lastFiledAt: latestUV?.assessmentDate ?? null,
        nextDue: nextUVDue ?? null,
      },
      hopeD: {
        required: discharges.length > 0, // HOPE-D required if discharge event occurred
        windowDeadline: latestDischarge?.windowDeadline ?? null,
        status: (latestDischarge?.status ?? null) as
          | import("@/contexts/analytics/schemas/hopeAssessmentCrud.schema.js").HOPEAssessmentStatus
          | null,
        assessmentId: latestDischarge?.id ?? null,
      },
      symptomFollowUp: {
        required: followUpRow !== undefined,
        dueAt: followUpRow?.symptomFollowUpDueAt ?? null,
        completed: followUpCompleted,
      },
      penaltyExposure: {
        atRisk: measureShortfalls.length > 0,
        measureShortfalls,
      },
    };
  }

  // ── Submission history for an assessment (T3-1b) ──────────────────────────

  async getSubmissionsByAssessment(
    assessmentId: string,
    locationId: string,
  ): Promise<HOPESubmissionListResponse> {
    const { db } = this.deps;
    const { hopeIqiesSubmissions } = await import("@/db/schema/hope-iqies-submissions.table.js");

    const rows = await db
      .select()
      .from(hopeIqiesSubmissions)
      .where(
        and(
          eq(hopeIqiesSubmissions.assessmentId, assessmentId),
          eq(hopeIqiesSubmissions.locationId, locationId),
        ),
      )
      .orderBy(asc(hopeIqiesSubmissions.attemptNumber));

    return {
      assessmentId,
      data: rows.map((r) => ({
        id: r.id,
        assessmentId: r.assessmentId,
        locationId: r.locationId,
        attemptNumber: r.attemptNumber,
        submittedAt: r.submittedAt.toISOString(),
        responseReceivedAt: r.responseReceivedAt?.toISOString() ?? null,
        trackingId: r.trackingId ?? null,
        submittedByUserId: r.submittedByUserId ?? null,
        submissionStatus: r.submissionStatus,
        correctionType: r.correctionType,
        rejectionCodes: r.rejectionCodes ?? [],
        rejectionDetails: r.rejectionDetails ?? null,
        payloadHash: r.payloadHash,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  // ── Quality benchmarks ─────────────────────────────────────────────────────

  async getQualityBenchmarks(locationId: string): Promise<HOPEQualityBenchmark> {
    const { db, log } = this.deps;
    const { hopeReportingPeriods } = await import("@/db/schema/hope-reporting-periods.table.js");
    const { hopeQualityMeasures } = await import("@/db/schema/hope-quality-measures.table.js");

    // Find current or most recent open reporting period for this location
    const today = new Date();
    const quarter = Math.ceil((today.getMonth() + 1) / 3);
    const year = today.getFullYear();

    // Try to find existing period
    const [period] = await db
      .select()
      .from(hopeReportingPeriods)
      .where(
        and(
          eq(hopeReportingPeriods.locationId, locationId),
          eq(hopeReportingPeriods.calendarYear, year),
          eq(hopeReportingPeriods.quarter, quarter),
        ),
      )
      .limit(1);

    const periodStart = `${year}-${String((quarter - 1) * 3 + 1).padStart(2, "0")}-01`;
    const periodEnd = new Date(year, quarter * 3, 0).toISOString().split("T")[0] ?? "";

    // Load last 4 completed periods for trend data (done once, reused per measure below)
    const todayStr = today.toISOString().split("T")[0] ?? "";
    const historicalPeriods = await db
      .select({
        id: hopeReportingPeriods.id,
        calendarYear: hopeReportingPeriods.calendarYear,
        quarter: hopeReportingPeriods.quarter,
      })
      .from(hopeReportingPeriods)
      .where(
        and(
          eq(hopeReportingPeriods.locationId, locationId),
          lt(hopeReportingPeriods.periodEnd, todayStr),
        ),
      )
      .orderBy(desc(hopeReportingPeriods.periodEnd))
      .limit(4);

    // Load measures from DB if period exists, else return seeded static averages
    const measuresToShow = Object.entries(HQRP_NATIONAL_AVERAGES);
    let atRiskAny = false;

    const measureNames: Record<string, string> = {
      NQF3235: "Comprehensive Assessment at Admission",
      NQF3633: "Treatment Preferences",
      NQF3634A: "Hospice Visits in Last Days of Life — Part A (RN/MD)",
      NQF3634B: "Hospice Visits in Last Days of Life — Part B (SWW/Chaplain)",
      HCI: "Hospice Care Index (10-indicator composite)",
    };

    const measures = await Promise.all(
      measuresToShow.map(async ([code, nationalAvg]) => {
        const target = HQRP_TARGET_RATES[code] ?? 70;
        const measureCode = code as "NQF3235" | "NQF3633" | "NQF3634A" | "NQF3634B" | "HCI";
        let locationRate: number | null = null;

        if (period) {
          const [qm] = await db
            .select()
            .from(hopeQualityMeasures)
            .where(
              and(
                eq(hopeQualityMeasures.reportingPeriodId, period.id),
                eq(hopeQualityMeasures.measureCode, measureCode),
              ),
            )
            .limit(1);

          if (qm?.rate) locationRate = Number(qm.rate);
        }

        const atRisk = locationRate !== null && locationRate < target;
        if (atRisk) atRiskAny = true;

        // Trend: last 4 completed quarters in chronological order (oldest first)
        const trendDesc = await Promise.all(
          historicalPeriods.map(async (hp) => {
            const [hqm] = await db
              .select({ rate: hopeQualityMeasures.rate })
              .from(hopeQualityMeasures)
              .where(
                and(
                  eq(hopeQualityMeasures.reportingPeriodId, hp.id),
                  eq(hopeQualityMeasures.measureCode, measureCode),
                ),
              )
              .limit(1);
            return {
              quarter: `${hp.calendarYear} Q${hp.quarter}`,
              rate: hqm?.rate != null ? Number(hqm.rate) : null,
            };
          }),
        );
        const trend = [...trendDesc].reverse();

        return {
          measureCode: code,
          measureName: measureNames[code] ?? code,
          locationRate,
          nationalAverage: nationalAvg,
          targetRate: target,
          atRisk,
          trend,
        };
      }),
    );

    log.info({ locationId, quarter, year }, "hope.service: quality benchmarks retrieved");

    return {
      locationId,
      reportingPeriod: {
        calendarYear: year,
        quarter,
        periodStart,
        periodEnd,
      },
      hqrpPenaltyRisk: atRiskAny,
      measures,
      updatedAt: new Date().toISOString(),
    };
  }
}
