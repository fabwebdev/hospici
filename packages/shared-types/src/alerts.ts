// alerts.ts
// Compliance alert types shared between backend and frontend.
// AlertType: 10 operational types for T2-8. Billing and HOPE types deferred to T3-1/T3-12.

export const AlertType = {
	NOE_DEADLINE: "NOE_DEADLINE", // 42 CFR §418.22 — 5-day rule
	NOTR_DEADLINE: "NOTR_DEADLINE", // 5-day revocation rule
	IDG_OVERDUE: "IDG_OVERDUE", // 42 CFR §418.56 — hard block
	AIDE_SUPERVISION_OVERDUE: "AIDE_SUPERVISION_OVERDUE", // 42 CFR §418.76
	AIDE_SUPERVISION_UPCOMING: "AIDE_SUPERVISION_UPCOMING", // day 12 warning
	HOPE_WINDOW_CLOSING: "HOPE_WINDOW_CLOSING", // ≤2 days remaining
	F2F_REQUIRED: "F2F_REQUIRED", // benefit period 3+
	CAP_THRESHOLD: "CAP_THRESHOLD", // ≥80% hospice cap
	BENEFIT_PERIOD_EXPIRING: "BENEFIT_PERIOD_EXPIRING", // recert needed
	RECERTIFICATION_DUE: "RECERTIFICATION_DUE", // cert expiring + F2F dependency
	// T2-9 — note review
	NOTE_REVIEW_REQUIRED: "NOTE_REVIEW_REQUIRED", // note submitted, awaiting supervisor
	NOTE_INCOMPLETE: "NOTE_INCOMPLETE", // note missing required sections
	NOTE_OVERDUE_REVIEW: "NOTE_OVERDUE_REVIEW", // review SLA exceeded (dueBy passed)
	// T2-10 — visit scheduling
	MISSED_VISIT: "MISSED_VISIT", // scheduled visit passed with no completion
	VISIT_FREQUENCY_VARIANCE: "VISIT_FREQUENCY_VARIANCE", // actual < planned frequency
	// T3-2a — NOE/NOTR filing workbench
	NOE_LATE: "NOE_LATE", // NOE deadline passed — claims blocked
	NOTR_LATE: "NOTR_LATE", // NOTR deadline passed — claims blocked
	// T3-2b — F2F Validity Engine
	F2F_MISSING: "F2F_MISSING", // no valid F2F for period 3+ recertification
	F2F_INVALID: "F2F_INVALID", // F2F exists but failed CMS validity rules
	// T3-3 — Cap Intelligence Module
	CAP_THRESHOLD_70: "CAP_THRESHOLD_70",
	CAP_THRESHOLD_80: "CAP_THRESHOLD_80",
	CAP_THRESHOLD_90: "CAP_THRESHOLD_90",
	CAP_PROJECTED_OVERAGE: "CAP_PROJECTED_OVERAGE",
} as const;

export type AlertType = (typeof AlertType)[keyof typeof AlertType];

/**
 * Hard-block types cannot be snoozed.
 * IDG_OVERDUE, NOE_DEADLINE (critical), NOTR_DEADLINE (critical),
 * HOPE_WINDOW_CLOSING (when daysRemaining ≤ 0).
 */
export const HARD_BLOCK_ALERT_TYPES: ReadonlySet<AlertType> = new Set<AlertType>([
	AlertType.IDG_OVERDUE,
	AlertType.NOE_DEADLINE,
	AlertType.NOTR_DEADLINE,
	AlertType.HOPE_WINDOW_CLOSING,
]);

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertStatus = "new" | "acknowledged" | "assigned" | "resolved";

export interface Alert {
	id: string;
	type: AlertType;
	severity: AlertSeverity;
	patientId: string;
	patientName: string; // PHI — encrypted at rest, decrypted for PHI_ACCESS roles only
	locationId: string;
	dueDate: string | null; // ISO date
	daysRemaining: number;
	description: string;
	// "Why blocked?" pattern — every alert must populate both fields
	rootCause: string; // machine-readable, e.g. "NOE not submitted"
	nextAction: string; // human-readable step, e.g. "Submit NOE before Friday"
	// Escalation state
	status: AlertStatus;
	assignedTo: string | null; // userId
	snoozedUntil: string | null; // ISO date — null for hard-block types
	resolvedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface AlertListResponse {
	data: Alert[];
	total: number;
}

export interface AlertStatusPatchBody {
	status: AlertStatus;
	assignedTo?: string | null;
	snoozedUntil?: string | null;
}

/** Input for upsertAlert in the service — used by BullMQ workers */
export interface UpsertAlertInput {
	type: AlertType;
	severity: AlertSeverity;
	patientId: string;
	patientName: string;
	locationId: string;
	dueDate: string | null;
	daysRemaining: number;
	description: string;
	rootCause: string;
	nextAction: string;
}
