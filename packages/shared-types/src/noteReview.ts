// noteReview.ts
// Note review system types — T2-9.
// 7-state status machine + structured revision requests + DeficiencyType taxonomy.

// ── Status enum ───────────────────────────────────────────────────────────────

export type NoteReviewStatus =
  | 'PENDING'
  | 'IN_REVIEW'
  | 'REVISION_REQUESTED'
  | 'RESUBMITTED'
  | 'APPROVED'
  | 'LOCKED'
  | 'ESCALATED';

/**
 * Valid state machine transitions.
 * LOCKED is set by T3-5 (electronic signatures) — not reachable via review routes.
 */
export const NOTE_REVIEW_TRANSITIONS: Record<NoteReviewStatus, NoteReviewStatus[]> = {
  PENDING:            ['IN_REVIEW'],
  IN_REVIEW:          ['REVISION_REQUESTED', 'APPROVED', 'ESCALATED'],
  REVISION_REQUESTED: ['RESUBMITTED', 'ESCALATED'],
  RESUBMITTED:        ['IN_REVIEW'],
  APPROVED:           ['LOCKED'],      // only T3-5 sets LOCKED
  LOCKED:             [],
  ESCALATED:          ['IN_REVIEW'],
};

// ── Deficiency taxonomy ───────────────────────────────────────────────────────

export const DeficiencyType = {
  CLINICAL_SUPPORT:         'CLINICAL_SUPPORT',
  COMPLIANCE_MISSING:       'COMPLIANCE_MISSING',
  SIGNATURE_MISSING:        'SIGNATURE_MISSING',
  CARE_PLAN_MISMATCH:       'CARE_PLAN_MISMATCH',
  VISIT_FREQUENCY_MISMATCH: 'VISIT_FREQUENCY_MISMATCH',
  MEDICATION_ISSUE:         'MEDICATION_ISSUE',
  HOPE_RELATED:             'HOPE_RELATED',
  BILLING_IMPACT:           'BILLING_IMPACT',
} as const;

export type DeficiencyType = (typeof DeficiencyType)[keyof typeof DeficiencyType];

// ── RevisionRequest ───────────────────────────────────────────────────────────

export interface RevisionRequest {
  id: string;                           // uuid
  deficiencyType: DeficiencyType;
  comment: string;
  severity: 'low' | 'medium' | 'high';
  dueBy: string;                        // ISO date
  resolvedAt: string | null;
  resolvedComment: string | null;
}

// ── Review queue item (encounter + review metadata) ───────────────────────────

export interface ReviewQueueItem {
  encounterId: string;
  patientId: string;
  patientName: string;            // PHI — redacted for non-PHI_ACCESS roles
  locationId: string;
  clinicianId: string;
  visitType: string;
  visitedAt: string;
  reviewStatus: NoteReviewStatus;
  reviewerId: string | null;
  reviewedAt: string | null;
  escalatedAt: string | null;
  escalationReason: string | null;
  revisionRequests: RevisionRequest[];
  priority: number;
  assignedReviewerId: string | null;
  dueBy: string | null;
  billingImpact: boolean;
  complianceImpact: boolean;
  firstPassApproved: boolean;
  revisionCount: number;
  /** Snapshot of the accepted VantageChart draft — for side-by-side diff */
  vantageChartDraft: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewQueueResponse {
  data: ReviewQueueItem[];
  total: number;
}

// ── Request bodies ────────────────────────────────────────────────────────────

export interface SubmitReviewInput {
  status: NoteReviewStatus;
  revisionRequests?: RevisionRequest[];
  escalationReason?: string;
}

export interface AssignReviewInput {
  assignedReviewerId: string;
  priority?: number;
  dueBy?: string;
}

export interface EscalateReviewInput {
  escalationReason: string;
}

export interface BulkAcknowledgeInput {
  encounterIds: string[];
}
