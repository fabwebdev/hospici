// packages/shared-types/src/carePlan.ts
// Care plan types shared between backend and frontend.
// Zero runtime dependencies — types only.

export type DisciplineType = "RN" | "SW" | "CHAPLAIN" | "THERAPY" | "AIDE" | "VOLUNTEER" | "BEREAVEMENT" | "PHYSICIAN";

export type SmartGoalStatus = "active" | "met" | "revised";

export interface SmartGoal {
  id: string;
  goal: string;
  specific: string;
  measurable: string;
  achievable: string;
  relevant: string;
  timeBound: string;
  targetDate: string; // ISO date string (YYYY-MM-DD)
  status: SmartGoalStatus;
}

export interface DisciplineSection {
  notes: string;
  goals: SmartGoal[];
  lastUpdatedBy: string; // userId UUID
  lastUpdatedAt: string; // ISO date-time
}

export type DisciplineSections = Partial<Record<DisciplineType, DisciplineSection>>;

export interface PhysicianReviewEntry {
  reviewedBy: string;
  reviewedAt: string;
  type: "initial" | "ongoing";
  signatureNote: string;
}

export interface PhysicianReview {
  initialReviewDeadline: string | null;
  initialReviewCompletedAt: string | null;
  initialReviewedBy: string | null;
  lastReviewAt: string | null;
  nextReviewDue: string | null;
  reviewHistory: PhysicianReviewEntry[];
  isInitialReviewOverdue: boolean;
  isOngoingReviewOverdue: boolean;
}

export interface CarePlanResponse {
  id: string;
  patientId: string;
  locationId: string;
  disciplineSections: DisciplineSections;
  physicianReview: PhysicianReview;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PhysicianReviewInput {
  type: "initial" | "ongoing";
  signatureNote: string;
}

export interface CreateCarePlanInput {
  notes?: string;
  goals?: SmartGoal[];
}

export interface PatchCarePlanInput {
  notes?: string;
  goals?: SmartGoal[];
}
