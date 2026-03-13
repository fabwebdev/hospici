// contexts/billing/schemas/benefitPeriod.schema.ts
// Benefit Period Control System — T3-4
// TypeBox schemas only — validators compiled in typebox-compiler.ts

import { type Static, Type } from "@sinclair/typebox";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const BenefitPeriodStatusSchema = Type.Union([
  Type.Literal("current"),
  Type.Literal("upcoming"),
  Type.Literal("recert_due"),
  Type.Literal("at_risk"),
  Type.Literal("past_due"),
  Type.Literal("closed"),
  Type.Literal("revoked"),
  Type.Literal("transferred_out"),
  Type.Literal("concurrent_care"),
  Type.Literal("discharged"),
]);

export const BenefitPeriodRecertStatusSchema = Type.Union([
  Type.Literal("not_yet_due"),
  Type.Literal("ready_for_recert"),
  Type.Literal("pending_physician"),
  Type.Literal("completed"),
  Type.Literal("missed"),
]);

export const BenefitPeriodF2FStatusSchema = Type.Union([
  Type.Literal("not_required"),
  Type.Literal("not_yet_due"),
  Type.Literal("due_soon"),
  Type.Literal("documented"),
  Type.Literal("invalid"),
  Type.Literal("missing"),
  Type.Literal("recert_blocked"),
]);

export const BenefitPeriodAdmissionTypeSchema = Type.Union([
  Type.Literal("new_admission"),
  Type.Literal("hospice_to_hospice_transfer"),
  Type.Literal("revocation_readmission"),
]);

// ── Core period schema ────────────────────────────────────────────────────────

export const CorrectionEntrySchema = Type.Object({
  correctedAt: Type.String({ format: "date-time" }),
  correctedByUserId: Type.String({ format: "uuid" }),
  field: Type.String(),
  oldValue: Type.Unknown(),
  newValue: Type.Unknown(),
  reason: Type.String(),
  previewApproved: Type.Boolean(),
});

export const BenefitPeriodResponseSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    patientId: Type.String({ format: "uuid" }),
    locationId: Type.String({ format: "uuid" }),
    periodNumber: Type.Integer({ minimum: 1 }),
    startDate: Type.String({ format: "date" }),
    endDate: Type.String({ format: "date" }),
    periodLengthDays: Type.Integer(),
    status: BenefitPeriodStatusSchema,
    admissionType: BenefitPeriodAdmissionTypeSchema,
    isTransferDerived: Type.Boolean(),
    sourceAdmissionId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    isReportingPeriod: Type.Boolean(),
    recertDueDate: Type.Union([Type.String({ format: "date" }), Type.Null()]),
    recertStatus: BenefitPeriodRecertStatusSchema,
    recertCompletedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    recertPhysicianId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    f2fRequired: Type.Boolean(),
    f2fStatus: BenefitPeriodF2FStatusSchema,
    f2fDocumentedAt: Type.Union([Type.String({ format: "date" }), Type.Null()]),
    f2fProviderId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    f2fWindowStart: Type.Union([Type.String({ format: "date" }), Type.Null()]),
    f2fWindowEnd: Type.Union([Type.String({ format: "date" }), Type.Null()]),
    billingRisk: Type.Boolean(),
    billingRiskReason: Type.Union([Type.String(), Type.Null()]),
    noeId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    concurrentCareStart: Type.Union([Type.String({ format: "date" }), Type.Null()]),
    concurrentCareEnd: Type.Union([Type.String({ format: "date" }), Type.Null()]),
    revocationDate: Type.Union([Type.String({ format: "date" }), Type.Null()]),
    correctionHistory: Type.Array(CorrectionEntrySchema),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

export const BenefitPeriodDetailResponseSchema = Type.Composite(
  [
    BenefitPeriodResponseSchema,
    Type.Object({
      patient: Type.Object({ id: Type.String({ format: "uuid" }), name: Type.String() }),
      noe: Type.Optional(
        Type.Object({
          id: Type.String({ format: "uuid" }),
          status: Type.String(),
          filedAt: Type.Optional(Type.String({ format: "date-time" })),
        }),
      ),
    }),
  ],
  { additionalProperties: false },
);

export const BenefitPeriodListQuerySchema = Type.Object(
  {
    status: Type.Optional(BenefitPeriodStatusSchema),
    patientId: Type.Optional(Type.String({ format: "uuid" })),
    recertDueBefore: Type.Optional(Type.String({ format: "date" })),
    billingRisk: Type.Optional(Type.Boolean()),
    page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 25 })),
  },
  { additionalProperties: false },
);

export const BenefitPeriodListResponseSchema = Type.Object(
  {
    items: Type.Array(BenefitPeriodDetailResponseSchema),
    total: Type.Integer(),
    page: Type.Integer(),
    limit: Type.Integer(),
  },
  { additionalProperties: false },
);

export const BenefitPeriodTimelineResponseSchema = Type.Object(
  {
    patientId: Type.String({ format: "uuid" }),
    admissionType: BenefitPeriodAdmissionTypeSchema,
    periods: Type.Array(BenefitPeriodResponseSchema),
    activeAlerts: Type.Array(
      Type.Object({
        id: Type.String({ format: "uuid" }),
        type: Type.String(),
        severity: Type.Union([
          Type.Literal("critical"),
          Type.Literal("warning"),
          Type.Literal("info"),
        ]),
        description: Type.String(),
      }),
    ),
  },
  { additionalProperties: false },
);

export const SetReportingPeriodBodySchema = Type.Object(
  {
    isReportingPeriod: Type.Literal(true),
  },
  { additionalProperties: false },
);

export const RecalculationPreviewResponseSchema = Type.Object(
  {
    previewToken: Type.String(),
    expiresAt: Type.String({ format: "date-time" }),
    affectedPeriods: Type.Array(
      Type.Object({
        id: Type.String({ format: "uuid" }),
        periodNumber: Type.Integer(),
        field: Type.String(),
        oldValue: Type.Unknown(),
        newValue: Type.Unknown(),
      }),
    ),
    changesSummary: Type.String(),
  },
  { additionalProperties: false },
);

export const CommitRecalculationBodySchema = Type.Object(
  {
    previewToken: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const RecertifyBodySchema = Type.Object(
  {
    physicianId: Type.String({ format: "uuid" }),
    completedAt: Type.String({ format: "date" }),
  },
  { additionalProperties: false },
);

export const CorrectPeriodBodySchema = Type.Object(
  {
    field: Type.String({ minLength: 1 }),
    newValue: Type.Unknown(),
    reason: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

// ── Period-length helpers (exported, used in service) ─────────────────────────

export function getPeriodLengthDays(periodNumber: number): 90 | 60 {
  return periodNumber <= 2 ? 90 : 60;
}

export function isF2FRequired(periodNumber: number): boolean {
  return periodNumber >= 3;
}

// ── Static types ──────────────────────────────────────────────────────────────

export type BenefitPeriodResponse = Static<typeof BenefitPeriodResponseSchema>;
export type BenefitPeriodDetailResponse = Static<typeof BenefitPeriodDetailResponseSchema>;
export type BenefitPeriodListQuery = Static<typeof BenefitPeriodListQuerySchema>;
export type BenefitPeriodListResponseType = Static<typeof BenefitPeriodListResponseSchema>;
export type BenefitPeriodTimelineResponse = Static<typeof BenefitPeriodTimelineResponseSchema>;
export type SetReportingPeriodBody = Static<typeof SetReportingPeriodBodySchema>;
export type RecalculationPreviewResponse = Static<typeof RecalculationPreviewResponseSchema>;
export type CommitRecalculationBody = Static<typeof CommitRecalculationBodySchema>;
export type RecertifyBody = Static<typeof RecertifyBodySchema>;
export type CorrectPeriodBody = Static<typeof CorrectPeriodBodySchema>;
