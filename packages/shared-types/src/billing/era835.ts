// billing/era835.ts
// T3-7b: ERA 835 + Remittance Reconciliation shared types.
// Framework-agnostic — no runtime dependencies.

export type RemittanceStatus =
  | "RECEIVED"
  | "PARSED"
  | "POSTED"
  | "PARTIAL"
  | "FAILED"
  | "RECONCILED";

export type PostingState = "PENDING" | "APPLIED" | "REVERSED";

/** CAS segment — adjustment reason code (one per CAS element triplet) */
export interface AdjustmentReasonCode {
  /** CO=contractual, PR=patient responsibility, OA=other adjustment, PI=payer initiated */
  groupCode: string;
  /** CARC code, e.g. "45" = charges exceed fee schedule */
  reasonCode: string;
  amount: number;
  quantity?: number;
}

/** SVC loop — service-line-level payment detail */
export interface SvcLoop {
  serviceDate?: string;
  procedureCode?: string;
  submittedAmount: number;
  paidAmount: number;
  adjustments: AdjustmentReasonCode[];
}

export interface Remittance835 {
  id: string;
  locationId: string;
  payerName: string;
  payerId: string | null;
  checkNumber: string | null;
  eftNumber: string | null;
  paymentDate: string | null;
  totalPaymentAmount: string | null;
  rawFileHash: string;
  status: RemittanceStatus;
  ingestedAt: string;
  reconciledAt: string | null;
}

export interface RemittancePosting {
  id: string;
  remittanceId: string;
  claimId: string;
  locationId: string;
  claimIcn: string | null;
  payerClaimNumber: string | null;
  patientControlNumber: string | null;
  paidAmount: string;
  contractualAdjustment: string;
  patientResponsibility: string;
  otherAdjustment: string;
  adjustmentReasonCodes: AdjustmentReasonCode[];
  svcLoops: SvcLoop[];
  postingState: PostingState;
  postedAt: string | null;
  reversedAt: string | null;
  reversedBy: string | null;
  createdAt: string;
}

export interface UnmatchedRemittance {
  id: string;
  remittanceId: string;
  locationId: string;
  rawClpData: Record<string, unknown>;
  matchAttemptDetails: Record<string, unknown>;
  patientControlNumber: string | null;
  payerClaimNumber: string | null;
  paidAmount: string | null;
  assignedTo: string | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
  matchedClaimId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Remittance835Detail extends Remittance835 {
  postings: RemittancePosting[];
  unmatchedItems: UnmatchedRemittance[];
}

export interface RemittanceListQuery {
  payerId?: string;
  status?: RemittanceStatus;
  fromDate?: string;
  toDate?: string;
  page?: number;
  pageSize?: number;
}

export interface RemittanceListResponse {
  data: Remittance835[];
  total: number;
}

export interface UnmatchedRemittanceListResponse {
  data: UnmatchedRemittance[];
  total: number;
}

export interface IngestERAInput {
  /** Base64-encoded raw 835 EDI content */
  raw835: string;
  payerName: string;
  locationId: string;
}

export interface ManualMatchInput {
  claimId: string;
  note?: string;
}

export interface IngestERAResult {
  remittanceId: string;
  matched: number;
  unmatched: number;
  status: RemittanceStatus;
}

export interface ClaimRemittanceResponse {
  postings: RemittancePosting[];
  totalPaid: string;
  totalContractualAdjustment: string;
  totalPatientResponsibility: string;
}
