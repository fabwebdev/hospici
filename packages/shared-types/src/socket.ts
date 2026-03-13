// socket.ts
// Shared Socket.IO event types for real-time communication

/**
 * Server-to-client events
 */
export interface ServerToClientEvents {
	// Clinical
	"patient:updated": (data: {
		patientId: string;
		updatedBy: string;
		timestamp: string;
	}) => void;

	"pain:assessment:new": (data: {
		patientId: string;
		patientName: string;
		urgent: boolean;
		alertMessage?: string;
	}) => void;

	"medication:administered": (data: {
		patientId: string;
		medicationName: string;
		administeredBy: string;
		timestamp: string;
	}) => void;

	// CMS Compliance Alerts
	"noe:deadline:warning": (data: {
		noeId: string;
		patientId: string;
		patientName: string;
		deadline: string;
		businessDaysRemaining: number;
	}) => void;

	"idg:due:warning": (data: {
		patientId: string;
		patientName: string;
		daysOverdue: number;
	}) => void;

	"cap:threshold:alert": (data: {
		locationId: string;
		capYear: number;
		utilizationPercent: number;
		projectedYearEndPercent: number;
		threshold: string;
	}) => void;

	"cap:calculation:complete": (data: {
		locationId: string;
		capYear: number;
		snapshotId: string;
		utilizationPercent: number;
		projectedYearEndPercent: number;
		calculatedAt: string;
	}) => void;

	"aide:supervision:overdue": (data: {
		aideId: string;
		aideName: string;
		patientId: string;
		daysOverdue: number;
	}) => void;

	// Compliance alert dashboard (T2-8)
	"compliance:alert": (data: {
		alertId: string;
		type: string;
		severity: "critical" | "warning" | "info";
		patientId: string;
		locationId: string;
		daysRemaining: number;
	}) => void;

	"compliance:alert:updated": (data: {
		alertId: string;
		type: string;
		status: string;
		patientId: string;
		updatedBy: string;
	}) => void;

	// IDG
	"idg:meeting:started": (data: {
		meetingId: string;
		attendees: Array<{ userId: string; name: string; role: string }>;
	}) => void;

	"idg:meeting:ended": (data: { meetingId: string }) => void;

	// Notifications
	"notification:new": (data: {
		id: string;
		type: "alert" | "warning" | "info";
		title: string;
		message: string;
		requiresAcknowledgement: boolean;
	}) => void;

	// HQRP Penalty (T1-7 / HQRP compliance)
	"hqrp:penalty:alert": (data: {
		locationId: string;
		calendarYear: number;
		quarter: number;
		periodId: string;
		/** Fiscal year in which the 2% Medicare reduction will apply */
		penaltyFiscalYear: number;
	}) => void;

	// System
	"system:maintenance": (data: {
		scheduledAt: string;
		durationMinutes: number;
	}) => void;

	"session:expiring": (data: { expiresInSeconds: number }) => void;

	// Note review (T2-9)
	"encounter:revision-requested": (data: {
		encounterId: string;
		reviewerId: string;
		revisionRequests: unknown[];
	}) => void;

	"encounter:resubmitted": (data: {
		encounterId: string;
		assignedReviewerId: string | null;
	}) => void;

	"review:assigned": (data: {
		encounterId: string;
		assignedReviewerId: string;
		assignedBy: string;
	}) => void;

	"review:approved": (data: {
		encounterId: string;
		reviewerId: string;
	}) => void;

	"review:escalated": (data: {
		encounterId: string;
		escalatedBy: string;
		escalationReason: string | undefined;
	}) => void;

	"review:overdue": (data: {
		overdueCount: number;
		checkedAt: string;
	}) => void;

	// Visit scheduling (T2-10)
	"visit:missed": (data: {
		missedCount: number;
		varianceCount: number;
		checkedAt: string;
	}) => void;

	// HOPE quality reporting (T3-1a)
	"hope:deadline:warning": (data: {
		assessmentId: string;
		patientId: string;
		assessmentType: "01" | "02" | "03";
		windowDeadline: string;
		hoursRemaining: number;
	}) => void;

	"hope:assessment:overdue": (data: {
		assessmentId: string;
		patientId: string;
		assessmentType: "01" | "02" | "03";
		windowDeadline: string;
		daysOverdue: number;
	}) => void;

	"hope:submission:rejected": (data: {
		assessmentId: string;
		submissionId: string;
		patientId: string;
		rejectionCodes: string[];
		rejectionDetails: string | null;
	}) => void;

	// NOE/NOTR Filing Workbench (T3-2a)
	"noe:late": (data: {
		noeId: string;
		patientId: string;
		patientName: string;
		deadline: string;
		daysOverdue: number;
	}) => void;

	"noe:accepted": (data: {
		noeId: string;
		patientId: string;
	}) => void;

	"noe:rejected": (data: {
		noeId: string;
		patientId: string;
		responseCode: string;
	}) => void;

	"notr:created": (data: {
		notrId: string;
		noeId: string;
		patientId: string;
		deadline: string;
	}) => void;

	"notr:deadline:warning": (data: {
		notrId: string;
		patientId: string;
		patientName: string;
		deadline: string;
		businessDaysRemaining: number;
	}) => void;

	"notr:late": (data: {
		notrId: string;
		patientId: string;
		patientName: string;
		deadline: string;
		daysOverdue: number;
	}) => void;

	"notr:accepted": (data: {
		notrId: string;
		patientId: string;
	}) => void;

	// F2F deadline events (T3-2b)
	"f2f:overdue": (data: {
		patientId: string;
		benefitPeriodId: string;
		periodNumber: number;
		recertDate: string;
		daysOverdue: number;
	}) => void;

	"order:f2f:required": (data: {
		patientId: string;
		benefitPeriodId: string;
		periodNumber: number;
		recertDate: string;
		taskId: string;
	}) => void;

	// Benefit Period Control System (T3-4)
	"benefit:period:status:changed": (data: {
		locationId: string;
		periodId: string;
		patientId: string;
		periodNumber: number;
		oldStatus: string;
		newStatus: string;
		billingRisk: boolean;
		checkedAt: string;
	}) => void;

	"benefit:period:recert_task": (data: {
		periodId: string;
		patientId: string;
		locationId: string;
		periodNumber: number;
		recertDueDate: string;
		severity: "warning" | "critical";
	}) => void;

	"benefit:period:f2f_task": (data: {
		periodId: string;
		patientId: string;
		locationId: string;
		periodNumber: number;
		f2fWindowStart: string;
		f2fWindowEnd: string;
		severity: "warning" | "critical";
	}) => void;

	// Security
	"break:glass:access": (data: {
		userId: string;
		userName: string;
		patientId: string;
		reason: string;
		expiresAt: string;
	}) => void;

	// Electronic Signatures (T3-5)
	"signature:requested": (data: {
		requestId: string;
		patientId: string;
		documentType: string;
		documentId: string;
		requestedBy: string;
	}) => void;

	"signature:completed": (data: {
		requestId: string;
		patientId: string;
		documentType: string;
		documentId: string;
		signedBy: string;
		signedAt: string;
	}) => void;

	"signature:rejected": (data: {
		requestId: string;
		patientId: string;
		documentType: string;
		documentId: string;
		rejectedBy: string;
		reason: string;
	}) => void;

	"signature:overdue": (data: {
		requestId: string;
		patientId: string;
		documentType: string;
		documentId: string;
		daysOverdue: number;
	}) => void;

	// Claim Audit Rules Engine + Bill-Hold Dashboard (T3-12)
	"billing:audit:failed": (data: {
		claimId: string;
		patientId: string;
		locationId: string;
		blockCount: number;
		warnCount: number;
	}) => void;

	"billing:hold:placed": (data: {
		claimId: string;
		patientId: string;
		locationId: string;
		holdReason: string;
		placedBy: string;
	}) => void;

	"billing:hold:released": (data: {
		claimId: string;
		patientId: string;
		locationId: string;
		releasedBy: string;
	}) => void;

	"billing:override:approved": (data: {
		claimId: string;
		patientId: string;
		locationId: string;
		ruleCode: string;
		overriddenBy: string;
	}) => void;

	// Physician Order Inbox (T3-9)
	"order:created": (data: {
		orderId: string;
		type: string;
		patientId: string;
		physicianId: string | null;
		dueAt: string;
		urgencyReason: string | null;
	}) => void;

	"order:viewed": (data: {
		orderId: string;
		physicianId: string;
	}) => void;

	"order:signed": (data: {
		orderId: string;
		signedAt: string;
	}) => void;

	"order:rejected": (data: {
		orderId: string;
		rejectionReason: string;
	}) => void;

	"order:expired": (data: {
		orderId: string;
		type: string;
		patientId: string;
	}) => void;

	"order:overdue": (data: {
		orderId: string;
		hoursOverdue: number;
		blockedDownstream: string | null;
	}) => void;

	"order:expiring": (data: {
		orderId: string;
		hoursRemaining: number;
		blockedDownstream: string | null;
	}) => void;

	"order:exception": (data: {
		orderId: string;
		noSignatureReason: string;
	}) => void;

	"order:completed_returned": (data: {
		orderId: string;
		completedReturnedAt: string;
	}) => void;

	"order:reminder": (data: {
		orderId: string;
		patientId: string;
		reminderCount: number;
	}) => void;

	"order:return:overdue": (data: {
		orderId: string;
		patientId: string;
		daysSinceSigned: number;
	}) => void;

	// QAPI Management + Clinician Quality Scorecards (T3-11)
	"qapi:event:created": (data: {
		eventId: string;
		locationId: string;
		eventType: string;
	}) => void;

	"qapi:event:closed": (data: {
		eventId: string;
		locationId: string;
	}) => void;

	"qapi:action:overdue": (data: {
		eventId: string;
		actionItemId: string;
		assignedToId: string;
		locationId: string;
	}) => void;

	"quality:outlier:detected": (data: {
		outlier: import("./qapi.js").QualityOutlier;
	}) => void;

	// ADR / TPE / Survey Record Packet Export (T3-10)
	"export:ready": (data: {
		exportId: string;
		patientId: string;
		locationId: string;
		purpose: string;
		generatedAt: string;
	}) => void;

	"export:failed": (data: {
		exportId: string;
		patientId: string;
		locationId: string;
		errorMessage: string;
	}) => void;
}

/**
 * Client-to-server events
 */
export interface ClientToServerEvents {
	"presence:join": (data: { locationId: string }) => void;
	"presence:leave": () => void;
	"presence:heartbeat": () => void;
	"note:editing:start": (data: { noteId: string }) => void;
	"note:editing:stop": (data: { noteId: string }) => void;
	"idg:join": (data: { meetingId: string }) => void;
	"idg:leave": (data: { meetingId: string }) => void;
	"notification:acknowledge": (data: { notificationId: string }) => void;
}
