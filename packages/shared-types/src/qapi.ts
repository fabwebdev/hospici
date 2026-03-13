// qapi.ts
// T3-11 QAPI Management + Clinician Quality Scorecards shared types.

export interface QAPITrendContext {
	metric: string;
	value?: number;
	threshold?: number;
	locationId?: string;
	discipline?: string;
	subjectId?: string;
	detectedAt?: string;
}

export type QAPIEventType =
  | "ADVERSE_EVENT"
  | "NEAR_MISS"
  | "COMPLAINT"
  | "GRIEVANCE"
  | "QUALITY_TREND";

export type QAPIEventStatus = "OPEN" | "IN_PROGRESS" | "CLOSED";

export type QAPIDiscipline = "RN" | "SW" | "CHAPLAIN" | "THERAPY" | "AIDE";

export interface QAPIActionItem {
	id: string;
	eventId: string;
	locationId: string;
	action: string;
	assignedToId: string;
	assignedToName: string;
	dueDate: string;
	completedAt: string | null;
	completedById: string | null;
	createdAt: string;
}

export interface QAPIEvent {
	id: string;
	locationId: string;
	eventType: QAPIEventType;
	patientId: string | null;
	reportedById: string;
	reportedByName: string;
	occurredAt: string;
	description: string;
	rootCauseAnalysis: string | null;
	linkedTrendContext: QAPITrendContext | null;
	status: QAPIEventStatus;
	closedAt: string | null;
	closedById: string | null;
	closureEvidence: string | null;
	actionItems: QAPIActionItem[];
	createdAt: string;
	updatedAt: string;
}

export interface QAPIEventListResponse {
	data: QAPIEvent[];
	total: number;
}

export interface QAPICreateBody {
	eventType: QAPIEventType;
	patientId?: string;
	occurredAt: string;
	description: string;
	rootCauseAnalysis?: string;
	linkedTrendContext?: QAPITrendContext;
}

export interface QAPIPatchBody {
	eventType?: QAPIEventType;
	status?: "OPEN" | "IN_PROGRESS";
	description?: string;
	rootCauseAnalysis?: string;
}

export interface QAPICloseBody {
	closureEvidence: string;
}

export interface QAPIAddActionItemBody {
	action: string;
	assignedToId: string;
	dueDate: string;
}

export interface QAPIListQuery {
	status?: QAPIEventStatus;
	eventType?: QAPIEventType;
	locationId?: string;
	from?: string;
	to?: string;
	limit?: number;
	offset?: number;
}

// ── Clinician scorecards ──────────────────────────────────────────────────────

export interface ClinicianQualityScorecard {
	clinicianId: string;
	clinicianName: string;
	discipline: QAPIDiscipline;
	period: { from: string; to: string };
	totalNotes: number;
	firstPassApprovalRate: number;
	averageRevisionCount: number;
	medianTurnaroundHours: number;
	overdueReviewRate: number;
	billingImpactRate: number;
	complianceImpactRate: number;
	deficiencyBreakdown: Record<string, number>;
	commonDeficiencyTypes: { type: string; count: number }[];
	revisionTrend: { week: string; count: number }[];
}

export interface ScorecardListResponse {
	data: ClinicianQualityScorecard[];
	period: { from: string; to: string };
}

export interface ScorecardQuery {
	locationId?: string;
	discipline?: QAPIDiscipline;
	from?: string;
	to?: string;
}

// ── Deficiency trends ─────────────────────────────────────────────────────────

export interface DeficiencyTrendPoint {
	week: string;
	byType: Record<string, number>;
	totalDeficiencies: number;
	firstPassRate: number;
}

export interface DeficiencyTrendReport {
	locationId: string | null;
	discipline: string | null;
	period: { from: string; to: string };
	topDeficiencyTypes: { type: string; count: number }[];
	trend: DeficiencyTrendPoint[];
	branchComparison: {
		locationId: string;
		locationName: string;
		firstPassRate: number;
		totalDeficiencies: number;
	}[];
	disciplineComparison: {
		discipline: string;
		firstPassRate: number;
		topDeficiency: string;
	}[];
	branchDisciplineMatrix: {
		locationId: string;
		discipline: string;
		firstPassRate: number;
		deficiencyCount: number;
	}[];
	reviewerWorkload: {
		reviewerId: string;
		reviewerName: string;
		assigned: number;
		resolved: number;
		overdueCount: number;
	}[];
}

export interface TrendQuery {
	locationId?: string;
	discipline?: QAPIDiscipline;
	from?: string;
	to?: string;
	deficiencyType?: string;
}

// ── Quality outlier ───────────────────────────────────────────────────────────

export interface QualityOutlier {
	subjectType: "CLINICIAN" | "BRANCH" | "DISCIPLINE";
	subjectId: string;
	subjectName: string;
	metric: string;
	value: number;
	threshold: number;
	detectedAt: string;
}

export interface QualityOutlierListResponse {
	data: QualityOutlier[];
	period: { from: string; to: string };
}
