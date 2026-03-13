/**
 * chartAudit.schema.ts — TypeBox definitions for T3-13 Chart Audit Mode.
 * Validators compiled in typebox-compiler.ts (never here).
 */

import { type Static, Type } from "@sinclair/typebox";

// ── Enums ──────────────────────────────────────────────────────────────────────

export const ReviewAuditStatusSchema = Type.Union(
  [
    Type.Literal("NOT_STARTED"),
    Type.Literal("IN_PROGRESS"),
    Type.Literal("COMPLETE"),
    Type.Literal("FLAGGED"),
  ],
  { $id: "ReviewAuditStatus" },
);

export const ViewScopeSchema = Type.Union(
  [Type.Literal("note_review"), Type.Literal("chart_audit")],
  { $id: "ViewScope" },
);

export const MissingDocSeveritySchema = Type.Union(
  [Type.Literal("critical"), Type.Literal("warning")],
  { $id: "MissingDocSeverity" },
);

// ── ChecklistItem ──────────────────────────────────────────────────────────────

export const ChecklistItemSchema = Type.Object(
  {
    id: Type.String(),
    label: Type.String({ minLength: 1 }),
    required: Type.Boolean(),
    regulatoryRef: Type.Optional(Type.String()),
    scoringWeight: Type.Optional(Type.Number({ minimum: 0, maximum: 1 })),
  },
  { $id: "ChecklistItem" },
);

export type ChecklistItemType = Static<typeof ChecklistItemSchema>;

// ── ChecklistResponse (stored per encounter) ──────────────────────────────────

export const ChecklistResponseSchema = Type.Object(
  {
    itemId: Type.String(),
    checked: Type.Boolean(),
    reviewerId: Type.String({ format: "uuid" }),
    timestamp: Type.String({ format: "date-time" }),
    templateVersion: Type.Integer({ minimum: 1 }),
  },
  { $id: "ChecklistResponse" },
);

export type ChecklistResponseType = Static<typeof ChecklistResponseSchema>;

// ── ReviewChecklistTemplate ────────────────────────────────────────────────────

export const ReviewChecklistTemplateSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    locationId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    discipline: Type.String(),
    visitType: Type.String(),
    items: Type.Array(ChecklistItemSchema),
    version: Type.Integer({ minimum: 1 }),
    isActive: Type.Boolean(),
    effectiveDate: Type.String({ format: "date" }),
    createdById: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { $id: "ReviewChecklistTemplate" },
);

export type ReviewChecklistTemplateType = Static<typeof ReviewChecklistTemplateSchema>;

export const ReviewChecklistTemplateListResponseSchema = Type.Object(
  {
    data: Type.Array(ReviewChecklistTemplateSchema),
    total: Type.Integer(),
  },
  { $id: "ReviewChecklistTemplateListResponse" },
);

// ── ReviewQueueView ────────────────────────────────────────────────────────────

export const SortConfigSchema = Type.Object(
  {
    sortBy: Type.String(),
    sortDir: Type.Union([Type.Literal("asc"), Type.Literal("desc")]),
  },
  { $id: "SortConfig" },
);

export const ColumnConfigSchema = Type.Object(
  {
    visibleColumns: Type.Array(Type.String()),
    columnOrder: Type.Array(Type.String()),
  },
  { $id: "ColumnConfig" },
);

export const ReviewQueueViewSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    ownerId: Type.String({ format: "uuid" }),
    locationId: Type.String({ format: "uuid" }),
    name: Type.String({ minLength: 1 }),
    viewScope: ViewScopeSchema,
    filters: Type.Record(Type.String(), Type.Unknown()),
    sortConfig: SortConfigSchema,
    columnConfig: ColumnConfigSchema,
    groupBy: Type.Union([Type.String(), Type.Null()]),
    isShared: Type.Boolean(),
    isPinned: Type.Boolean(),
    isDefault: Type.Boolean(),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { $id: "ReviewQueueView" },
);

export type ReviewQueueViewType = Static<typeof ReviewQueueViewSchema>;

export const ReviewQueueViewListResponseSchema = Type.Object(
  {
    data: Type.Array(ReviewQueueViewSchema),
    total: Type.Integer(),
  },
  { $id: "ReviewQueueViewListResponse" },
);

export const CreateReviewQueueViewBodySchema = Type.Object(
  {
    name: Type.String({ minLength: 1 }),
    viewScope: ViewScopeSchema,
    filters: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    sortConfig: Type.Optional(SortConfigSchema),
    columnConfig: Type.Optional(ColumnConfigSchema),
    groupBy: Type.Optional(Type.String()),
    isShared: Type.Optional(Type.Boolean()),
    isPinned: Type.Optional(Type.Boolean()),
    isDefault: Type.Optional(Type.Boolean()),
  },
  { $id: "CreateReviewQueueViewBody" },
);

export type CreateReviewQueueViewBodyType = Static<typeof CreateReviewQueueViewBodySchema>;

export const PatchReviewQueueViewBodySchema = Type.Object(
  {
    name: Type.Optional(Type.String({ minLength: 1 })),
    filters: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
    sortConfig: Type.Optional(SortConfigSchema),
    columnConfig: Type.Optional(ColumnConfigSchema),
    groupBy: Type.Optional(Type.Union([Type.String(), Type.Null()])),
    isShared: Type.Optional(Type.Boolean()),
    isPinned: Type.Optional(Type.Boolean()),
    isDefault: Type.Optional(Type.Boolean()),
  },
  { $id: "PatchReviewQueueViewBody" },
);

export type PatchReviewQueueViewBodyType = Static<typeof PatchReviewQueueViewBodySchema>;

// ── Chart Audit Queue ──────────────────────────────────────────────────────────

export const ChartAuditQueueRowSchema = Type.Object(
  {
    patientId: Type.String({ format: "uuid" }),
    patientName: Type.String(),
    primaryDiscipline: Type.String(),
    reviewStatus: ReviewAuditStatusSchema,
    missingDocCount: Type.Integer({ minimum: 0 }),
    surveyReadinessScore: Type.Number({ minimum: 0, maximum: 100 }),
    assignedReviewerId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    assignedReviewerName: Type.Union([Type.String(), Type.Null()]),
    lastActivityAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    billingImpact: Type.Boolean(),
    complianceImpact: Type.Boolean(),
  },
  { $id: "ChartAuditQueueRow" },
);

export type ChartAuditQueueRowType = Static<typeof ChartAuditQueueRowSchema>;

export const ChartAuditQueueResponseSchema = Type.Object(
  {
    data: Type.Array(ChartAuditQueueRowSchema),
    total: Type.Integer(),
    page: Type.Integer(),
    limit: Type.Integer(),
  },
  { $id: "ChartAuditQueueResponse" },
);

export type ChartAuditQueueResponseType = Static<typeof ChartAuditQueueResponseSchema>;

// ── Chart Audit Dashboard ──────────────────────────────────────────────────────

export const ChartAuditDashboardResponseSchema = Type.Object(
  {
    total: Type.Integer(),
    byStatus: Type.Object({
      NOT_STARTED: Type.Integer(),
      IN_PROGRESS: Type.Integer(),
      COMPLETE: Type.Integer(),
      FLAGGED: Type.Integer(),
    }),
    byDiscipline: Type.Record(Type.String(), Type.Integer()),
    byReviewer: Type.Array(
      Type.Object({
        reviewerId: Type.String({ format: "uuid" }),
        name: Type.String(),
        count: Type.Integer(),
      }),
    ),
    bySeverity: Type.Object({
      critical: Type.Integer(),
      warning: Type.Integer(),
    }),
    avgSurveyReadinessScore: Type.Number({ minimum: 0, maximum: 100 }),
  },
  { $id: "ChartAuditDashboardResponse" },
);

export type ChartAuditDashboardResponseType = Static<typeof ChartAuditDashboardResponseSchema>;

// ── Missing Document ───────────────────────────────────────────────────────────

export const MissingDocumentSchema = Type.Object(
  {
    type: Type.String(),
    description: Type.String(),
    dueBy: Type.Union([Type.String(), Type.Null()]),
    severity: MissingDocSeveritySchema,
  },
  { $id: "MissingDocument" },
);

export type MissingDocumentType = Static<typeof MissingDocumentSchema>;

// ── Chart Audit Detail (single patient) ──────────────────────────────────────

export const ChartAuditDetailResponseSchema = Type.Object(
  {
    patientId: Type.String({ format: "uuid" }),
    auditDate: Type.String({ format: "date-time" }),
    sections: Type.Object({
      encounters: Type.Object({
        total: Type.Integer(),
        pending: Type.Integer(),
        approved: Type.Integer(),
        locked: Type.Integer(),
        overdue: Type.Integer(),
      }),
      hopeAssessments: Type.Object({
        required: Type.Integer(),
        filed: Type.Integer(),
        missing: Type.Array(Type.String()),
      }),
      noeNotr: Type.Object({
        noeStatus: Type.String(),
        notrRequired: Type.Boolean(),
        notrStatus: Type.Union([Type.String(), Type.Null()]),
      }),
      orders: Type.Object({
        total: Type.Integer(),
        unsigned: Type.Integer(),
        expired: Type.Integer(),
      }),
      signatures: Type.Object({
        required: Type.Integer(),
        obtained: Type.Integer(),
        missing: Type.Array(Type.String()),
      }),
      carePlan: Type.Object({
        present: Type.Boolean(),
        lastUpdated: Type.Union([Type.String(), Type.Null()]),
        disciplinesComplete: Type.Array(Type.String()),
      }),
      medications: Type.Object({
        active: Type.Integer(),
        unreconciled: Type.Integer(),
        teachingPending: Type.Integer(),
      }),
      idgMeetings: Type.Object({
        lastHeld: Type.Union([Type.String(), Type.Null()]),
        nextDue: Type.String(),
        overdue: Type.Boolean(),
      }),
    }),
    surveyReadiness: Type.Object({
      score: Type.Number({ minimum: 0, maximum: 100 }),
      blockers: Type.Array(Type.String()),
      warnings: Type.Array(Type.String()),
    }),
    missingDocuments: Type.Array(MissingDocumentSchema),
  },
  { $id: "ChartAuditDetailResponse" },
);

export type ChartAuditDetailResponseType = Static<typeof ChartAuditDetailResponseSchema>;

// ── Bulk Chart Audit Action ────────────────────────────────────────────────────

export const ChartBulkActionBodySchema = Type.Object(
  {
    patientIds: Type.Array(Type.String({ format: "uuid" }), { minItems: 1 }),
    action: Type.Union([
      Type.Literal("ASSIGN"),
      Type.Literal("REQUEST_REVISION"),
      Type.Literal("EXPORT_CSV"),
    ]),
    assignedReviewerId: Type.Optional(Type.String({ format: "uuid" })),
    revisionNote: Type.Optional(Type.String({ minLength: 1 })),
  },
  { $id: "ChartBulkActionBody" },
);

export type ChartBulkActionBodyType = Static<typeof ChartBulkActionBodySchema>;

export const ChartBulkActionResultSchema = Type.Object(
  {
    action: Type.String(),
    affected: Type.Integer(),
    patientIds: Type.Array(Type.String()),
  },
  { $id: "ChartBulkActionResult" },
);

// ── Note Review Bulk Action ────────────────────────────────────────────────────

export const ReviewQueueBulkActionBodySchema = Type.Object(
  {
    encounterIds: Type.Array(Type.String({ format: "uuid" }), { minItems: 1 }),
    action: Type.Union([
      Type.Literal("ASSIGN"),
      Type.Literal("REQUEST_REVISION"),
      Type.Literal("ACKNOWLEDGE"),
    ]),
    assignedReviewerId: Type.Optional(Type.String({ format: "uuid" })),
    revisionNote: Type.Optional(Type.String({ minLength: 1 })),
  },
  { $id: "ReviewQueueBulkActionBody" },
);

export type ReviewQueueBulkActionBodyType = Static<typeof ReviewQueueBulkActionBodySchema>;

export const ReviewQueueBulkActionResultSchema = Type.Object(
  {
    action: Type.String(),
    affected: Type.Integer(),
    encounterIds: Type.Array(Type.String()),
  },
  { $id: "ReviewQueueBulkActionResult" },
);

// ── Query schemas ──────────────────────────────────────────────────────────────

export const ChartAuditQueueQuerySchema = Type.Object(
  {
    locationId: Type.Optional(Type.String({ format: "uuid" })),
    discipline: Type.Optional(Type.String()),
    reviewerId: Type.Optional(Type.String({ format: "uuid" })),
    status: Type.Optional(ReviewAuditStatusSchema),
    deficiencyType: Type.Optional(Type.String()),
    billingImpact: Type.Optional(Type.Boolean()),
    complianceImpact: Type.Optional(Type.Boolean()),
    missingDocSeverity: Type.Optional(MissingDocSeveritySchema),
    dateRangeStart: Type.Optional(Type.String({ format: "date" })),
    dateRangeEnd: Type.Optional(Type.String({ format: "date" })),
    page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 25 })),
    sortBy: Type.Optional(Type.String()),
    sortDir: Type.Optional(Type.Union([Type.Literal("asc"), Type.Literal("desc")])),
    groupBy: Type.Optional(Type.String()),
  },
  { $id: "ChartAuditQueueQuery" },
);

export type ChartAuditQueueQueryType = Static<typeof ChartAuditQueueQuerySchema>;
