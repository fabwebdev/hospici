// config/typebox-compiler.ts
// Central registry for ALL AOT-compiled TypeBox validators.
// ⚠️  CRITICAL: Never call TypeCompiler.Compile() inside functions, class methods,
// request handlers, or loops. Module-level only (here or in schema files).

import { TypeCompiler } from "@sinclair/typebox/compiler";

import {
  HOPEAdmissionSchema,
  HOPEDischargeAssessmentSchema,
  HOPEReportingPeriodSchema,
  HOPEUpdateVisitSchema,
  HOPEiQIESSubmissionSchema,
} from "@/contexts/analytics/schemas/hope.schema";
import {
  HOPEComprehensiveAssessmentMeasureSchema,
  HOPEHVLDLMeasureSchema,
  HOPEHospiceCareIndexSchema,
  HOPETreatmentPreferencesMeasureSchema,
} from "@/contexts/analytics/schemas/hopeQualityMeasures.schema";
import { BenefitPeriodSchema, CapCalculationSchema, NOESchema } from "@/contexts/billing/schemas";
import {
  CreatePatientBodySchema,
  FlaccScaleSchema,
  PatchPatientBodySchema,
  PatientListQuerySchema,
  PatientSchema,
} from "@/contexts/clinical/schemas";
import {
  AssessmentListResponseSchema,
  AssessmentResponseSchema,
  CreateAssessmentBodySchema,
  TrajectoryResponseSchema,
} from "@/contexts/clinical/schemas/assessment.schema";
import {
  CarePlanResponseSchema,
  CreateCarePlanBodySchema,
  DisciplineTypeSchema,
  PatchCarePlanBodySchema,
  PhysicianReviewBodySchema,
} from "@/contexts/clinical/schemas/carePlan.schema";
import { EsasScaleSchema } from "@/contexts/clinical/schemas/esasScale.schema";
import {
  CreateEncounterBodySchema,
  EnhanceNarrativeBodySchema,
  GenerateNarrativeBodySchema,
  PatchEncounterBodySchema,
} from "@/contexts/clinical/schemas/encounter.schema";
import {
  CreateAllergyBodySchema,
  CreateMedicationBodySchema,
  MedicationAdministrationSchema,
  MedicationListResponseSchema,
  MedicationResponseSchema,
  PatchAllergyBodySchema,
  PatchMedicationBodySchema,
  PatientAllergySchema,
  RecordAdministrationBodySchema,
} from "@/contexts/clinical/schemas/medication.schema";
import { NrsScaleSchema } from "@/contexts/clinical/schemas/nrsScale.schema";
import { PainadScaleSchema } from "@/contexts/clinical/schemas/painadScale.schema";
import { WongBakerScaleSchema } from "@/contexts/clinical/schemas/wongBakerScale.schema";
import {
	AlertListResponseSchema,
	AlertStatusPatchBodySchema,
} from "@/contexts/compliance/schemas/alert.schema.js";
import {
  AssignReviewBodySchema,
  BulkAcknowledgeBodySchema,
  EscalateReviewBodySchema,
  ReviewHistoryResponseSchema,
  ReviewQueueItemSchema,
  ReviewQueueResponseSchema,
  SubmitReviewBodySchema,
} from "@/contexts/clinical/schemas/noteReview.schema.js";
// Import all schemas
import { BreakGlassSchema, SessionSchema, UserSchema } from "@/contexts/identity/schemas";
import { AuditLogSchema } from "@/contexts/identity/schemas/audit.schema";
import {
  AideSupervisionSchema,
  CompleteIDGMeetingBodySchema,
  CreateIDGMeetingBodySchema,
  IDGComplianceStatusSchema,
  IDGMeetingListResponseSchema,
  IDGMeetingResponseSchema,
  IDGMeetingSchema,
} from "@/contexts/scheduling/schemas";

/**
 * Central validator registry - compiled ONCE at application startup
 * All validators are AOT-compiled for O(1) runtime validation
 */
export const Validators = {
  // Identity
  User: TypeCompiler.Compile(UserSchema),
  Session: TypeCompiler.Compile(SessionSchema),
  BreakGlass: TypeCompiler.Compile(BreakGlassSchema),
  AuditLog: TypeCompiler.Compile(AuditLogSchema),

  // Clinical — patients
  Patient: TypeCompiler.Compile(PatientSchema),
  CreatePatientBody: TypeCompiler.Compile(CreatePatientBodySchema),
  PatchPatientBody: TypeCompiler.Compile(PatchPatientBodySchema),
  PatientListQuery: TypeCompiler.Compile(PatientListQuerySchema),

  // Clinical — pain/symptom assessment scales
  FlaccScale: TypeCompiler.Compile(FlaccScaleSchema),
  PainadScale: TypeCompiler.Compile(PainadScaleSchema),
  NrsScale: TypeCompiler.Compile(NrsScaleSchema),
  WongBakerScale: TypeCompiler.Compile(WongBakerScaleSchema),
  EsasScale: TypeCompiler.Compile(EsasScaleSchema),

  // Clinical — care plan
  DisciplineType: TypeCompiler.Compile(DisciplineTypeSchema),
  CreateCarePlanBody: TypeCompiler.Compile(CreateCarePlanBodySchema),
  PatchCarePlanBody: TypeCompiler.Compile(PatchCarePlanBodySchema),
  CarePlanResponse: TypeCompiler.Compile(CarePlanResponseSchema),
  PhysicianReviewBody: TypeCompiler.Compile(PhysicianReviewBodySchema),

  // Clinical — medications, MAR, allergies
  CreateMedicationBody: TypeCompiler.Compile(CreateMedicationBodySchema),
  PatchMedicationBody: TypeCompiler.Compile(PatchMedicationBodySchema),
  MedicationResponse: TypeCompiler.Compile(MedicationResponseSchema),
  MedicationListResponse: TypeCompiler.Compile(MedicationListResponseSchema),
  RecordAdministrationBody: TypeCompiler.Compile(RecordAdministrationBodySchema),
  MedicationAdministration: TypeCompiler.Compile(MedicationAdministrationSchema),
  CreateAllergyBody: TypeCompiler.Compile(CreateAllergyBodySchema),
  PatchAllergyBody: TypeCompiler.Compile(PatchAllergyBodySchema),
  PatientAllergy: TypeCompiler.Compile(PatientAllergySchema),

  // Clinical — encounters + VantageChart
  CreateEncounterBody: TypeCompiler.Compile(CreateEncounterBodySchema),
  PatchEncounterBody: TypeCompiler.Compile(PatchEncounterBodySchema),
  GenerateNarrativeBody: TypeCompiler.Compile(GenerateNarrativeBodySchema),
  EnhanceNarrativeBody: TypeCompiler.Compile(EnhanceNarrativeBodySchema),

  // Clinical — assessment CRUD + trajectory
  CreateAssessmentBody: TypeCompiler.Compile(CreateAssessmentBodySchema),
  AssessmentResponse: TypeCompiler.Compile(AssessmentResponseSchema),
  AssessmentListResponse: TypeCompiler.Compile(AssessmentListResponseSchema),
  TrajectoryResponse: TypeCompiler.Compile(TrajectoryResponseSchema),

  // Billing
  NOE: TypeCompiler.Compile(NOESchema),
  BenefitPeriod: TypeCompiler.Compile(BenefitPeriodSchema),
  CapCalculation: TypeCompiler.Compile(CapCalculationSchema),

  // Scheduling — IDG
  IDGMeeting: TypeCompiler.Compile(IDGMeetingSchema),
  CreateIDGMeetingBody: TypeCompiler.Compile(CreateIDGMeetingBodySchema),
  CompleteIDGMeetingBody: TypeCompiler.Compile(CompleteIDGMeetingBodySchema),
  IDGMeetingResponse: TypeCompiler.Compile(IDGMeetingResponseSchema),
  IDGMeetingListResponse: TypeCompiler.Compile(IDGMeetingListResponseSchema),
  IDGComplianceStatus: TypeCompiler.Compile(IDGComplianceStatusSchema),
  AideSupervision: TypeCompiler.Compile(AideSupervisionSchema),

  // Compliance alerts
  AlertListResponse: TypeCompiler.Compile(AlertListResponseSchema),
  AlertStatusPatchBody: TypeCompiler.Compile(AlertStatusPatchBodySchema),

  // Clinical — note review (T2-9)
  SubmitReviewBody: TypeCompiler.Compile(SubmitReviewBodySchema),
  AssignReviewBody: TypeCompiler.Compile(AssignReviewBodySchema),
  EscalateReviewBody: TypeCompiler.Compile(EscalateReviewBodySchema),
  BulkAcknowledgeBody: TypeCompiler.Compile(BulkAcknowledgeBodySchema),
  ReviewQueueItem: TypeCompiler.Compile(ReviewQueueItemSchema),
  ReviewQueueResponse: TypeCompiler.Compile(ReviewQueueResponseSchema),
  ReviewHistoryResponse: TypeCompiler.Compile(ReviewHistoryResponseSchema),

  // Analytics — HOPE Quality Reporting (replaces HIS, effective 2025-10-01)
  HOPEAdmission: TypeCompiler.Compile(HOPEAdmissionSchema),
  HOPEUpdateVisit: TypeCompiler.Compile(HOPEUpdateVisitSchema),
  HOPEDischarge: TypeCompiler.Compile(HOPEDischargeAssessmentSchema),
  HOPEiQIESSubmission: TypeCompiler.Compile(HOPEiQIESSubmissionSchema),
  HOPEReportingPeriod: TypeCompiler.Compile(HOPEReportingPeriodSchema),
  HOPEComprehensiveAssessmentMeasure: TypeCompiler.Compile(
    HOPEComprehensiveAssessmentMeasureSchema,
  ),
  HOPEHVLDLMeasure: TypeCompiler.Compile(HOPEHVLDLMeasureSchema),
  HOPETreatmentPreferencesMeasure: TypeCompiler.Compile(HOPETreatmentPreferencesMeasureSchema),
  HOPEHospiceCareIndex: TypeCompiler.Compile(HOPEHospiceCareIndexSchema),
};

/**
 * Helper type for validator names
 */
export type ValidatorName = keyof typeof Validators;

/**
 * Get a validator by name
 */
export function getValidator<T extends ValidatorName>(name: T): (typeof Validators)[T] {
  const validator = Validators[name];
  if (!validator) {
    throw new Error(`Validator not found: ${name}`);
  }
  return validator;
}

/**
 * Validate data against a schema
 */
export function validate<T extends ValidatorName>(
  name: T,
  data: unknown,
): { valid: boolean; errors?: Array<{ path: string; message: string }> } {
  const validator = getValidator(name);
  if (validator.Check(data)) {
    return { valid: true };
  }
  return {
    valid: false,
    errors: [...validator.Errors(data)].map((e) => ({
      path: e.path,
      message: e.message,
    })),
  };
}
