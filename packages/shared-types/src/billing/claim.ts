// packages/shared-types/src/billing/claim.ts
// T3-7a: Claim Lifecycle shared types — consumed by frontend and backend
// Zero runtime dependencies — types only

export type ClaimState =
  | "DRAFT"
  | "NOT_READY"
  | "READY_FOR_AUDIT"
  | "AUDIT_FAILED"
  | "READY_TO_SUBMIT"
  | "QUEUED"
  | "SUBMITTED"
  | "ACCEPTED"
  | "REJECTED"
  | "DENIED"
  | "PAID"
  | "VOIDED";

export type ClaimBillType = "original" | "replacement" | "void";

export type BillHoldReason =
  | "MANUAL_REVIEW"
  | "COMPLIANCE_BLOCK"
  | "MISSING_DOCUMENTATION"
  | "PAYER_INQUIRY"
  | "INTERNAL_AUDIT"
  | "SUPERVISOR_REVIEW";

export type LevelOfCare =
  | "routine_home_care"
  | "continuous_home_care"
  | "inpatient_respite"
  | "general_inpatient";

export type ClaimLine = {
  revenueCode: string;
  hcpcsCode: string | null;
  serviceDate: string;
  units: number;
  unitCharge: number;
  lineCharge: number;
  levelOfCare: LevelOfCare | null;
};

export type ClaimReadinessBlocker = {
  code: string;
  message: string;
};

export type ClaimReadinessResult = {
  ready: boolean;
  blockers: ClaimReadinessBlocker[];
};

export type ClaimSummary = {
  id: string;
  patientId: string;
  locationId: string;
  payerId: string;
  benefitPeriodId: string | null;
  billType: ClaimBillType;
  statementFromDate: string;
  statementToDate: string;
  totalCharge: string;
  state: ClaimState;
  isOnHold: boolean;
  correctedFromId: string | null;
  payloadHash: string | null;
  x12Hash: string | null;
  clearinghouseIcn: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type ClaimRevision = {
  id: string;
  claimId: string;
  fromState: ClaimState;
  toState: ClaimState;
  reason: string | null;
  transitionedBy: string | null;
  transitionedAt: string;
};

export type ClaimSubmission = {
  id: string;
  claimId: string;
  batchId: string | null;
  responseCode: string | null;
  responseMessage: string | null;
  submittedAt: string;
  responseReceivedAt: string | null;
  attemptNumber: number;
};

export type ClaimRejection = {
  id: string;
  claimId: string;
  claimSubmissionId: string | null;
  loopId: string | null;
  segmentId: string | null;
  errorCode: string;
  errorDescription: string;
  fieldPosition: string | null;
  createdAt: string;
};

export type BillHold = {
  id: string;
  claimId: string;
  reason: BillHoldReason;
  holdNote: string | null;
  placedBy: string;
  placedAt: string;
  releasedBy: string | null;
  releasedAt: string | null;
};

export type ClaimDetail = {
  claim: ClaimSummary;
  revisions: ClaimRevision[];
  submissions: ClaimSubmission[];
  rejections: ClaimRejection[];
  activeHold: BillHold | null;
  readiness: ClaimReadinessResult;
};

export type CreateClaimInput = {
  patientId: string;
  payerId: string;
  benefitPeriodId?: string;
  statementFromDate: string;
  statementToDate: string;
  claimLines: ClaimLine[];
};

export type HoldClaimInput = {
  reason: BillHoldReason;
  holdNote?: string;
};

export type ReplaceClaimInput = {
  payerId?: string;
  statementFromDate?: string;
  statementToDate?: string;
  claimLines?: ClaimLine[];
  replacementReason: string;
};

export type BulkSubmitInput = {
  claimIds: string[];
};

export type BulkSubmitResult = {
  queued: string[];
  skipped: Array<{ claimId: string; reason: string }>;
};

// ── UI helper constants ───────────────────────────────────────────────────────

export const CLAIM_STATE_LABELS: Record<ClaimState, string> = {
  DRAFT: "Draft",
  NOT_READY: "Not Ready",
  READY_FOR_AUDIT: "Ready for Audit",
  AUDIT_FAILED: "Audit Failed",
  READY_TO_SUBMIT: "Ready to Submit",
  QUEUED: "Queued",
  SUBMITTED: "Submitted",
  ACCEPTED: "Accepted",
  REJECTED: "Rejected",
  DENIED: "Denied",
  PAID: "Paid",
  VOIDED: "Voided",
};

export const CLAIM_STATE_COLORS: Record<ClaimState, string> = {
  DRAFT: "gray",
  NOT_READY: "red",
  READY_FOR_AUDIT: "yellow",
  AUDIT_FAILED: "red",
  READY_TO_SUBMIT: "blue",
  QUEUED: "blue",
  SUBMITTED: "purple",
  ACCEPTED: "green",
  REJECTED: "red",
  DENIED: "red",
  PAID: "green",
  VOIDED: "gray",
};

export const TERMINAL_CLAIM_STATES: ClaimState[] = ["PAID", "VOIDED"];
export const SUBMITTABLE_CLAIM_STATES: ClaimState[] = ["READY_TO_SUBMIT"];
