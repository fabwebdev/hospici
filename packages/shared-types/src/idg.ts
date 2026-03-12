// packages/shared-types/src/idg.ts
// IDG meeting types shared between backend and frontend

export interface IDGAttendeeNoteEntry {
  role: string;
  notes: string;
  goalsReviewed: boolean;
  concerns: string | null;
}

export type IDGAttendeeNotes = Record<string, IDGAttendeeNoteEntry>;

export type IDGAttendanceStatus = "present" | "absent" | "excused" | "remote";
export type IDGMeetingStatus = "scheduled" | "in_progress" | "completed" | "cancelled";

export interface IDGMemberResponse {
  userId: string;
  name: string;
  role: string;
  status: IDGAttendanceStatus;
}

export interface IDGMeetingResponse {
  id: string;
  patientId: string;
  locationId: string;
  scheduledAt: string;
  completedAt: string | null;
  status: IDGMeetingStatus;
  attendees: IDGMemberResponse[];
  rnPresent: boolean;
  mdPresent: boolean;
  swPresent: boolean;
  daysSinceLastIdg: number | null;
  isCompliant: boolean;
  carePlanReviewed: boolean;
  symptomManagementDiscussed: boolean;
  goalsOfCareReviewed: boolean;
  notes: string | null;
  attendeeNotes: IDGAttendeeNotes;
  assembledNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IDGMeetingListResponse {
  meetings: IDGMeetingResponse[];
  total: number;
}

export interface IDGComplianceStatus {
  patientId: string;
  compliant: boolean;
  daysSinceLastIdg: number | null;
  daysOverdue: number;
  lastMeetingId: string | null;
  lastMeetingDate: string | null;
}

export interface CreateIDGMeetingInput {
  patientId: string;
  scheduledAt: string;
  attendees: IDGMemberResponse[];
  carePlanReviewed?: boolean;
  symptomManagementDiscussed?: boolean;
  goalsOfCareReviewed?: boolean;
  notes?: string;
}
