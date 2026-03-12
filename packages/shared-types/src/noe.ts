// noe.ts
// NOE/NOTR Filing Workbench shared types — T3-2a
// No runtime dependencies; pure TypeScript types and constants.

export type NoticeFilingStatus =
  | "draft"
  | "ready_for_submission"
  | "submitted"
  | "accepted"
  | "rejected"
  | "needs_correction"
  | "late_pending_override"
  | "voided"
  | "closed";

export const TERMINAL_FILING_STATUSES: ReadonlySet<NoticeFilingStatus> = new Set<NoticeFilingStatus>([
  "accepted",
  "closed",
  "voided",
]);

export const CLAIM_BLOCKING_STATUSES: ReadonlySet<NoticeFilingStatus> = new Set<NoticeFilingStatus>([
  "draft",
  "ready_for_submission",
  "rejected",
  "needs_correction",
  "late_pending_override",
]);

// ── NOE ───────────────────────────────────────────────────────────────────────

export interface NOEResponse {
  id: string;
  patientId: string;
  locationId: string;
  status: NoticeFilingStatus;
  electionDate: string; // ISO date
  deadlineDate: string; // ISO date
  isLate: boolean;
  lateReason: string | null;
  overrideApprovedBy: string | null;
  overrideApprovedAt: string | null; // ISO date-time
  overrideReason: string | null;
  submittedAt: string | null; // ISO date-time
  submittedByUserId: string | null;
  responseCode: string | null;
  responseMessage: string | null;
  attemptCount: number;
  correctedFromId: string | null;
  isClaimBlocking: boolean;
  createdAt: string; // ISO date-time
  updatedAt: string; // ISO date-time
}

export interface FilingHistoryEvent {
  event: string;
  timestamp: string; // ISO date-time
  userId: string | null;
}

export interface NOEWithHistoryResponse {
  noe: NOEResponse;
  history: FilingHistoryEvent[];
}

// ── NOTR ──────────────────────────────────────────────────────────────────────

export interface NOTRResponse {
  id: string;
  noeId: string;
  patientId: string;
  locationId: string;
  status: NoticeFilingStatus;
  revocationDate: string; // ISO date
  revocationReason: string;
  deadlineDate: string; // ISO date
  isLate: boolean;
  lateReason: string | null;
  overrideApprovedBy: string | null;
  overrideApprovedAt: string | null; // ISO date-time
  overrideReason: string | null;
  receivingHospiceId: string | null;
  receivingHospiceName: string | null;
  transferDate: string | null; // ISO date
  submittedAt: string | null; // ISO date-time
  submittedByUserId: string | null;
  responseCode: string | null;
  responseMessage: string | null;
  attemptCount: number;
  correctedFromId: string | null;
  isClaimBlocking: boolean;
  createdAt: string; // ISO date-time
  updatedAt: string; // ISO date-time
}

// ── Filing Queue ──────────────────────────────────────────────────────────────

export interface FilingQueueItem {
  id: string;
  type: "NOE" | "NOTR";
  patientId: string;
  locationId: string;
  status: NoticeFilingStatus;
  deadlineDate: string; // ISO date
  isLate: boolean;
  isClaimBlocking: boolean;
  attemptCount: number;
  createdAt: string; // ISO date-time
  updatedAt: string; // ISO date-time
}

export interface FilingQueueResponse {
  data: FilingQueueItem[];
  total: number;
}

// ── Readiness ─────────────────────────────────────────────────────────────────

export interface ReadinessCheckItem {
  check: string;
  passed: boolean;
  message?: string;
}

export interface ReadinessResponse {
  ready: boolean;
  checklist: ReadinessCheckItem[];
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateNOEInput {
  electionDate: string; // ISO date
}

export type RevocationReason =
  | "patient_revoked"
  | "patient_transferred"
  | "patient_deceased"
  | "patient_no_longer_eligible"
  | "other";

export interface CreateNOTRInput {
  revocationDate: string; // ISO date
  revocationReason: RevocationReason;
  receivingHospiceId?: string;
  receivingHospiceName?: string;
  transferDate?: string; // ISO date
}

export interface LateOverrideInput {
  overrideReason: string; // minLength: 20
}

export interface CMSResponseInput {
  responseCode: string;
  responseMessage: string;
  accepted: boolean;
}

export interface CorrectNOEInput {
  electionDate: string; // ISO date
  lateReason?: string;
}
