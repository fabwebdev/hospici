// billing/claimAudit.ts
// T3-12: Claim Audit Rules Engine — shared TypeScript interfaces for frontend consumption.
// These mirror the TypeBox schemas in backend/src/contexts/billing/schemas/claimAudit.schema.ts.
// No runtime dependencies — types only.

export interface AuditFailure {
  ruleGroup: string;
  ruleCode: string;
  severity: "BLOCK" | "WARN";
  message: string;
  sourceObject: string;
  sourceObjectId?: string;
  sourceField?: string;
  remediationCTA: string;
  ownerRole: "billing" | "supervisor" | "clinician" | "physician" | "admin";
  claimBlocking: boolean;
}

export interface OverrideTrailEntry {
  ruleCode: string;
  reason: string;
  overriddenBy: string;
  overriddenAt: string; // ISO date-time
}

export interface AuditResult {
  snapshotId: string;
  claimId: string;
  locationId: string;
  auditedAt: string; // ISO date-time
  passed: boolean;
  blockCount: number;
  warnCount: number;
  failures: AuditFailure[];
}

export interface AuditSnapshotResponse {
  id: string;
  claimId: string;
  claimRevisionId: string | null;
  locationId: string;
  auditedAt: string; // ISO date-time
  passed: boolean;
  blockCount: number;
  warnCount: number;
  failures: AuditFailure[];
  overrideTrail: OverrideTrailEntry[];
  auditedBy: string | null;
  createdAt: string; // ISO date-time
}

export interface WarnOverrideBody {
  ruleCode: string;
  reason: string;
}

export interface BulkHoldBody {
  claimIds: string[];
  holdReason: string;
}

export interface BulkReleaseBody {
  claimIds: string[];
}

export interface AgingBucket {
  d0_2: number;
  d3_7: number;
  d8_14: number;
  d14plus: number;
}

export interface ClaimStatusSummary {
  readyToBill: number;
  auditFailed: number;
  onHold: number;
  draft: number;
  queued: number;
  submitted: number;
}

export interface AgingByRuleGroupItem {
  ruleGroup: string;
  claimCount: number;
  aging: AgingBucket;
}

export interface AgingByHoldReasonItem {
  reason: string;
  claimCount: number;
  aging: AgingBucket;
}

export interface AgingByBranchItem {
  locationId: string;
  claimCount: number;
  aging: AgingBucket;
}

export interface OwnerLaneQueueItem {
  ownerRole: string;
  claimCount: number;
  oldestAuditedAt: string | null; // ISO date-time
}

export interface WarnOverrideDayBucket {
  date: string; // YYYY-MM-DD
  count: number;
}

export interface AuditDashboardResponse {
  claimStatusSummary: ClaimStatusSummary;
  agingByRuleGroup: AgingByRuleGroupItem[];
  agingByHoldReason: AgingByHoldReasonItem[];
  agingByBranch: AgingByBranchItem[];
  ownerLaneQueue: OwnerLaneQueueItem[];
  topDenialDrivers: {
    data: unknown[];
    availableAfter: string;
  };
  warnOverrideVolume: WarnOverrideDayBucket[];
}
