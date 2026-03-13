/**
 * ERA 835 TypeBox schemas — T3-7b
 *
 * Do NOT call TypeCompiler.Compile() here.
 * All compilation happens in src/config/typebox-compiler.ts.
 */

import { type Static, Type } from "@sinclair/typebox";

// ── Reusable sub-schemas ───────────────────────────────────────────────────────

const AdjustmentReasonCodeSchema = Type.Object({
  groupCode: Type.String({ description: "CO | PR | OA | PI" }),
  reasonCode: Type.String(),
  amount: Type.Number({ minimum: 0 }),
  quantity: Type.Optional(Type.Number()),
});

const SvcLoopSchema = Type.Object({
  serviceDate: Type.Optional(Type.String()),
  procedureCode: Type.Optional(Type.String()),
  submittedAmount: Type.Number({ minimum: 0 }),
  paidAmount: Type.Number({ minimum: 0 }),
  adjustments: Type.Array(AdjustmentReasonCodeSchema),
});

// ── Main entity schemas ────────────────────────────────────────────────────────

export const Remittance835Schema = Type.Object({
  id: Type.String({ format: "uuid" }),
  locationId: Type.String({ format: "uuid" }),
  payerName: Type.String(),
  payerId: Type.Union([Type.String(), Type.Null()]),
  checkNumber: Type.Union([Type.String(), Type.Null()]),
  eftNumber: Type.Union([Type.String(), Type.Null()]),
  paymentDate: Type.Union([Type.String(), Type.Null()]),
  totalPaymentAmount: Type.Union([Type.String(), Type.Null()]),
  rawFileHash: Type.String(),
  status: Type.Union([
    Type.Literal("RECEIVED"),
    Type.Literal("PARSED"),
    Type.Literal("POSTED"),
    Type.Literal("PARTIAL"),
    Type.Literal("FAILED"),
    Type.Literal("RECONCILED"),
  ]),
  ingestedAt: Type.String(),
  reconciledAt: Type.Union([Type.String(), Type.Null()]),
});
export type Remittance835 = Static<typeof Remittance835Schema>;

export const RemittancePostingSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  remittanceId: Type.String({ format: "uuid" }),
  claimId: Type.String({ format: "uuid" }),
  locationId: Type.String({ format: "uuid" }),
  claimIcn: Type.Union([Type.String(), Type.Null()]),
  payerClaimNumber: Type.Union([Type.String(), Type.Null()]),
  patientControlNumber: Type.Union([Type.String(), Type.Null()]),
  paidAmount: Type.String(),
  contractualAdjustment: Type.String(),
  patientResponsibility: Type.String(),
  otherAdjustment: Type.String(),
  adjustmentReasonCodes: Type.Array(AdjustmentReasonCodeSchema),
  svcLoops: Type.Array(SvcLoopSchema),
  postingState: Type.Union([
    Type.Literal("PENDING"),
    Type.Literal("APPLIED"),
    Type.Literal("REVERSED"),
  ]),
  postedAt: Type.Union([Type.String(), Type.Null()]),
  reversedAt: Type.Union([Type.String(), Type.Null()]),
  reversedBy: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  createdAt: Type.String(),
});
export type RemittancePosting = Static<typeof RemittancePostingSchema>;

export const UnmatchedRemittanceSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  remittanceId: Type.String({ format: "uuid" }),
  locationId: Type.String({ format: "uuid" }),
  rawClpData: Type.Record(Type.String(), Type.Unknown()),
  matchAttemptDetails: Type.Record(Type.String(), Type.Unknown()),
  patientControlNumber: Type.Union([Type.String(), Type.Null()]),
  payerClaimNumber: Type.Union([Type.String(), Type.Null()]),
  paidAmount: Type.Union([Type.String(), Type.Null()]),
  assignedTo: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  resolvedAt: Type.Union([Type.String(), Type.Null()]),
  resolvedBy: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  matchedClaimId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  createdAt: Type.String(),
  updatedAt: Type.String(),
});
export type UnmatchedRemittance = Static<typeof UnmatchedRemittanceSchema>;

// ── Request body schemas ───────────────────────────────────────────────────────

export const IngestERABodySchema = Type.Object({
  /** Base64-encoded raw 835 EDI content */
  raw835: Type.String({ minLength: 1 }),
  payerName: Type.String({ minLength: 1 }),
  locationId: Type.String({ format: "uuid" }),
});
export type IngestERABody = Static<typeof IngestERABodySchema>;

export const ManualMatchBodySchema = Type.Object({
  claimId: Type.String({ format: "uuid" }),
  note: Type.Optional(Type.String()),
});
export type ManualMatchBody = Static<typeof ManualMatchBodySchema>;

export const ManualPostBodySchema = Type.Object({
  note: Type.Optional(Type.String()),
});
export type ManualPostBody = Static<typeof ManualPostBodySchema>;

// ── List query schema ──────────────────────────────────────────────────────────

export const RemittanceListQuerySchema = Type.Object({
  payerId: Type.Optional(Type.String()),
  status: Type.Optional(
    Type.Union([
      Type.Literal("RECEIVED"),
      Type.Literal("PARSED"),
      Type.Literal("POSTED"),
      Type.Literal("PARTIAL"),
      Type.Literal("FAILED"),
      Type.Literal("RECONCILED"),
    ]),
  ),
  fromDate: Type.Optional(Type.String()),
  toDate: Type.Optional(Type.String()),
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  pageSize: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 25 })),
});
export type RemittanceListQuery = Static<typeof RemittanceListQuerySchema>;

// ── Response schemas ───────────────────────────────────────────────────────────

export const RemittanceListResponseSchema = Type.Object({
  data: Type.Array(Remittance835Schema),
  total: Type.Integer(),
});

export const Remittance835DetailSchema = Type.Intersect([
  Remittance835Schema,
  Type.Object({
    postings: Type.Array(RemittancePostingSchema),
    unmatchedItems: Type.Array(UnmatchedRemittanceSchema),
  }),
]);

export const UnmatchedRemittanceListResponseSchema = Type.Object({
  data: Type.Array(UnmatchedRemittanceSchema),
  total: Type.Integer(),
});

export const IngestERAResultSchema = Type.Object({
  remittanceId: Type.String({ format: "uuid" }),
  matched: Type.Integer(),
  unmatched: Type.Integer(),
  status: Type.Union([
    Type.Literal("RECEIVED"),
    Type.Literal("PARSED"),
    Type.Literal("POSTED"),
    Type.Literal("PARTIAL"),
    Type.Literal("FAILED"),
    Type.Literal("RECONCILED"),
  ]),
});

export const ClaimRemittanceResponseSchema = Type.Object({
  postings: Type.Array(RemittancePostingSchema),
  totalPaid: Type.String(),
  totalContractualAdjustment: Type.String(),
  totalPatientResponsibility: Type.String(),
});
