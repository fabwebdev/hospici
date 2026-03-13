// contexts/billing/schemas/claim.schema.ts
// T3-7a: Hospice Claim Lifecycle + 837i Generation — TypeBox schemas
// All schemas are type-only exports; validators compiled in typebox-compiler.ts

import { type Static, Type } from "@sinclair/typebox";

// ── State + enum schemas ───────────────────────────────────────────────────────

export const ClaimStateSchema = Type.Union([
  Type.Literal("DRAFT"),
  Type.Literal("NOT_READY"),
  Type.Literal("READY_FOR_AUDIT"),
  Type.Literal("AUDIT_FAILED"),
  Type.Literal("READY_TO_SUBMIT"),
  Type.Literal("QUEUED"),
  Type.Literal("SUBMITTED"),
  Type.Literal("ACCEPTED"),
  Type.Literal("REJECTED"),
  Type.Literal("DENIED"),
  Type.Literal("PAID"),
  Type.Literal("VOIDED"),
]);
export type ClaimState = Static<typeof ClaimStateSchema>;

export const ClaimBillTypeSchema = Type.Union([
  Type.Literal("original"),
  Type.Literal("replacement"),
  Type.Literal("void"),
]);
export type ClaimBillType = Static<typeof ClaimBillTypeSchema>;

export const BillHoldReasonSchema = Type.Union([
  Type.Literal("MANUAL_REVIEW"),
  Type.Literal("COMPLIANCE_BLOCK"),
  Type.Literal("MISSING_DOCUMENTATION"),
  Type.Literal("PAYER_INQUIRY"),
  Type.Literal("INTERNAL_AUDIT"),
  Type.Literal("SUPERVISOR_REVIEW"),
]);
export type BillHoldReason = Static<typeof BillHoldReasonSchema>;

// ── Claim line (revenue code line item) ───────────────────────────────────────

export const ClaimLineSchema = Type.Object(
  {
    revenueCode: Type.String({ minLength: 4, maxLength: 4 }), // e.g. "0651"
    hcpcsCode: Type.Union([Type.String(), Type.Null()]),
    serviceDate: Type.String({ format: "date" }),
    units: Type.Number({ minimum: 0 }),
    unitCharge: Type.Number({ minimum: 0 }),
    lineCharge: Type.Number({ minimum: 0 }),
    levelOfCare: Type.Union([
      Type.Literal("routine_home_care"),
      Type.Literal("continuous_home_care"),
      Type.Literal("inpatient_respite"),
      Type.Literal("general_inpatient"),
      Type.Null(),
    ]),
  },
  { additionalProperties: false },
);
export type ClaimLine = Static<typeof ClaimLineSchema>;

// ── Core claim schema ──────────────────────────────────────────────────────────

export const ClaimSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    patientId: Type.String({ format: "uuid" }),
    locationId: Type.String({ format: "uuid" }),
    payerId: Type.String(),
    benefitPeriodId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    billType: ClaimBillTypeSchema,
    statementFromDate: Type.String({ format: "date" }),
    statementToDate: Type.String({ format: "date" }),
    totalCharge: Type.String(), // numeric comes back as string from pg
    state: ClaimStateSchema,
    isOnHold: Type.Boolean(),
    correctedFromId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    claimLines: Type.Array(ClaimLineSchema),
    payloadHash: Type.Union([Type.String(), Type.Null()]),
    x12Hash: Type.Union([Type.String(), Type.Null()]),
    clearinghouseIcn: Type.Union([Type.String(), Type.Null()]),
    createdBy: Type.String({ format: "uuid" }),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type Claim = Static<typeof ClaimSchema>;

// ── ClaimRevision schema ───────────────────────────────────────────────────────

export const ClaimRevisionSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    claimId: Type.String({ format: "uuid" }),
    fromState: ClaimStateSchema,
    toState: ClaimStateSchema,
    reason: Type.Union([Type.String(), Type.Null()]),
    snapshot: Type.Unknown(),
    transitionedBy: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    transitionedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type ClaimRevision = Static<typeof ClaimRevisionSchema>;

// ── ClaimSubmission schema ─────────────────────────────────────────────────────

export const ClaimSubmissionSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    claimId: Type.String({ format: "uuid" }),
    batchId: Type.Union([Type.String(), Type.Null()]),
    responseCode: Type.Union([Type.String(), Type.Null()]),
    responseMessage: Type.Union([Type.String(), Type.Null()]),
    submittedAt: Type.String({ format: "date-time" }),
    responseReceivedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    jobId: Type.Union([Type.String(), Type.Null()]),
    attemptNumber: Type.Integer({ minimum: 1 }),
  },
  { additionalProperties: false },
);
export type ClaimSubmission = Static<typeof ClaimSubmissionSchema>;

// ── ClaimRejection schema ──────────────────────────────────────────────────────

export const ClaimRejectionSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    claimId: Type.String({ format: "uuid" }),
    claimSubmissionId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    loopId: Type.Union([Type.String(), Type.Null()]),
    segmentId: Type.Union([Type.String(), Type.Null()]),
    errorCode: Type.String(),
    errorDescription: Type.String(),
    fieldPosition: Type.Union([Type.String(), Type.Null()]),
    createdAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type ClaimRejection = Static<typeof ClaimRejectionSchema>;

// ── BillHold schema ────────────────────────────────────────────────────────────

export const BillHoldSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    claimId: Type.String({ format: "uuid" }),
    reason: BillHoldReasonSchema,
    holdNote: Type.Union([Type.String(), Type.Null()]),
    placedBy: Type.String({ format: "uuid" }),
    placedAt: Type.String({ format: "date-time" }),
    releasedBy: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    releasedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  },
  { additionalProperties: false },
);
export type BillHold = Static<typeof BillHoldSchema>;

// ── Request body schemas ───────────────────────────────────────────────────────

export const CreateClaimBodySchema = Type.Object(
  {
    patientId: Type.String({ format: "uuid" }),
    payerId: Type.String({ minLength: 1 }),
    benefitPeriodId: Type.Optional(Type.String({ format: "uuid" })),
    statementFromDate: Type.String({ format: "date" }),
    statementToDate: Type.String({ format: "date" }),
    claimLines: Type.Array(ClaimLineSchema, { minItems: 1 }),
  },
  { additionalProperties: false },
);
export type CreateClaimBody = Static<typeof CreateClaimBodySchema>;

export const HoldBodySchema = Type.Object(
  {
    reason: BillHoldReasonSchema,
    holdNote: Type.Optional(Type.String({ maxLength: 2000 })),
  },
  { additionalProperties: false },
);
export type HoldBody = Static<typeof HoldBodySchema>;

export const ReplaceClaimBodySchema = Type.Object(
  {
    payerId: Type.Optional(Type.String({ minLength: 1 })),
    statementFromDate: Type.Optional(Type.String({ format: "date" })),
    statementToDate: Type.Optional(Type.String({ format: "date" })),
    claimLines: Type.Optional(Type.Array(ClaimLineSchema, { minItems: 1 })),
    replacementReason: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);
export type ReplaceClaimBody = Static<typeof ReplaceClaimBodySchema>;

export const BulkSubmitBodySchema = Type.Object(
  {
    claimIds: Type.Array(Type.String({ format: "uuid" }), { minItems: 1 }),
  },
  { additionalProperties: false },
);
export type BulkSubmitBody = Static<typeof BulkSubmitBodySchema>;

export const ClaimListQuerySchema = Type.Object(
  {
    state: Type.Optional(ClaimStateSchema),
    payerId: Type.Optional(Type.String()),
    fromDate: Type.Optional(Type.String({ format: "date" })),
    toDate: Type.Optional(Type.String({ format: "date" })),
    isOnHold: Type.Optional(Type.Boolean()),
    patientId: Type.Optional(Type.String({ format: "uuid" })),
    benefitPeriodId: Type.Optional(Type.String({ format: "uuid" })),
    page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 25 })),
  },
  { additionalProperties: false },
);
export type ClaimListQuery = Static<typeof ClaimListQuerySchema>;

// ── Readiness result ───────────────────────────────────────────────────────────

export const ClaimReadinessResultSchema = Type.Object(
  {
    ready: Type.Boolean(),
    blockers: Type.Array(
      Type.Object(
        {
          code: Type.String(),
          message: Type.String(),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);
export type ClaimReadinessResult = Static<typeof ClaimReadinessResultSchema>;

// ── Response schemas ───────────────────────────────────────────────────────────

export const ClaimDetailResponseSchema = Type.Object(
  {
    success: Type.Literal(true),
    data: Type.Object(
      {
        claim: ClaimSchema,
        revisions: Type.Array(ClaimRevisionSchema),
        submissions: Type.Array(ClaimSubmissionSchema),
        rejections: Type.Array(ClaimRejectionSchema),
        activeHold: Type.Union([BillHoldSchema, Type.Null()]),
        readiness: ClaimReadinessResultSchema,
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export type ClaimDetailResponse = Static<typeof ClaimDetailResponseSchema>;

export const ClaimListResponseSchema = Type.Object(
  {
    success: Type.Literal(true),
    data: Type.Object(
      {
        claims: Type.Array(ClaimSchema),
        total: Type.Integer(),
        page: Type.Integer(),
        limit: Type.Integer(),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export type ClaimListResponse = Static<typeof ClaimListResponseSchema>;

export const BulkSubmitResponseSchema = Type.Object(
  {
    success: Type.Literal(true),
    data: Type.Object(
      {
        queued: Type.Array(Type.String({ format: "uuid" })),
        skipped: Type.Array(
          Type.Object(
            {
              claimId: Type.String({ format: "uuid" }),
              reason: Type.String(),
            },
            { additionalProperties: false },
          ),
        ),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export type BulkSubmitResponse = Static<typeof BulkSubmitResponseSchema>;
