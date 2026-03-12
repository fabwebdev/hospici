// hope.ts — HOPE assessment types for frontend consumption
// HOPE (Hospice Outcomes and Patient Evaluation) — CMS quality reporting
// Replaces HIS effective October 1, 2025. 42 CFR §418.312.

export type HOPEAssessmentStatus =
  | "draft"
  | "in_progress"
  | "ready_for_review"
  | "approved_for_submission"
  | "submitted"
  | "accepted"
  | "rejected"
  | "needs_correction";

export type HOPEAssessmentType = "01" | "02" | "03"; // HOPE-A | HOPE-UV | HOPE-D

export const HOPE_ASSESSMENT_TYPE_LABELS: Record<HOPEAssessmentType, string> = {
  "01": "HOPE-A (Admission)",
  "02": "HOPE-UV (Update Visit)",
  "03": "HOPE-D (Discharge)",
};

export const HOPE_STATUS_LABELS: Record<HOPEAssessmentStatus, string> = {
  draft: "Draft",
  in_progress: "In Progress",
  ready_for_review: "Ready for Review",
  approved_for_submission: "Approved for Submission",
  submitted: "Submitted",
  accepted: "Accepted",
  rejected: "Rejected",
  needs_correction: "Needs Correction",
};

// HOPE assessment section data: { sectionA: { A0100: "1" }, sectionF: { F0100A: "0" }, ... }
export type HOPEAssessmentData = Record<string, Record<string, string | number | boolean | null>>;

export interface HOPEAssessmentResponse {
  id: string;
  patientId: string;
  locationId: string;
  assessmentType: HOPEAssessmentType;
  assessmentDate: string;
  electionDate: string;
  windowStart: string;
  windowDeadline: string;
  assignedClinicianId: string | null;
  status: HOPEAssessmentStatus;
  completenessScore: number;
  fatalErrorCount: number;
  warningCount: number;
  symptomFollowUpRequired: boolean;
  symptomFollowUpDueAt: string | null;
  data: HOPEAssessmentData;
  createdAt: string;
  updatedAt: string;
}

export interface HOPEAssessmentListResponse {
  data: HOPEAssessmentResponse[];
  total: number;
  page: number;
  limit: number;
}

export interface HOPEAssessmentListQuery {
  patientId?: string;
  assessmentType?: HOPEAssessmentType;
  status?: HOPEAssessmentStatus;
  assignedClinicianId?: string;
  dateFrom?: string;
  dateTo?: string;
  windowOverdueOnly?: boolean;
  page?: number;
  limit?: number;
}

export interface CreateHOPEAssessmentInput {
  patientId: string;
  locationId: string;
  assessmentType: HOPEAssessmentType;
  assessmentDate: string;
  electionDate: string;
  assignedClinicianId?: string;
  data?: HOPEAssessmentData;
}

export interface PatchHOPEAssessmentInput {
  assignedClinicianId?: string | null;
  status?: HOPEAssessmentStatus;
  symptomFollowUpRequired?: boolean;
  symptomFollowUpDueAt?: string | null;
  data?: HOPEAssessmentData;
}

export interface HOPEValidationIssue {
  field: string;
  code: string;
  message: string;
}

export interface HOPEValidationResult {
  completenessScore: number;
  blockingErrors: HOPEValidationIssue[];
  warnings: HOPEValidationIssue[];
  inconsistencies: string[];
  missingRequiredFields: string[];
  suggestedNextActions: string[];
}

export interface HOPESubmissionRow {
  id: string;
  assessmentId: string;
  locationId: string;
  attemptNumber: number;
  submittedAt: string;
  responseReceivedAt: string | null;
  trackingId: string | null;
  submittedByUserId: string | null;
  submissionStatus: "pending" | "accepted" | "rejected" | "correction_pending";
  correctionType: "none" | "modification" | "inactivation";
  rejectionCodes: string[];
  rejectionDetails: string | null;
  payloadHash: string;
  createdAt: string;
}

export interface HOPEMeasureBenchmark {
  measureCode: string;
  measureName: string;
  locationRate: number | null;
  nationalAverage: number | null;
  targetRate: number;
  atRisk: boolean;
  trend: Array<{ quarter: string; rate: number | null }>;
}

export interface HOPEQualityBenchmark {
  locationId: string;
  reportingPeriod: {
    calendarYear: number;
    quarter: number;
    periodStart: string;
    periodEnd: string;
  };
  hqrpPenaltyRisk: boolean;
  measures: HOPEMeasureBenchmark[];
  updatedAt: string;
}

// ── T3-1b: Dashboard + Timeline types ────────────────────────────────────────

export interface HOPEDashboardAssessmentItem {
  id: string;
  patientName: string;
  assessmentType: HOPEAssessmentType;
  status: HOPEAssessmentStatus;
  windowDeadline: string;
  completenessScore: number;
  symptomFollowUpRequired: boolean;
  assignedClinicianId: string | null;
  nextAction: string;
}

export interface HOPEDashboardResponse {
  dueToday: number;
  due48h: number;
  overdue: number;
  needsSymptomFollowUp: number;
  rejectedByIQIES: number;
  readyToSubmit: number;
  hqrpPenaltyRisk: boolean;
  assessmentList: HOPEDashboardAssessmentItem[];
}

export interface HOPEPatientTimeline {
  patientId: string;
  hopeA: {
    required: boolean;
    windowDeadline: string | null;
    status: HOPEAssessmentStatus | null;
    assessmentId: string | null;
  };
  hopeUV: {
    count: number;
    lastFiledAt: string | null;
    nextDue: string | null;
  };
  hopeD: {
    required: boolean;
    windowDeadline: string | null;
    status: HOPEAssessmentStatus | null;
    assessmentId: string | null;
  };
  symptomFollowUp: {
    required: boolean;
    dueAt: string | null;
    completed: boolean;
  };
  penaltyExposure: {
    atRisk: boolean;
    measureShortfalls: string[];
  };
}

export interface HOPESubmissionListResponse {
  assessmentId: string;
  data: HOPESubmissionRow[];
}

/** iQIES error codes with human-readable resolution guidance */
export const IQIES_ERROR_GUIDANCE: Record<string, string> = {
  A0310A_INVALID: "Verify assessment type code is '01', '02', or '03' — no other values accepted.",
  WINDOW_VIOLATION:
    "Assessment is outside the 7-day CMS window. Document exception and contact iQIES helpdesk.",
  DUPLICATE_SUBMISSION: "Assessment already accepted — check for duplicate. Update existing record.",
  REQUIRED_FIELD_MISSING: "Run validation to identify and complete all required fields.",
  CCN_NOT_FOUND: "Verify the 6-digit CMS Certification Number matches your iQIES registration.",
  DLQ_EXHAUSTED:
    "All 3 submission attempts failed. Manual intervention required — contact ops team.",
};
