// contexts/billing/schemas/claimAudit.schema.ts
// T3-12: Claim Audit Rules Engine + Bill-Hold Dashboard — TypeBox schemas
// All exports are TSchema values only. Validators compiled in typebox-compiler.ts.

import { type Static, Type } from "@sinclair/typebox";

// ── AuditFailure — single rule failure record ─────────────────────────────────

export const AuditFailureSchema = Type.Object(
  {
    ruleGroup: Type.String({ description: "High-level rule group, e.g. F2F_AND_CERTIFICATION" }),
    ruleCode: Type.String({ description: "Specific rule code, e.g. F2F_DOC_BEFORE_RECERT_DATE" }),
    severity: Type.Union([Type.Literal("BLOCK"), Type.Literal("WARN")]),
    message: Type.String(),
    sourceObject: Type.String({ description: "Table / domain object name, e.g. benefit_periods" }),
    sourceObjectId: Type.Optional(Type.String()),
    sourceField: Type.Optional(Type.String()),
    remediationCTA: Type.String({ description: "Human-readable remediation call-to-action" }),
    ownerRole: Type.Union([
      Type.Literal("billing"),
      Type.Literal("supervisor"),
      Type.Literal("clinician"),
      Type.Literal("physician"),
      Type.Literal("admin"),
    ]),
    claimBlocking: Type.Boolean({ description: "True if this failure should place a hold" }),
  },
  { additionalProperties: false },
);
export type AuditFailure = Static<typeof AuditFailureSchema>;

// ── AuditResult — full result of one engine run ───────────────────────────────

export const AuditResultSchema = Type.Object(
  {
    snapshotId: Type.String({ format: "uuid" }),
    claimId: Type.String({ format: "uuid" }),
    locationId: Type.String({ format: "uuid" }),
    auditedAt: Type.String({ format: "date-time" }),
    passed: Type.Boolean(),
    blockCount: Type.Integer({ minimum: 0 }),
    warnCount: Type.Integer({ minimum: 0 }),
    failures: Type.Array(AuditFailureSchema),
  },
  { additionalProperties: false },
);
export type AuditResult = Static<typeof AuditResultSchema>;

// ── Override trail entry ──────────────────────────────────────────────────────

export const OverrideTrailEntrySchema = Type.Object(
  {
    ruleCode: Type.String(),
    reason: Type.String(),
    overriddenBy: Type.String({ format: "uuid" }),
    overriddenAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type OverrideTrailEntry = Static<typeof OverrideTrailEntrySchema>;

// ── AuditSnapshotResponse — DB row formatted for API response ─────────────────

export const AuditSnapshotResponseSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    claimId: Type.String({ format: "uuid" }),
    claimRevisionId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    locationId: Type.String({ format: "uuid" }),
    auditedAt: Type.String({ format: "date-time" }),
    passed: Type.Boolean(),
    blockCount: Type.Integer({ minimum: 0 }),
    warnCount: Type.Integer({ minimum: 0 }),
    failures: Type.Array(AuditFailureSchema),
    overrideTrail: Type.Array(OverrideTrailEntrySchema),
    auditedBy: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    createdAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type AuditSnapshotResponse = Static<typeof AuditSnapshotResponseSchema>;

// ── WarnOverrideBody — supervisor override input ──────────────────────────────

export const WarnOverrideBodySchema = Type.Object(
  {
    ruleCode: Type.String({ minLength: 1 }),
    reason: Type.String({ minLength: 10, maxLength: 2000 }),
  },
  { additionalProperties: false },
);
export type WarnOverrideBody = Static<typeof WarnOverrideBodySchema>;

// ── BulkHoldBody ──────────────────────────────────────────────────────────────

export const BulkHoldBodySchema = Type.Object(
  {
    claimIds: Type.Array(Type.String({ format: "uuid" }), { minItems: 1, maxItems: 100 }),
    holdReason: Type.String({ minLength: 1, maxLength: 500 }),
  },
  { additionalProperties: false },
);
export type BulkHoldBody = Static<typeof BulkHoldBodySchema>;

// ── BulkReleaseBody ───────────────────────────────────────────────────────────

export const BulkReleaseBodySchema = Type.Object(
  {
    claimIds: Type.Array(Type.String({ format: "uuid" }), { minItems: 1, maxItems: 100 }),
  },
  { additionalProperties: false },
);
export type BulkReleaseBody = Static<typeof BulkReleaseBodySchema>;

// ── Dashboard section schemas ─────────────────────────────────────────────────

const ClaimStatusSummarySchema = Type.Object(
  {
    readyToBill: Type.Integer({ minimum: 0 }),
    auditFailed: Type.Integer({ minimum: 0 }),
    onHold: Type.Integer({ minimum: 0 }),
    draft: Type.Integer({ minimum: 0 }),
    queued: Type.Integer({ minimum: 0 }),
    submitted: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

const AgingBucketSchema = Type.Object(
  {
    d0_2: Type.Integer({ minimum: 0 }),
    d3_7: Type.Integer({ minimum: 0 }),
    d8_14: Type.Integer({ minimum: 0 }),
    d14plus: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

const AgingByRuleGroupItemSchema = Type.Object(
  {
    ruleGroup: Type.String(),
    claimCount: Type.Integer({ minimum: 0 }),
    aging: AgingBucketSchema,
  },
  { additionalProperties: false },
);

const AgingByHoldReasonItemSchema = Type.Object(
  {
    reason: Type.String(),
    claimCount: Type.Integer({ minimum: 0 }),
    aging: AgingBucketSchema,
  },
  { additionalProperties: false },
);

const AgingByBranchItemSchema = Type.Object(
  {
    locationId: Type.String({ format: "uuid" }),
    claimCount: Type.Integer({ minimum: 0 }),
    aging: AgingBucketSchema,
  },
  { additionalProperties: false },
);

const OwnerLaneQueueItemSchema = Type.Object(
  {
    ownerRole: Type.String(),
    claimCount: Type.Integer({ minimum: 0 }),
    oldestAuditedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  },
  { additionalProperties: false },
);

const WarnOverrideDayBucketSchema = Type.Object(
  {
    date: Type.String({ format: "date" }),
    count: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

// ── AuditDashboardResponse — all 7 sections ───────────────────────────────────

export const AuditDashboardResponseSchema = Type.Object(
  {
    claimStatusSummary: ClaimStatusSummarySchema,
    agingByRuleGroup: Type.Array(AgingByRuleGroupItemSchema),
    agingByHoldReason: Type.Array(AgingByHoldReasonItemSchema),
    agingByBranch: Type.Array(AgingByBranchItemSchema),
    ownerLaneQueue: Type.Array(OwnerLaneQueueItemSchema),
    topDenialDrivers: Type.Object(
      {
        data: Type.Array(Type.Unknown()),
        availableAfter: Type.String(),
      },
      { additionalProperties: false },
    ),
    warnOverrideVolume: Type.Array(WarnOverrideDayBucketSchema),
  },
  { additionalProperties: false },
);
export type AuditDashboardResponse = Static<typeof AuditDashboardResponseSchema>;
