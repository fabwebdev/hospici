// contexts/billing/schemas/capIntelligence.schema.ts
// Hospice Cap Intelligence Module (T3-3)

import { type Static, Type } from "@sinclair/typebox";

// ── Threshold alert row ───────────────────────────────────────────────────────

export const CapThresholdAlertSchema = Type.Object({
  type: Type.Union([
    Type.Literal("CAP_THRESHOLD_70"),
    Type.Literal("CAP_THRESHOLD_80"),
    Type.Literal("CAP_THRESHOLD_90"),
    Type.Literal("CAP_PROJECTED_OVERAGE"),
  ]),
  firedAt: Type.String({ format: "date-time" }),
});

// ── Summary response ──────────────────────────────────────────────────────────

export const CapSummaryResponseSchema = Type.Object(
  {
    capYear: Type.Number(),
    capYearStart: Type.String({ format: "date" }),
    capYearEnd: Type.String({ format: "date" }),
    daysRemainingInYear: Type.Number(),
    utilizationPercent: Type.Number(),
    projectedYearEndPercent: Type.Number(),
    estimatedLiability: Type.Number(),
    patientCount: Type.Number(),
    lastCalculatedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    thresholdAlerts: Type.Array(CapThresholdAlertSchema),
    priorYearUtilizationPercent: Type.Union([Type.Number(), Type.Null()]),
  },
  { additionalProperties: false },
);

// ── Patient contributor list ──────────────────────────────────────────────────

export const CapPatientListQuerySchema = Type.Object(
  {
    snapshotId: Type.Optional(Type.String({ format: "uuid" })),
    sortBy: Type.Optional(Type.Enum({ contribution: "contribution", los: "los", name: "name" })),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 200 })),
    losMin: Type.Optional(Type.Number({ minimum: 0 })),
    losMax: Type.Optional(Type.Number({ minimum: 0 })),
    highUtilizationOnly: Type.Optional(Type.Boolean()),
    capYear: Type.Optional(Type.Number()),
  },
  { additionalProperties: false },
);

export const CapPatientContributionItemSchema = Type.Object(
  {
    patientId: Type.String({ format: "uuid" }),
    patientName: Type.String(),
    admissionDate: Type.String({ format: "date" }),
    dischargeDate: Type.Union([Type.String({ format: "date" }), Type.Null()]),
    losDays: Type.Number(),
    careModel: Type.String(),
    capContributionAmount: Type.Number(),
    contributionPercent: Type.Number(),
    routineDays: Type.Number(),
    continuousHomeCareDays: Type.Number(),
    inpatientDays: Type.Number(),
    liveDischargeFlag: Type.Boolean(),
  },
  { additionalProperties: false },
);

export const CapPatientListResponseSchema = Type.Object(
  {
    data: Type.Array(CapPatientContributionItemSchema),
    total: Type.Number(),
    snapshotId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
  },
  { additionalProperties: false },
);

// ── Trends response ───────────────────────────────────────────────────────────

export const CapTrendMonthSchema = Type.Object(
  {
    month: Type.String(),
    utilizationPercent: Type.Number(),
    projectedYearEndPercent: Type.Number(),
    patientCount: Type.Number(),
    snapshotId: Type.String({ format: "uuid" }),
  },
  { additionalProperties: false },
);

export const CapBranchComparisonSchema = Type.Object(
  {
    locationId: Type.String({ format: "uuid" }),
    locationName: Type.String(),
    utilizationPercent: Type.Number(),
    projectedYearEndPercent: Type.Number(),
    trend: Type.Union([Type.Literal("up"), Type.Literal("down"), Type.Literal("stable")]),
  },
  { additionalProperties: false },
);

export const CapTrendResponseSchema = Type.Object(
  {
    months: Type.Array(CapTrendMonthSchema),
    branchComparison: Type.Array(CapBranchComparisonSchema),
  },
  { additionalProperties: false },
);

// ── Snapshot detail ───────────────────────────────────────────────────────────

export const CapSnapshotResponseSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    locationId: Type.String({ format: "uuid" }),
    capYear: Type.Number(),
    calculatedAt: Type.String({ format: "date-time" }),
    utilizationPercent: Type.Number(),
    projectedYearEndPercent: Type.Number(),
    estimatedLiability: Type.Number(),
    patientCount: Type.Number(),
    formulaVersion: Type.String(),
    inputHash: Type.String(),
    triggeredBy: Type.String(),
    triggeredByUserId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    contributions: Type.Array(CapPatientContributionItemSchema),
  },
  { additionalProperties: false },
);

// ── Recalculate ───────────────────────────────────────────────────────────────

export const RecalculateCapResponseSchema = Type.Object(
  {
    jobId: Type.String(),
    message: Type.String(),
  },
  { additionalProperties: false },
);

// ── Exported types ────────────────────────────────────────────────────────────

export type CapSummaryResponse = Static<typeof CapSummaryResponseSchema>;
export type CapPatientListQuery = Static<typeof CapPatientListQuerySchema>;
export type CapPatientContributionItem = Static<typeof CapPatientContributionItemSchema>;
export type CapPatientListResponse = Static<typeof CapPatientListResponseSchema>;
export type CapTrendResponse = Static<typeof CapTrendResponseSchema>;
export type CapSnapshotResponse = Static<typeof CapSnapshotResponseSchema>;
export type RecalculateCapResponse = Static<typeof RecalculateCapResponseSchema>;
