// visitSchedule.ts
// Visit scheduling + frequency tracking types — T2-10.

export type VisitStatus = "scheduled" | "completed" | "missed" | "cancelled";

export type VisitScheduleDiscipline = "RN" | "SW" | "CHAPLAIN" | "THERAPY" | "AIDE";

export interface FrequencyPlan {
  visitsPerWeek: number;
  notes?: string;
}

export interface ScheduledVisitResponse {
  id: string;
  patientId: string;
  locationId: string;
  clinicianId: string | null;
  visitType: string;
  discipline: VisitScheduleDiscipline;
  scheduledDate: string; // ISO date
  frequencyPlan: FrequencyPlan;
  status: VisitStatus;
  completedAt: string | null;
  cancelledAt: string | null;
  missedReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduledVisitListResponse {
  data: ScheduledVisitResponse[];
  total: number;
}

export interface CreateScheduledVisitInput {
  visitType: string;
  discipline: VisitScheduleDiscipline;
  scheduledDate: string; // ISO date YYYY-MM-DD
  frequencyPlan: FrequencyPlan;
  clinicianId?: string;
  notes?: string;
}

export interface PatchScheduledVisitStatusInput {
  status: VisitStatus;
  missedReason?: string;
  notes?: string;
}
