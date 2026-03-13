// shared-types/src/benefit-period.ts
// Benefit Period Control System — T3-4

export type BenefitPeriodStatus =
  | "current"
  | "upcoming"
  | "recert_due"
  | "at_risk"
  | "past_due"
  | "closed"
  | "revoked"
  | "transferred_out"
  | "concurrent_care"
  | "discharged";

export type BenefitPeriodRecertStatus =
  | "not_yet_due"
  | "ready_for_recert"
  | "pending_physician"
  | "completed"
  | "missed";

export type BenefitPeriodF2FStatus =
  | "not_required"
  | "not_yet_due"
  | "due_soon"
  | "documented"
  | "invalid"
  | "missing"
  | "recert_blocked";

export type BenefitPeriodAdmissionType =
  | "new_admission"
  | "hospice_to_hospice_transfer"
  | "revocation_readmission";

export interface CorrectionEntry {
  correctedAt: string;
  correctedByUserId: string;
  field: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string;
  previewApproved: boolean;
}

export interface BenefitPeriod {
  id: string;
  patientId: string;
  locationId: string;
  periodNumber: number;
  startDate: string; // ISO date
  endDate: string; // ISO date
  periodLengthDays: number; // computed
  status: BenefitPeriodStatus;
  admissionType: BenefitPeriodAdmissionType;
  isTransferDerived: boolean;
  sourceAdmissionId: string | null;
  isReportingPeriod: boolean;
  recertDueDate: string | null;
  recertStatus: BenefitPeriodRecertStatus;
  recertCompletedAt: string | null;
  recertPhysicianId: string | null;
  f2fRequired: boolean;
  f2fStatus: BenefitPeriodF2FStatus;
  f2fDocumentedAt: string | null;
  f2fProviderId: string | null;
  f2fWindowStart: string | null;
  f2fWindowEnd: string | null;
  billingRisk: boolean;
  billingRiskReason: string | null;
  noeId: string | null;
  concurrentCareStart: string | null;
  concurrentCareEnd: string | null;
  revocationDate: string | null;
  correctionHistory: CorrectionEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface BenefitPeriodDetail extends BenefitPeriod {
  patient: { id: string; name: string };
  noe?: { id: string; status: string; filedAt?: string };
}

export interface BenefitPeriodTimeline {
  patientId: string;
  admissionType: BenefitPeriodAdmissionType;
  periods: BenefitPeriod[];
  activeAlerts: Array<{ id: string; type: string; severity: string; description: string }>;
}

export interface BenefitPeriodListResponse {
  items: BenefitPeriodDetail[];
  total: number;
  page: number;
  limit: number;
}

export interface RecalculationPreview {
  previewToken: string;
  expiresAt: string;
  affectedPeriods: Array<{
    id: string;
    periodNumber: number;
    field: string;
    oldValue: unknown;
    newValue: unknown;
  }>;
  changesSummary: string;
}

export interface BenefitPeriodListQuery {
  status?: BenefitPeriodStatus;
  patientId?: string;
  recertDueBefore?: string;
  billingRisk?: boolean;
  page?: number;
  limit?: number;
}
