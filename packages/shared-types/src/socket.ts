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
