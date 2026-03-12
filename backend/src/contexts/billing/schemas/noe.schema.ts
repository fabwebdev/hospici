// contexts/billing/schemas/noe.schema.ts
// T3-2a: NOE/NOTR Filing Workbench — TypeBox schemas
// All schemas are type-only exports; validators compiled in typebox-compiler.ts

import { type Static, Type } from "@sinclair/typebox";

// ── Enums ──────────────────────────────────────────────────────────────────────

export const NoticeFilingStatusSchema = Type.Union([
  Type.Literal("draft"),
  Type.Literal("ready_for_submission"),
  Type.Literal("submitted"),
  Type.Literal("accepted"),
  Type.Literal("rejected"),
  Type.Literal("needs_correction"),
  Type.Literal("late_pending_override"),
  Type.Literal("voided"),
  Type.Literal("closed"),
]);

export type NoticeFilingStatus = Static<typeof NoticeFilingStatusSchema>;

// ── NOE Schemas ────────────────────────────────────────────────────────────────

export const CreateNOEBodySchema = Type.Object(
  {
    electionDate: Type.String({ format: "date" }),
  },
  { additionalProperties: false },
);

export type CreateNOEBody = Static<typeof CreateNOEBodySchema>;

export const NOEResponseSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    patientId: Type.String({ format: "uuid" }),
    locationId: Type.String({ format: "uuid" }),
    status: NoticeFilingStatusSchema,
    electionDate: Type.String({ format: "date" }),
    deadlineDate: Type.String({ format: "date" }),
    isLate: Type.Boolean(),
    lateReason: Type.Union([Type.String(), Type.Null()]),
    overrideApprovedBy: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    overrideApprovedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    overrideReason: Type.Union([Type.String(), Type.Null()]),
    submittedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    submittedByUserId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    responseCode: Type.Union([Type.String(), Type.Null()]),
    responseMessage: Type.Union([Type.String(), Type.Null()]),
    attemptCount: Type.Integer({ minimum: 1 }),
    correctedFromId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    isClaimBlocking: Type.Boolean(),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

export type NOEResponse = Static<typeof NOEResponseSchema>;

export const NOEWithHistoryResponseSchema = Type.Object(
  {
    noe: NOEResponseSchema,
    history: Type.Array(
      Type.Object({
        event: Type.String(),
        timestamp: Type.String({ format: "date-time" }),
        userId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
        details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
      }),
    ),
  },
  { additionalProperties: false },
);

export type NOEWithHistoryResponse = Static<typeof NOEWithHistoryResponseSchema>;

export const CMSResponseBodySchema = Type.Object(
  {
    responseCode: Type.String({ minLength: 1, maxLength: 20 }),
    responseMessage: Type.String({ minLength: 1 }),
    accepted: Type.Boolean(),
  },
  { additionalProperties: false },
);

export type CMSResponseBody = Static<typeof CMSResponseBodySchema>;

export const CorrectNOEBodySchema = Type.Object(
  {
    electionDate: Type.String({ format: "date" }),
    lateReason: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export type CorrectNOEBody = Static<typeof CorrectNOEBodySchema>;

export const LateOverrideBodySchema = Type.Object(
  {
    overrideReason: Type.String({ minLength: 20 }),
  },
  { additionalProperties: false },
);

export type LateOverrideBody = Static<typeof LateOverrideBodySchema>;

export const ReadinessCheckItemSchema = Type.Object({
  check: Type.String(),
  passed: Type.Boolean(),
  message: Type.Optional(Type.String()),
});

export const ReadinessResponseSchema = Type.Object(
  {
    ready: Type.Boolean(),
    checklist: Type.Array(ReadinessCheckItemSchema),
  },
  { additionalProperties: false },
);

export type ReadinessResponse = Static<typeof ReadinessResponseSchema>;

export const FilingHistoryEventSchema = Type.Object({
  event: Type.String(),
  timestamp: Type.String({ format: "date-time" }),
  userId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  details: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

export type FilingHistoryEvent = Static<typeof FilingHistoryEventSchema>;

export const FilingHistoryResponseSchema = Type.Object(
  {
    events: Type.Array(FilingHistoryEventSchema),
  },
  { additionalProperties: false },
);

export type FilingHistoryResponse = Static<typeof FilingHistoryResponseSchema>;

// ── NOTR Schemas ───────────────────────────────────────────────────────────────

export const RevocationReasonSchema = Type.Union([
  Type.Literal("patient_revoked"),
  Type.Literal("patient_transferred"),
  Type.Literal("patient_deceased"),
  Type.Literal("patient_no_longer_eligible"),
  Type.Literal("other"),
]);

export type RevocationReason = Static<typeof RevocationReasonSchema>;

export const CreateNOTRBodySchema = Type.Object(
  {
    revocationDate: Type.String({ format: "date" }),
    revocationReason: RevocationReasonSchema,
    receivingHospiceId: Type.Optional(Type.String({ maxLength: 20 })),
    receivingHospiceName: Type.Optional(Type.String()),
    transferDate: Type.Optional(Type.String({ format: "date" })),
  },
  { additionalProperties: false },
);

export type CreateNOTRBody = Static<typeof CreateNOTRBodySchema>;

export const NOTRResponseSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    noeId: Type.String({ format: "uuid" }),
    patientId: Type.String({ format: "uuid" }),
    locationId: Type.String({ format: "uuid" }),
    status: NoticeFilingStatusSchema,
    revocationDate: Type.String({ format: "date" }),
    revocationReason: Type.String(),
    deadlineDate: Type.String({ format: "date" }),
    isLate: Type.Boolean(),
    lateReason: Type.Union([Type.String(), Type.Null()]),
    overrideApprovedBy: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    overrideApprovedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    overrideReason: Type.Union([Type.String(), Type.Null()]),
    receivingHospiceId: Type.Union([Type.String(), Type.Null()]),
    receivingHospiceName: Type.Union([Type.String(), Type.Null()]),
    transferDate: Type.Union([Type.String({ format: "date" }), Type.Null()]),
    submittedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    submittedByUserId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    responseCode: Type.Union([Type.String(), Type.Null()]),
    responseMessage: Type.Union([Type.String(), Type.Null()]),
    attemptCount: Type.Integer({ minimum: 1 }),
    correctedFromId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    isClaimBlocking: Type.Boolean(),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

export type NOTRResponse = Static<typeof NOTRResponseSchema>;

// ── Filing Queue Schemas ───────────────────────────────────────────────────────

export const FilingQueueItemSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    type: Type.Union([Type.Literal("NOE"), Type.Literal("NOTR")]),
    patientId: Type.String({ format: "uuid" }),
    locationId: Type.String({ format: "uuid" }),
    status: NoticeFilingStatusSchema,
    deadlineDate: Type.String({ format: "date" }),
    isLate: Type.Boolean(),
    isClaimBlocking: Type.Boolean(),
    attemptCount: Type.Integer({ minimum: 1 }),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

export type FilingQueueItem = Static<typeof FilingQueueItemSchema>;

export const FilingQueueResponseSchema = Type.Object(
  {
    data: Type.Array(FilingQueueItemSchema),
    total: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export type FilingQueueResponse = Static<typeof FilingQueueResponseSchema>;

export const FilingQueueQuerySchema = Type.Object(
  {
    status: Type.Optional(NoticeFilingStatusSchema),
    type: Type.Optional(Type.Union([Type.Literal("NOE"), Type.Literal("NOTR")])),
    isLate: Type.Optional(Type.Boolean()),
    isClaimBlocking: Type.Optional(Type.Boolean()),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 50 })),
    offset: Type.Optional(Type.Integer({ minimum: 0, default: 0 })),
  },
  { additionalProperties: false },
);

export type FilingQueueQuery = Static<typeof FilingQueueQuerySchema>;
