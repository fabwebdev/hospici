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
		projectedOverage: number;
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

	// Security
	"break:glass:access": (data: {
		userId: string;
		userName: string;
		patientId: string;
		reason: string;
		expiresAt: string;
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
