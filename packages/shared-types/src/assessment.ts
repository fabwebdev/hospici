// shared-types/assessment.ts
// Assessment types consumed by both backend and frontend
// Framework-agnostic, zero runtime dependencies

export type AssessmentType = "FLACC" | "PAINAD" | "NRS" | "WONG_BAKER" | "ESAS";

export interface AssessmentResponse {
  id: string;
  patientId: string;
  assessmentType: AssessmentType;
  assessedAt: string;
  assessedBy: string;
  totalScore: number | null;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface AssessmentListResponse {
  assessments: AssessmentResponse[];
  total: number;
}

export interface TrajectoryDataPoint {
  id: string;
  assessedAt: string;
  assessmentType: AssessmentType;
  /** Pain score — totalScore for FLACC/PAINAD/NRS/WONG_BAKER; ESAS.pain for ESAS */
  pain: number | null;
  /** Shortness of breath — ESAS only */
  dyspnea: number | null;
  /** Nausea — ESAS only */
  nausea: number | null;
  /** Reserved for future functional assessment scales */
  functionalStatus: number | null;
}

export interface TrajectoryResponse {
  patientId: string;
  dataPoints: TrajectoryDataPoint[];
}
