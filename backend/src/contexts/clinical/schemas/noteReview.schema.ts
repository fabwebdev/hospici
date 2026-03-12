/**
 * NoteReview schemas — TypeBox definitions for T2-9.
 * Validators compiled in typebox-compiler.ts (never here).
 */

import { type Static, Type } from "@sinclair/typebox";

// ── Enums ──────────────────────────────────────────────────────────────────────

export const NoteReviewStatusSchema = Type.Union(
  [
    Type.Literal("PENDING"),
    Type.Literal("IN_REVIEW"),
    Type.Literal("REVISION_REQUESTED"),
    Type.Literal("RESUBMITTED"),
    Type.Literal("APPROVED"),
    Type.Literal("LOCKED"),
    Type.Literal("ESCALATED"),
  ],
  { $id: "NoteReviewStatus" },
);

export const DeficiencyTypeSchema = Type.Union(
  [
    Type.Literal("CLINICAL_SUPPORT"),
    Type.Literal("COMPLIANCE_MISSING"),
    Type.Literal("SIGNATURE_MISSING"),
    Type.Literal("CARE_PLAN_MISMATCH"),
    Type.Literal("VISIT_FREQUENCY_MISMATCH"),
    Type.Literal("MEDICATION_ISSUE"),
    Type.Literal("HOPE_RELATED"),
    Type.Literal("BILLING_IMPACT"),
  ],
  { $id: "DeficiencyType" },
);

export const RevisionSeveritySchema = Type.Union([
  Type.Literal("low"),
  Type.Literal("medium"),
  Type.Literal("high"),
]);

// ── RevisionRequest ────────────────────────────────────────────────────────────

export const RevisionRequestSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    deficiencyType: DeficiencyTypeSchema,
    comment: Type.String({ minLength: 1 }),
    severity: RevisionSeveritySchema,
    dueBy: Type.String({ format: "date" }),
    resolvedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    resolvedComment: Type.Union([Type.String(), Type.Null()]),
  },
  { $id: "RevisionRequest" },
);

export type RevisionRequestType = Static<typeof RevisionRequestSchema>;

// ── ReviewQueueItem ────────────────────────────────────────────────────────────

export const ReviewQueueItemSchema = Type.Object(
  {
    encounterId: Type.String({ format: "uuid" }),
    patientId: Type.String({ format: "uuid" }),
    patientName: Type.String(),
    locationId: Type.String({ format: "uuid" }),
    clinicianId: Type.String({ format: "uuid" }),
    visitType: Type.String(),
    visitedAt: Type.String({ format: "date-time" }),
    reviewStatus: NoteReviewStatusSchema,
    reviewerId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    reviewedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    escalatedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    escalationReason: Type.Union([Type.String(), Type.Null()]),
    revisionRequests: Type.Array(RevisionRequestSchema),
    priority: Type.Integer({ minimum: 0, maximum: 2 }),
    assignedReviewerId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    dueBy: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    billingImpact: Type.Boolean(),
    complianceImpact: Type.Boolean(),
    firstPassApproved: Type.Boolean(),
    revisionCount: Type.Integer({ minimum: 0 }),
    vantageChartDraft: Type.Union([Type.String(), Type.Null()]),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { $id: "ReviewQueueItem" },
);

export const ReviewQueueResponseSchema = Type.Object(
  {
    data: Type.Array(ReviewQueueItemSchema),
    total: Type.Integer(),
  },
  { $id: "ReviewQueueResponse" },
);

export type ReviewQueueItemType = Static<typeof ReviewQueueItemSchema>;
export type ReviewQueueResponseType = Static<typeof ReviewQueueResponseSchema>;

// ── Request bodies ────────────────────────────────────────────────────────────

export const SubmitReviewBodySchema = Type.Object(
  {
    status: NoteReviewStatusSchema,
    revisionRequests: Type.Optional(Type.Array(RevisionRequestSchema)),
    escalationReason: Type.Optional(Type.String({ minLength: 1 })),
  },
  { $id: "SubmitReviewBody" },
);

export type SubmitReviewBodyType = Static<typeof SubmitReviewBodySchema>;

export const AssignReviewBodySchema = Type.Object(
  {
    assignedReviewerId: Type.String({ format: "uuid" }),
    priority: Type.Optional(Type.Integer({ minimum: 0, maximum: 2 })),
    dueBy: Type.Optional(Type.String({ format: "date-time" })),
  },
  { $id: "AssignReviewBody" },
);

export type AssignReviewBodyType = Static<typeof AssignReviewBodySchema>;

export const EscalateReviewBodySchema = Type.Object(
  {
    escalationReason: Type.String({ minLength: 1 }),
  },
  { $id: "EscalateReviewBody" },
);

export type EscalateReviewBodyType = Static<typeof EscalateReviewBodySchema>;

export const BulkAcknowledgeBodySchema = Type.Object(
  {
    encounterIds: Type.Array(Type.String({ format: "uuid" }), { minItems: 1 }),
  },
  { $id: "BulkAcknowledgeBody" },
);

export type BulkAcknowledgeBodyType = Static<typeof BulkAcknowledgeBodySchema>;

// ── Review history entry ──────────────────────────────────────────────────────

export const ReviewHistoryEntrySchema = Type.Object(
  {
    timestamp: Type.String({ format: "date-time" }),
    fromStatus: Type.Union([NoteReviewStatusSchema, Type.Null()]),
    toStatus: NoteReviewStatusSchema,
    actorId: Type.String({ format: "uuid" }),
    revisionRequests: Type.Array(RevisionRequestSchema),
    escalationReason: Type.Union([Type.String(), Type.Null()]),
    /** Snapshot of the draft at this point in time */
    draftSnapshot: Type.Union([Type.String(), Type.Null()]),
  },
  { $id: "ReviewHistoryEntry" },
);

export const ReviewHistoryResponseSchema = Type.Object(
  {
    encounterId: Type.String({ format: "uuid" }),
    currentStatus: NoteReviewStatusSchema,
    currentDraft: Type.Union([Type.String(), Type.Null()]),
    history: Type.Array(ReviewHistoryEntrySchema),
  },
  { $id: "ReviewHistoryResponse" },
);

export type ReviewHistoryResponseType = Static<typeof ReviewHistoryResponseSchema>;

// ── Query params ──────────────────────────────────────────────────────────────

export const ReviewQueueQuerySchema = Type.Object(
  {
    status: Type.Optional(NoteReviewStatusSchema),
    priority: Type.Optional(Type.Integer({ minimum: 0, maximum: 2 })),
    assignedReviewerId: Type.Optional(Type.String({ format: "uuid" })),
    billingImpact: Type.Optional(Type.Boolean()),
    complianceImpact: Type.Optional(Type.Boolean()),
    discipline: Type.Optional(Type.String()),
    patientId: Type.Optional(Type.String({ format: "uuid" })),
  },
  { $id: "ReviewQueueQuery" },
);

export type ReviewQueueQueryType = Static<typeof ReviewQueueQuerySchema>;
