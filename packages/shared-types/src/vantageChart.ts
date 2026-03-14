/**
 * VantageChart shared types — consumed by both frontend and backend.
 * Zero runtime dependencies.
 */

export type VisitType =
  | "routine_rn"
  | "admission"
  | "recertification"
  | "supervisory"
  | "prn"
  | "discharge"
  | "social_work"
  | "chaplain"
  | "physician_attestation"
  | "progress_note";

export interface AddendumEntry {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

export type EncounterStatus = "DRAFT" | "COMPLETED" | "SIGNED";
export type VantageChartMethod = "TEMPLATE" | "LLM";

export interface VantageChartInput {
  visitType: VisitType;
  patientStatus: {
    overallCondition: "stable" | "declining" | "improving" | "critical" | "deceased";
    isAlertAndOriented: boolean;
    orientationLevel?: "x0" | "x1" | "x2" | "x3" | "x4";
  };
  painAssessment: {
    hasPain: boolean;
    painScale?: number;
    painLocation?: string;
    painQuality?: ("sharp" | "dull" | "aching" | "burning" | "throbbing")[];
    painManagementEffective?: boolean;
    breakthroughPain?: boolean;
  };
  symptoms: Array<{
    symptom:
      | "pain"
      | "dyspnea"
      | "fatigue"
      | "nausea"
      | "depression"
      | "anxiety"
      | "drowsiness"
      | "appetite"
      | "wellbeing";
    severity: number;
    isNew: boolean;
    isWorsening: boolean;
    interventionProvided: boolean;
  }>;
  interventions: Array<{
    category:
      | "medication_admin"
      | "wound_care"
      | "symptom_management"
      | "psychosocial_support"
      | "spiritual_care"
      | "caregiver_education"
      | "safety_assessment"
      | "equipment";
    description: string;
    patientResponse: "positive" | "neutral" | "negative";
  }>;
  psychosocial: {
    caregiverCoping: "well" | "adequate" | "struggling" | "crisis";
    patientMood: "calm" | "anxious" | "depressed" | "agitated" | "peaceful";
    spiritualConcerns?: boolean;
  };
  carePlan: {
    frequenciesFollowed: boolean;
    medicationCompliance: "compliant" | "partial" | "noncompliant";
    barriers?: string[];
  };
  safety: {
    fallRisk: "low" | "moderate" | "high";
    equipmentNeeds?: string[];
    environmentConcerns?: string[];
  };
  planChanges: Array<{
    type:
      | "new_order"
      | "discontinue"
      | "frequency_change"
      | "medication_change";
    description: string;
    requiresPhysician: boolean;
  }>;
  additionalNotes?: string;
  recordedAt: string;
  inputMethod: "touch" | "voice" | "mixed";
}

export interface TraceabilityEntry {
  narrativeSegment: string;
  sourceFragment: string;
  inputData: string;
}

export interface EncounterResponse {
  id: string;
  patientId: string;
  locationId: string;
  clinicianId: string;
  visitType: VisitType;
  status: EncounterStatus;
  data?: VantageChartInput;
  vantageChartDraft?: string;
  vantageChartMethod?: VantageChartMethod;
  vantageChartAcceptedAt?: string;
  vantageChartTraceability?: TraceabilityEntry[];
  addenda: AddendumEntry[];
  visitedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface EncounterListResponse {
  encounters: EncounterResponse[];
  total: number;
}

export interface GenerateNarrativeResponse {
  draft: string;
  method: "TEMPLATE";
  metadata: {
    sectionCount: number;
    fragmentCount: number;
    wordCount: number;
    completenessPercent: number;
  };
  traceability: TraceabilityEntry[];
  similarityWarning: boolean;
}

export interface EnhanceNarrativeResponse {
  enhanced: string;
  original: string;
  method: "LLM";
  tokensUsed: number;
}

export interface ContextAlert {
  type: "warning" | "info" | "critical";
  message: string;
  sourceData: string;
}

export interface PatientContextResponse {
  suggestions: Record<string, string | number | boolean | null | Record<string, string | number | boolean | null>>;
  trends: {
    painTrend: "improving" | "worsening" | "stable" | "insufficient_data";
    symptomBurdenScore: number;
    functionalDeclineRate: number;
  };
  alerts: ContextAlert[];
  idgRelevance: {
    significantChanges: boolean;
    topicsForDiscussion: string[];
  };
  lastAcceptedDraft: string | null;
  lastAcceptedInput: string | null;
}

export type VantageChartStep =
  | "patient-status"
  | "pain-assessment"
  | "symptom-review"
  | "interventions"
  | "psychosocial"
  | "care-plan"
  | "safety"
  | "plan-changes"
  | "review";

export const VANTAGE_CHART_STEPS: VantageChartStep[] = [
  "patient-status",
  "pain-assessment",
  "symptom-review",
  "interventions",
  "psychosocial",
  "care-plan",
  "safety",
  "plan-changes",
  "review",
];

export type CreateEncounterInput = { visitType: VisitType; visitedAt?: string };

export type PatchEncounterInput = {
  status?: EncounterStatus;
  data?: VantageChartInput;
  vantageChartDraft?: string;
  vantageChartMethod?: VantageChartMethod;
  vantageChartAcceptedAt?: string;
  vantageChartTraceability?: TraceabilityEntry[];
  /** Append a single addendum to encounters.addenda — backend merges, never replaces */
  addendum?: AddendumEntry;
};
