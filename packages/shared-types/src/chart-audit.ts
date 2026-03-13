// chart-audit.ts — T3-13 shared types

/** JSON-serializable value compatible with TanStack Start's createServerFn return type constraints */
export type JsonFilterValue = string | number | boolean | string[] | number[] | boolean[];

export type ReviewAuditStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE" | "FLAGGED";
export type ViewScope = "note_review" | "chart_audit";
export type MissingDocSeverity = "critical" | "warning";

export interface ChecklistItem {
  id: string;
  label: string;
  required: boolean;
  regulatoryRef?: string;
  scoringWeight?: number;
}

export interface ChecklistResponse {
  itemId: string;
  checked: boolean;
  reviewerId: string;
  timestamp: string;
  templateVersion: number;
}

export interface ReviewChecklistTemplate {
  id: string;
  locationId: string | null;
  discipline: string;
  visitType: string;
  items: ChecklistItem[];
  version: number;
  isActive: boolean;
  effectiveDate: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewChecklistTemplateListResponse {
  data: ReviewChecklistTemplate[];
  total: number;
}

export interface SortConfig {
  sortBy: string;
  sortDir: "asc" | "desc";
}

export interface ColumnConfig {
  visibleColumns: string[];
  columnOrder: string[];
}

export interface ReviewQueueView {
  id: string;
  ownerId: string;
  locationId: string;
  name: string;
  viewScope: ViewScope;
  filters: Record<string, JsonFilterValue>;
  sortConfig: SortConfig;
  columnConfig: ColumnConfig;
  groupBy: string | null;
  isShared: boolean;
  isPinned: boolean;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewQueueViewListResponse {
  data: ReviewQueueView[];
  total: number;
}

export interface CreateReviewQueueViewInput {
  name: string;
  viewScope: ViewScope;
  filters?: Record<string, JsonFilterValue>;
  sortConfig?: SortConfig;
  columnConfig?: ColumnConfig;
  groupBy?: string;
  isShared?: boolean;
  isPinned?: boolean;
  isDefault?: boolean;
}

export interface PatchReviewQueueViewInput {
  name?: string;
  filters?: Record<string, JsonFilterValue>;
  sortConfig?: SortConfig;
  columnConfig?: ColumnConfig;
  groupBy?: string | null;
  isShared?: boolean;
  isPinned?: boolean;
  isDefault?: boolean;
}

export interface ChartAuditQueueRow {
  patientId: string;
  patientName: string;
  primaryDiscipline: string;
  reviewStatus: ReviewAuditStatus;
  missingDocCount: number;
  surveyReadinessScore: number;
  assignedReviewerId: string | null;
  assignedReviewerName: string | null;
  lastActivityAt: string | null;
  billingImpact: boolean;
  complianceImpact: boolean;
}

export interface ChartAuditQueueResponse {
  data: ChartAuditQueueRow[];
  total: number;
  page: number;
  limit: number;
}

export interface ChartAuditDashboardResponse {
  total: number;
  byStatus: Record<ReviewAuditStatus, number>;
  byDiscipline: Record<string, number>;
  byReviewer: { reviewerId: string; name: string; count: number }[];
  bySeverity: { critical: number; warning: number };
  avgSurveyReadinessScore: number;
}

export interface MissingDocument {
  type: string;
  description: string;
  dueBy: string | null;
  severity: MissingDocSeverity;
}

export interface ChartAuditDetailResponse {
  patientId: string;
  auditDate: string;
  sections: {
    encounters: { total: number; pending: number; approved: number; locked: number; overdue: number };
    hopeAssessments: { required: number; filed: number; missing: string[] };
    noeNotr: { noeStatus: string; notrRequired: boolean; notrStatus: string | null };
    orders: { total: number; unsigned: number; expired: number };
    signatures: { required: number; obtained: number; missing: string[] };
    carePlan: { present: boolean; lastUpdated: string | null; disciplinesComplete: string[] };
    medications: { active: number; unreconciled: number; teachingPending: number };
    idgMeetings: { lastHeld: string | null; nextDue: string; overdue: boolean };
  };
  surveyReadiness: { score: number; blockers: string[]; warnings: string[] };
  missingDocuments: MissingDocument[];
}

export interface ChartBulkActionInput {
  patientIds: string[];
  action: "ASSIGN" | "REQUEST_REVISION" | "EXPORT_CSV";
  assignedReviewerId?: string;
  revisionNote?: string;
}

export interface ReviewQueueBulkActionInput {
  encounterIds: string[];
  action: "ASSIGN" | "REQUEST_REVISION" | "ACKNOWLEDGE";
  assignedReviewerId?: string;
  revisionNote?: string;
}

export const REVIEW_AUDIT_STATUS_LABELS: Record<ReviewAuditStatus, string> = {
  NOT_STARTED: "Not Started",
  IN_PROGRESS: "In Progress",
  COMPLETE: "Complete",
  FLAGGED: "Flagged",
};

export const REVIEW_AUDIT_STATUS_COLORS: Record<ReviewAuditStatus, string> = {
  NOT_STARTED: "bg-gray-100 text-gray-800",
  IN_PROGRESS: "bg-yellow-100 text-yellow-800",
  COMPLETE: "bg-green-100 text-green-800",
  FLAGGED: "bg-red-100 text-red-800",
};
