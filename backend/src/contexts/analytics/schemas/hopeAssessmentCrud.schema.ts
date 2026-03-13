/**
 * HOPE Assessment CRUD + Validation Engine — TypeBox schemas
 *
 * Separate from hope.schema.ts (clinical section data) and
 * hopeQualityMeasures.schema.ts (HQRP reporting).
 *
 * These schemas cover:
 *   - CreateHOPEAssessmentBodySchema — POST /hope/assessments
 *   - PatchHOPEAssessmentBodySchema  — PATCH /hope/assessments/:id
 *   - HOPEAssessmentListQuerySchema  — GET /hope/assessments querystring
 *   - HOPEAssessmentResponseSchema   — single assessment DB row
 *   - HOPEAssessmentListResponseSchema — paginated list
 *   - HOPEValidationResultSchema     — POST /hope/assessments/:id/validate
 *   - HOPESubmissionRowSchema        — iQIES submission tracking row
 *   - HOPEQualityBenchmarkSchema     — GET /analytics/quality-benchmarks
 */

import { type Static, Type } from "@sinclair/typebox";

// ---------------------------------------------------------------------------
// Assessment status enum (matches hope_assessment_status DB enum)
// ---------------------------------------------------------------------------

export const HOPEAssessmentStatusSchema = Type.Union(
  [
    Type.Literal("draft"),
    Type.Literal("in_progress"),
    Type.Literal("ready_for_review"),
    Type.Literal("approved_for_submission"),
    Type.Literal("submitted"),
    Type.Literal("accepted"),
    Type.Literal("rejected"),
    Type.Literal("needs_correction"),
  ],
  { description: "HOPE assessment status state machine" },
);

export type HOPEAssessmentStatus = Static<typeof HOPEAssessmentStatusSchema>;

export const HOPESubmissionStatusSchema = Type.Union(
  [
    Type.Literal("pending"),
    Type.Literal("accepted"),
    Type.Literal("rejected"),
    Type.Literal("correction_pending"),
  ],
  { description: "iQIES submission status" },
);

export const HOPECorrectionTypeSchema = Type.Union(
  [Type.Literal("none"), Type.Literal("modification"), Type.Literal("inactivation")],
  { description: "iQIES correction type" },
);

// ---------------------------------------------------------------------------
// Create body — POST /hope/assessments
// ---------------------------------------------------------------------------

export const CreateHOPEAssessmentBodySchema = Type.Object(
  {
    patientId: Type.String({ format: "uuid" }),
    locationId: Type.String({ format: "uuid" }),
    /** '01' = HOPE-A, '02' = HOPE-UV, '03' = HOPE-D */
    assessmentType: Type.Union([Type.Literal("01"), Type.Literal("02"), Type.Literal("03")], {
      description: "A0310A: Type of HOPE Assessment",
    }),
    assessmentDate: Type.String({ format: "date" }),
    /**
     * For HOPE-A: hospice election date.
     * For HOPE-D: discharge/death date.
     * For HOPE-UV: visit date (same as assessmentDate).
     */
    electionDate: Type.String({ format: "date" }),
    assignedClinicianId: Type.Optional(Type.String({ format: "uuid" })),
    /** Initial clinical payload (can be empty {} for draft; validated on /validate call) */
    data: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);

export type CreateHOPEAssessmentBody = Static<typeof CreateHOPEAssessmentBodySchema>;

// ---------------------------------------------------------------------------
// Patch body — PATCH /hope/assessments/:id
// ---------------------------------------------------------------------------

export const PatchHOPEAssessmentBodySchema = Type.Object(
  {
    assignedClinicianId: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
    status: Type.Optional(HOPEAssessmentStatusSchema),
    symptomFollowUpRequired: Type.Optional(Type.Boolean()),
    symptomFollowUpDueAt: Type.Optional(Type.Union([Type.String({ format: "date" }), Type.Null()])),
    /** Replace clinical payload — full merge (not deep merge) */
    data: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
  },
  { additionalProperties: false },
);

export type PatchHOPEAssessmentBody = Static<typeof PatchHOPEAssessmentBodySchema>;

// ---------------------------------------------------------------------------
// List query — GET /hope/assessments
// ---------------------------------------------------------------------------

export const HOPEAssessmentListQuerySchema = Type.Object(
  {
    patientId: Type.Optional(Type.String({ format: "uuid" })),
    assessmentType: Type.Optional(
      Type.Union([Type.Literal("01"), Type.Literal("02"), Type.Literal("03")]),
    ),
    status: Type.Optional(HOPEAssessmentStatusSchema),
    assignedClinicianId: Type.Optional(Type.String({ format: "uuid" })),
    dateFrom: Type.Optional(Type.String({ format: "date" })),
    dateTo: Type.Optional(Type.String({ format: "date" })),
    windowOverdueOnly: Type.Optional(Type.Boolean()),
    page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
  },
  { additionalProperties: false },
);

export type HOPEAssessmentListQuery = Static<typeof HOPEAssessmentListQuerySchema>;

// ---------------------------------------------------------------------------
// Assessment response — single DB row
// ---------------------------------------------------------------------------

export const HOPEAssessmentResponseSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    patientId: Type.String({ format: "uuid" }),
    locationId: Type.String({ format: "uuid" }),
    assessmentType: Type.Union([Type.Literal("01"), Type.Literal("02"), Type.Literal("03")]),
    assessmentDate: Type.String({ format: "date" }),
    electionDate: Type.String({ format: "date" }),
    windowStart: Type.String({ format: "date" }),
    windowDeadline: Type.String({ format: "date" }),
    assignedClinicianId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    status: HOPEAssessmentStatusSchema,
    completenessScore: Type.Integer({ minimum: 0, maximum: 100 }),
    fatalErrorCount: Type.Integer({ minimum: 0 }),
    warningCount: Type.Integer({ minimum: 0 }),
    symptomFollowUpRequired: Type.Boolean(),
    symptomFollowUpDueAt: Type.Union([Type.String({ format: "date" }), Type.Null()]),
    data: Type.Record(Type.String(), Type.Unknown()),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

export type HOPEAssessmentResponse = Static<typeof HOPEAssessmentResponseSchema>;

// ---------------------------------------------------------------------------
// List response
// ---------------------------------------------------------------------------

export const HOPEAssessmentListResponseSchema = Type.Object(
  {
    data: Type.Array(HOPEAssessmentResponseSchema),
    total: Type.Integer({ minimum: 0 }),
    page: Type.Integer({ minimum: 1 }),
    limit: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);

export type HOPEAssessmentListResponse = Static<typeof HOPEAssessmentListResponseSchema>;

// ---------------------------------------------------------------------------
// Validation result — POST /hope/assessments/:id/validate
// ---------------------------------------------------------------------------

const HOPEIssueSchema = Type.Object({
  field: Type.String(),
  code: Type.String(),
  message: Type.String(),
});

export const HOPEValidationResultSchema = Type.Object(
  {
    completenessScore: Type.Integer({ minimum: 0, maximum: 100 }),
    blockingErrors: Type.Array(HOPEIssueSchema),
    warnings: Type.Array(HOPEIssueSchema),
    inconsistencies: Type.Array(Type.String()),
    missingRequiredFields: Type.Array(Type.String()),
    suggestedNextActions: Type.Array(Type.String()),
  },
  { additionalProperties: false },
);

export type HOPEValidationResult = Static<typeof HOPEValidationResultSchema>;

// ---------------------------------------------------------------------------
// iQIES submission row — returned by list/reprocess routes
// ---------------------------------------------------------------------------

export const HOPESubmissionRowSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    assessmentId: Type.String({ format: "uuid" }),
    locationId: Type.String({ format: "uuid" }),
    attemptNumber: Type.Integer({ minimum: 1 }),
    submittedAt: Type.String({ format: "date-time" }),
    responseReceivedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    trackingId: Type.Union([Type.String(), Type.Null()]),
    submittedByUserId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    submissionStatus: HOPESubmissionStatusSchema,
    correctionType: HOPECorrectionTypeSchema,
    rejectionCodes: Type.Array(Type.String()),
    rejectionDetails: Type.Union([Type.String(), Type.Null()]),
    payloadHash: Type.String(),
    createdAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

export type HOPESubmissionRow = Static<typeof HOPESubmissionRowSchema>;

// ---------------------------------------------------------------------------
// Quality benchmark — GET /analytics/quality-benchmarks
// ---------------------------------------------------------------------------

const HOPEMeasureBenchmarkSchema = Type.Object({
  measureCode: Type.String(),
  measureName: Type.String(),
  locationRate: Type.Union([Type.Number(), Type.Null()]),
  nationalAverage: Type.Union([Type.Number(), Type.Null()]),
  targetRate: Type.Number(),
  /** true if location rate is below target */
  atRisk: Type.Boolean(),
  trend: Type.Array(
    Type.Object({
      quarter: Type.String(),
      rate: Type.Union([Type.Number(), Type.Null()]),
    }),
  ),
});

export const HOPEQualityBenchmarkSchema = Type.Object(
  {
    locationId: Type.String({ format: "uuid" }),
    reportingPeriod: Type.Object({
      calendarYear: Type.Integer(),
      quarter: Type.Integer(),
      periodStart: Type.String({ format: "date" }),
      periodEnd: Type.String({ format: "date" }),
    }),
    hqrpPenaltyRisk: Type.Boolean(),
    measures: Type.Array(HOPEMeasureBenchmarkSchema),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

export type HOPEQualityBenchmark = Static<typeof HOPEQualityBenchmarkSchema>;

// ---------------------------------------------------------------------------
// Dashboard — GET /hope/dashboard (T3-1b)
// ---------------------------------------------------------------------------

/** Single row in the dashboard assessment list */
export const HOPEDashboardAssessmentItemSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  patientName: Type.String(),
  assessmentType: Type.Union([Type.Literal("01"), Type.Literal("02"), Type.Literal("03")]),
  status: HOPEAssessmentStatusSchema,
  windowDeadline: Type.String({ format: "date" }),
  completenessScore: Type.Integer({ minimum: 0, maximum: 100 }),
  symptomFollowUpRequired: Type.Boolean(),
  assignedClinicianId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  nextAction: Type.String(),
});

export type HOPEDashboardAssessmentItem = Static<typeof HOPEDashboardAssessmentItemSchema>;

export const HOPEDashboardResponseSchema = Type.Object(
  {
    dueToday: Type.Integer({ minimum: 0 }),
    due48h: Type.Integer({ minimum: 0 }),
    overdue: Type.Integer({ minimum: 0 }),
    needsSymptomFollowUp: Type.Integer({ minimum: 0 }),
    rejectedByIQIES: Type.Integer({ minimum: 0 }),
    readyToSubmit: Type.Integer({ minimum: 0 }),
    hqrpPenaltyRisk: Type.Boolean(),
    assessmentList: Type.Array(HOPEDashboardAssessmentItemSchema),
  },
  { additionalProperties: false },
);

export type HOPEDashboardResponse = Static<typeof HOPEDashboardResponseSchema>;

// ---------------------------------------------------------------------------
// Patient timeline — GET /hope/patients/:id/timeline (T3-1b)
// ---------------------------------------------------------------------------

export const HOPEPatientTimelineSchema = Type.Object(
  {
    patientId: Type.String({ format: "uuid" }),
    hopeA: Type.Object({
      required: Type.Boolean(),
      windowDeadline: Type.Union([Type.String({ format: "date" }), Type.Null()]),
      status: Type.Union([HOPEAssessmentStatusSchema, Type.Null()]),
      assessmentId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    }),
    hopeUV: Type.Object({
      count: Type.Integer({ minimum: 0 }),
      lastFiledAt: Type.Union([Type.String({ format: "date" }), Type.Null()]),
      nextDue: Type.Union([Type.String({ format: "date" }), Type.Null()]),
    }),
    hopeD: Type.Object({
      required: Type.Boolean(),
      windowDeadline: Type.Union([Type.String({ format: "date" }), Type.Null()]),
      status: Type.Union([HOPEAssessmentStatusSchema, Type.Null()]),
      assessmentId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    }),
    symptomFollowUp: Type.Object({
      required: Type.Boolean(),
      dueAt: Type.Union([Type.String({ format: "date" }), Type.Null()]),
      completed: Type.Boolean(),
    }),
    penaltyExposure: Type.Object({
      atRisk: Type.Boolean(),
      measureShortfalls: Type.Array(Type.String()),
    }),
  },
  { additionalProperties: false },
);

export type HOPEPatientTimeline = Static<typeof HOPEPatientTimelineSchema>;

// ---------------------------------------------------------------------------
// Submission list — GET /hope/assessments/:id/submissions (T3-1b)
// ---------------------------------------------------------------------------

export const HOPESubmissionListResponseSchema = Type.Object(
  {
    data: Type.Array(HOPESubmissionRowSchema),
    assessmentId: Type.String({ format: "uuid" }),
  },
  { additionalProperties: false },
);

export type HOPESubmissionListResponse = Static<typeof HOPESubmissionListResponseSchema>;
