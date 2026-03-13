/**
 * QAPI schemas — TypeBox definitions for T3-11.
 * Validators compiled in typebox-compiler.ts (never here).
 */

import { type Static, Type } from "@sinclair/typebox";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const QAPIEventTypeSchema = Type.Union(
  [
    Type.Literal("ADVERSE_EVENT"),
    Type.Literal("NEAR_MISS"),
    Type.Literal("COMPLAINT"),
    Type.Literal("GRIEVANCE"),
    Type.Literal("QUALITY_TREND"),
  ],
  { $id: "QAPIEventType" },
);

export const QAPIEventStatusSchema = Type.Union(
  [Type.Literal("OPEN"), Type.Literal("IN_PROGRESS"), Type.Literal("CLOSED")],
  { $id: "QAPIEventStatus" },
);

export const QAPIDisciplineSchema = Type.Union(
  [
    Type.Literal("RN"),
    Type.Literal("SW"),
    Type.Literal("CHAPLAIN"),
    Type.Literal("THERAPY"),
    Type.Literal("AIDE"),
  ],
  { $id: "QAPIDiscipline" },
);

// ── Action item ───────────────────────────────────────────────────────────────

export const QAPIActionItemSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    eventId: Type.String({ format: "uuid" }),
    locationId: Type.String({ format: "uuid" }),
    action: Type.String({ minLength: 1 }),
    assignedToId: Type.String({ format: "uuid" }),
    assignedToName: Type.String(),
    dueDate: Type.String({ format: "date" }),
    completedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    completedById: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    createdAt: Type.String({ format: "date-time" }),
  },
  { $id: "QAPIActionItem" },
);

export type QAPIActionItemType = Static<typeof QAPIActionItemSchema>;

// ── QAPI event response ───────────────────────────────────────────────────────

export const QAPIEventResponseSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    locationId: Type.String({ format: "uuid" }),
    eventType: QAPIEventTypeSchema,
    patientId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    reportedById: Type.String({ format: "uuid" }),
    reportedByName: Type.String(),
    occurredAt: Type.String({ format: "date-time" }),
    description: Type.String(),
    rootCauseAnalysis: Type.Union([Type.String(), Type.Null()]),
    linkedTrendContext: Type.Union([Type.Unknown(), Type.Null()]),
    status: QAPIEventStatusSchema,
    closedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    closedById: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    closureEvidence: Type.Union([Type.String(), Type.Null()]),
    actionItems: Type.Array(QAPIActionItemSchema),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { $id: "QAPIEventResponse" },
);

export type QAPIEventResponseType = Static<typeof QAPIEventResponseSchema>;

export const QAPIEventListResponseSchema = Type.Object(
  {
    data: Type.Array(QAPIEventResponseSchema),
    total: Type.Integer(),
  },
  { $id: "QAPIEventListResponse" },
);

// ── Request bodies ────────────────────────────────────────────────────────────

export const QAPICreateBodySchema = Type.Object(
  {
    eventType: QAPIEventTypeSchema,
    patientId: Type.Optional(Type.String({ format: "uuid" })),
    occurredAt: Type.String({ format: "date-time" }),
    description: Type.String({ minLength: 1 }),
    rootCauseAnalysis: Type.Optional(Type.String()),
    linkedTrendContext: Type.Optional(Type.Unknown()),
  },
  { $id: "QAPICreateBody" },
);

export type QAPICreateBodyType = Static<typeof QAPICreateBodySchema>;

export const QAPIPatchBodySchema = Type.Object(
  {
    eventType: Type.Optional(QAPIEventTypeSchema),
    status: Type.Optional(
      Type.Union([Type.Literal("OPEN"), Type.Literal("IN_PROGRESS")]),
    ),
    description: Type.Optional(Type.String({ minLength: 1 })),
    rootCauseAnalysis: Type.Optional(Type.String()),
  },
  { $id: "QAPIPatchBody" },
);

export type QAPIPatchBodyType = Static<typeof QAPIPatchBodySchema>;

export const QAPICloseBodySchema = Type.Object(
  {
    closureEvidence: Type.String({ minLength: 50 }),
  },
  { $id: "QAPICloseBody" },
);

export type QAPICloseBodyType = Static<typeof QAPICloseBodySchema>;

export const QAPIAddActionItemBodySchema = Type.Object(
  {
    action: Type.String({ minLength: 1 }),
    assignedToId: Type.String({ format: "uuid" }),
    dueDate: Type.String({ format: "date" }),
  },
  { $id: "QAPIAddActionItemBody" },
);

export type QAPIAddActionItemBodyType = Static<typeof QAPIAddActionItemBodySchema>;

export const QAPICompleteActionItemBodySchema = Type.Object(
  {},
  { $id: "QAPICompleteActionItemBody" },
);

export const QAPIListQuerySchema = Type.Object(
  {
    status: Type.Optional(QAPIEventStatusSchema),
    eventType: Type.Optional(QAPIEventTypeSchema),
    locationId: Type.Optional(Type.String({ format: "uuid" })),
    from: Type.Optional(Type.String({ format: "date" })),
    to: Type.Optional(Type.String({ format: "date" })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100 })),
    offset: Type.Optional(Type.Integer({ minimum: 0 })),
  },
  { $id: "QAPIListQuery" },
);

export type QAPIListQueryType = Static<typeof QAPIListQuerySchema>;

// ── Clinician scorecard ───────────────────────────────────────────────────────

export const ClinicianQualityScorecardSchema = Type.Object(
  {
    clinicianId: Type.String({ format: "uuid" }),
    clinicianName: Type.String(),
    discipline: QAPIDisciplineSchema,
    period: Type.Object({ from: Type.String(), to: Type.String() }),
    totalNotes: Type.Integer(),
    firstPassApprovalRate: Type.Number(),
    averageRevisionCount: Type.Number(),
    medianTurnaroundHours: Type.Number(),
    overdueReviewRate: Type.Number(),
    billingImpactRate: Type.Number(),
    complianceImpactRate: Type.Number(),
    deficiencyBreakdown: Type.Record(Type.String(), Type.Integer()),
    commonDeficiencyTypes: Type.Array(
      Type.Object({ type: Type.String(), count: Type.Integer() }),
    ),
    revisionTrend: Type.Array(
      Type.Object({ week: Type.String(), count: Type.Integer() }),
    ),
  },
  { $id: "ClinicianQualityScorecard" },
);

export type ClinicianQualityScorecardType = Static<typeof ClinicianQualityScorecardSchema>;

export const ScorecardListResponseSchema = Type.Object(
  {
    data: Type.Array(ClinicianQualityScorecardSchema),
    period: Type.Object({ from: Type.String(), to: Type.String() }),
  },
  { $id: "ScorecardListResponse" },
);

export const ScorecardQuerySchema = Type.Object(
  {
    locationId: Type.Optional(Type.String({ format: "uuid" })),
    discipline: Type.Optional(QAPIDisciplineSchema),
    from: Type.Optional(Type.String({ format: "date" })),
    to: Type.Optional(Type.String({ format: "date" })),
  },
  { $id: "ScorecardQuery" },
);

export type ScorecardQueryType = Static<typeof ScorecardQuerySchema>;

// ── Deficiency trend ──────────────────────────────────────────────────────────

export const DeficiencyTrendPointSchema = Type.Object(
  {
    week: Type.String(),
    byType: Type.Record(Type.String(), Type.Integer()),
    totalDeficiencies: Type.Integer(),
    firstPassRate: Type.Number(),
  },
  { $id: "DeficiencyTrendPoint" },
);

export type DeficiencyTrendPointType = Static<typeof DeficiencyTrendPointSchema>;

export const DeficiencyTrendReportSchema = Type.Object(
  {
    locationId: Type.Union([Type.String(), Type.Null()]),
    discipline: Type.Union([Type.String(), Type.Null()]),
    period: Type.Object({ from: Type.String(), to: Type.String() }),
    topDeficiencyTypes: Type.Array(
      Type.Object({ type: Type.String(), count: Type.Integer() }),
    ),
    trend: Type.Array(DeficiencyTrendPointSchema),
    branchComparison: Type.Array(
      Type.Object({
        locationId: Type.String(),
        locationName: Type.String(),
        firstPassRate: Type.Number(),
        totalDeficiencies: Type.Integer(),
      }),
    ),
    disciplineComparison: Type.Array(
      Type.Object({
        discipline: Type.String(),
        firstPassRate: Type.Number(),
        topDeficiency: Type.String(),
      }),
    ),
    branchDisciplineMatrix: Type.Array(
      Type.Object({
        locationId: Type.String(),
        discipline: Type.String(),
        firstPassRate: Type.Number(),
        deficiencyCount: Type.Integer(),
      }),
    ),
    reviewerWorkload: Type.Array(
      Type.Object({
        reviewerId: Type.String(),
        reviewerName: Type.String(),
        assigned: Type.Integer(),
        resolved: Type.Integer(),
        overdueCount: Type.Integer(),
      }),
    ),
  },
  { $id: "DeficiencyTrendReport" },
);

export type DeficiencyTrendReportType = Static<typeof DeficiencyTrendReportSchema>;

export const TrendQuerySchema = Type.Object(
  {
    locationId: Type.Optional(Type.String({ format: "uuid" })),
    discipline: Type.Optional(QAPIDisciplineSchema),
    from: Type.Optional(Type.String({ format: "date" })),
    to: Type.Optional(Type.String({ format: "date" })),
    deficiencyType: Type.Optional(Type.String()),
  },
  { $id: "TrendQuery" },
);

export type TrendQueryType = Static<typeof TrendQuerySchema>;

// ── Quality outlier ───────────────────────────────────────────────────────────

export const QualityOutlierSchema = Type.Object(
  {
    subjectType: Type.Union([
      Type.Literal("CLINICIAN"),
      Type.Literal("BRANCH"),
      Type.Literal("DISCIPLINE"),
    ]),
    subjectId: Type.String(),
    subjectName: Type.String(),
    metric: Type.String(),
    value: Type.Number(),
    threshold: Type.Number(),
    detectedAt: Type.String({ format: "date-time" }),
  },
  { $id: "QualityOutlier" },
);

export type QualityOutlierType = Static<typeof QualityOutlierSchema>;

export const QualityOutlierListResponseSchema = Type.Object(
  {
    data: Type.Array(QualityOutlierSchema),
    period: Type.Object({ from: Type.String(), to: Type.String() }),
  },
  { $id: "QualityOutlierListResponse" },
);
