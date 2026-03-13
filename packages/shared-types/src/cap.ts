// cap.ts
// Hospice Cap Intelligence shared types (T3-3)

export interface CapThresholdAlert {
  type: "CAP_THRESHOLD_70" | "CAP_THRESHOLD_80" | "CAP_THRESHOLD_90" | "CAP_PROJECTED_OVERAGE";
  firedAt: string;
}

export interface CapSummaryResponse {
  capYear: number;
  capYearStart: string;
  capYearEnd: string;
  daysRemainingInYear: number;
  utilizationPercent: number;
  projectedYearEndPercent: number;
  estimatedLiability: number;
  patientCount: number;
  lastCalculatedAt: string | null;
  thresholdAlerts: CapThresholdAlert[];
  priorYearUtilizationPercent: number | null;
}

export interface CapPatientContributionItem {
  patientId: string;
  patientName: string;
  admissionDate: string;
  dischargeDate: string | null;
  losDays: number;
  careModel: string;
  capContributionAmount: number;
  contributionPercent: number;
  routineDays: number;
  continuousHomeCareDays: number;
  inpatientDays: number;
  liveDischargeFlag: boolean;
}

export interface CapPatientListResponse {
  data: CapPatientContributionItem[];
  total: number;
  snapshotId: string | null;
}

export interface CapTrendMonth {
  month: string;
  utilizationPercent: number;
  projectedYearEndPercent: number;
  patientCount: number;
  snapshotId: string;
}

export interface CapBranchComparison {
  locationId: string;
  locationName: string;
  utilizationPercent: number;
  projectedYearEndPercent: number;
  trend: "up" | "down" | "stable";
}

export interface CapTrendResponse {
  months: CapTrendMonth[];
  branchComparison: CapBranchComparison[];
}

export interface CapSnapshotResponse {
  id: string;
  locationId: string;
  capYear: number;
  calculatedAt: string;
  utilizationPercent: number;
  projectedYearEndPercent: number;
  estimatedLiability: number;
  patientCount: number;
  formulaVersion: string;
  inputHash: string;
  triggeredBy: string;
  triggeredByUserId: string | null;
  contributions: CapPatientContributionItem[];
}

export interface RecalculateCapResponse {
  jobId: string;
  message: string;
}

export interface CapPatientListQuery {
  snapshotId?: string;
  sortBy?: "contribution" | "los" | "name";
  limit?: number;
  losMin?: number;
  losMax?: number;
  highUtilizationOnly?: boolean;
  capYear?: number;
}
