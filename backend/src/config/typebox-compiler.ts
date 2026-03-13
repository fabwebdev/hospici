// config/typebox-compiler.ts
// Central registry for ALL AOT-compiled TypeBox validators.
// ⚠️  CRITICAL: Never call TypeCompiler.Compile() inside functions, class methods,
// request handlers, or loops. Module-level only (here or in schema files).

import {
  AuditDashboardResponseSchema,
  AuditFailureSchema,
  AuditResultSchema,
  AuditSnapshotResponseSchema,
  BulkHoldBodySchema,
  BulkReleaseBodySchema,
  WarnOverrideBodySchema,
} from "@/contexts/billing/schemas/claimAudit.schema.js";
import {
  CountersignBodySchema,
  CreateSignatureRequestBodySchema,
  MarkExceptionBodySchema,
  RejectSignatureBodySchema,
  SignDocumentBodySchema,
  SignatureListQuerySchema,
  SignatureListResponseSchema,
  VoidSignatureBodySchema,
} from "@/contexts/signatures/schemas/signature.schema.js";
import { TypeCompiler } from "@sinclair/typebox/compiler";

import {
  HOPEAdmissionSchema,
  HOPEDischargeAssessmentSchema,
  HOPEReportingPeriodSchema,
  HOPEUpdateVisitSchema,
  HOPEiQIESSubmissionSchema,
} from "@/contexts/analytics/schemas/hope.schema";
import {
  CreateHOPEAssessmentBodySchema,
  HOPEAssessmentListQuerySchema,
  HOPEAssessmentListResponseSchema,
  HOPEAssessmentResponseSchema,
  HOPEDashboardResponseSchema,
  HOPEPatientTimelineSchema,
  HOPEQualityBenchmarkSchema,
  HOPESubmissionListResponseSchema,
  HOPESubmissionRowSchema,
  HOPEValidationResultSchema,
  PatchHOPEAssessmentBodySchema,
} from "@/contexts/analytics/schemas/hopeAssessmentCrud.schema";
import {
  HOPEComprehensiveAssessmentMeasureSchema,
  HOPEHVLDLMeasureSchema,
  HOPEHospiceCareIndexSchema,
  HOPETreatmentPreferencesMeasureSchema,
} from "@/contexts/analytics/schemas/hopeQualityMeasures.schema";
import { CapCalculationSchema } from "@/contexts/billing/schemas";
import {
  BenefitPeriodDetailResponseSchema,
  BenefitPeriodListQuerySchema,
  BenefitPeriodListResponseSchema,
  BenefitPeriodResponseSchema,
  BenefitPeriodTimelineResponseSchema,
  CommitRecalculationBodySchema,
  CorrectPeriodBodySchema,
  RecalculationPreviewResponseSchema,
  RecertifyBodySchema,
  SetReportingPeriodBodySchema,
} from "@/contexts/billing/schemas/benefitPeriod.schema.js";
import {
  CapPatientListResponseSchema,
  CapSnapshotResponseSchema,
  CapSummaryResponseSchema,
  CapTrendResponseSchema,
  RecalculateCapResponseSchema,
} from "@/contexts/billing/schemas/capIntelligence.schema.js";
import {
  ClaimRemittanceResponseSchema,
  IngestERABodySchema,
  IngestERAResultSchema,
  ManualMatchBodySchema,
  ManualPostBodySchema,
  Remittance835DetailSchema,
  Remittance835Schema,
  RemittanceListQuerySchema,
  RemittanceListResponseSchema,
  RemittancePostingSchema,
  UnmatchedRemittanceListResponseSchema,
  UnmatchedRemittanceSchema,
} from "@/contexts/billing/schemas/era835.schema.js";
import {
  BillHoldSchema,
  BulkSubmitBodySchema,
  BulkSubmitResponseSchema,
  ClaimDetailResponseSchema,
  ClaimListQuerySchema,
  ClaimListResponseSchema,
  ClaimReadinessResultSchema,
  ClaimRejectionSchema,
  ClaimRevisionSchema,
  ClaimSchema,
  ClaimSubmissionSchema,
  CreateClaimBodySchema,
  HoldBodySchema,
  ReplaceClaimBodySchema,
} from "@/contexts/billing/schemas/claim.schema.js";
import {
  CMSResponseBodySchema,
  CorrectNOEBodySchema,
  CreateNOEBodySchema,
  CreateNOTRBodySchema,
  FilingHistoryResponseSchema,
  FilingQueueQuerySchema,
  FilingQueueResponseSchema,
  LateOverrideBodySchema,
  NOEResponseSchema,
  NOEWithHistoryResponseSchema,
  NOTRResponseSchema,
  ReadinessResponseSchema,
} from "@/contexts/billing/schemas/noe.schema.js";
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
import {
  CreateEncounterBodySchema,
  EnhanceNarrativeBodySchema,
  GenerateNarrativeBodySchema,
  PatchEncounterBodySchema,
} from "@/contexts/clinical/schemas/encounter.schema";
import { EsasScaleSchema } from "@/contexts/clinical/schemas/esasScale.schema";
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
import {
  AssignReviewBodySchema,
  BulkAcknowledgeBodySchema,
  EscalateReviewBodySchema,
  ReviewHistoryResponseSchema,
  ReviewQueueItemSchema,
  ReviewQueueResponseSchema,
  SubmitReviewBodySchema,
} from "@/contexts/clinical/schemas/noteReview.schema.js";
import { NrsScaleSchema } from "@/contexts/clinical/schemas/nrsScale.schema";
import { PainadScaleSchema } from "@/contexts/clinical/schemas/painadScale.schema";
import { WongBakerScaleSchema } from "@/contexts/clinical/schemas/wongBakerScale.schema";
import {
  AlertListResponseSchema,
  AlertStatusPatchBodySchema,
} from "@/contexts/compliance/schemas/alert.schema.js";
import {
  CreateF2FBodySchema,
  F2FEncounterListResponseSchema,
  F2FEncounterResponseSchema,
  F2FQueueResponseSchema,
  F2FValidityResultSchema,
  PatchF2FBodySchema,
} from "@/contexts/f2f/schemas/f2f.schema.js";
import {
  FhirBundleSchema,
  FhirObservationSchema,
  FhirPatientSchema,
  ObservationSearchQuerySchema,
  OperationOutcomeSchema,
  PatientSearchQuerySchema,
} from "@/contexts/fhir/schemas/fhir.schema.js";
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
import {
  CreateScheduledVisitBodySchema,
  PatchScheduledVisitStatusBodySchema,
  ScheduledVisitListResponseSchema,
  ScheduledVisitResponseSchema,
} from "@/contexts/scheduling/schemas/visitSchedule.schema.js";

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

  // Billing — Cap
  CapCalculation: TypeCompiler.Compile(CapCalculationSchema),

  // Billing — Benefit Period Control System (T3-4)
  BenefitPeriodListQuery: TypeCompiler.Compile(BenefitPeriodListQuerySchema),
  BenefitPeriodResponse: TypeCompiler.Compile(BenefitPeriodResponseSchema),
  BenefitPeriodDetailResponse: TypeCompiler.Compile(BenefitPeriodDetailResponseSchema),
  BenefitPeriodTimelineResponse: TypeCompiler.Compile(BenefitPeriodTimelineResponseSchema),
  SetReportingPeriodBody: TypeCompiler.Compile(SetReportingPeriodBodySchema),
  RecalculationPreviewResponse: TypeCompiler.Compile(RecalculationPreviewResponseSchema),
  CommitRecalculationBody: TypeCompiler.Compile(CommitRecalculationBodySchema),
  RecertifyBody: TypeCompiler.Compile(RecertifyBodySchema),
  CorrectPeriodBody: TypeCompiler.Compile(CorrectPeriodBodySchema),
  BenefitPeriodListResponse: TypeCompiler.Compile(BenefitPeriodListResponseSchema),

  // Billing — NOE/NOTR Filing Workbench (T3-2a)
  CreateNOEBody: TypeCompiler.Compile(CreateNOEBodySchema),
  NOEResponse: TypeCompiler.Compile(NOEResponseSchema),
  NOEWithHistoryResponse: TypeCompiler.Compile(NOEWithHistoryResponseSchema),
  CMSResponseBody: TypeCompiler.Compile(CMSResponseBodySchema),
  CorrectNOEBody: TypeCompiler.Compile(CorrectNOEBodySchema),
  LateOverrideBody: TypeCompiler.Compile(LateOverrideBodySchema),
  ReadinessResponse: TypeCompiler.Compile(ReadinessResponseSchema),
  FilingHistoryResponse: TypeCompiler.Compile(FilingHistoryResponseSchema),
  CreateNOTRBody: TypeCompiler.Compile(CreateNOTRBodySchema),
  NOTRResponse: TypeCompiler.Compile(NOTRResponseSchema),
  FilingQueueQuery: TypeCompiler.Compile(FilingQueueQuerySchema),
  FilingQueueResponse: TypeCompiler.Compile(FilingQueueResponseSchema),

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

  // Scheduling — visit scheduling (T2-10)
  CreateScheduledVisitBody: TypeCompiler.Compile(CreateScheduledVisitBodySchema),
  PatchScheduledVisitStatusBody: TypeCompiler.Compile(PatchScheduledVisitStatusBodySchema),
  ScheduledVisitResponse: TypeCompiler.Compile(ScheduledVisitResponseSchema),
  ScheduledVisitListResponse: TypeCompiler.Compile(ScheduledVisitListResponseSchema),

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

  // Analytics — HOPE CRUD + Validation Engine (T3-1a)
  CreateHOPEAssessmentBody: TypeCompiler.Compile(CreateHOPEAssessmentBodySchema),
  PatchHOPEAssessmentBody: TypeCompiler.Compile(PatchHOPEAssessmentBodySchema),
  HOPEAssessmentListQuery: TypeCompiler.Compile(HOPEAssessmentListQuerySchema),
  HOPEAssessmentResponse: TypeCompiler.Compile(HOPEAssessmentResponseSchema),
  HOPEAssessmentListResponse: TypeCompiler.Compile(HOPEAssessmentListResponseSchema),
  HOPEValidationResult: TypeCompiler.Compile(HOPEValidationResultSchema),
  HOPESubmissionRow: TypeCompiler.Compile(HOPESubmissionRowSchema),
  HOPEQualityBenchmark: TypeCompiler.Compile(HOPEQualityBenchmarkSchema),

  // Analytics — HOPE Operations Hub (T3-1b)
  HOPEDashboardResponse: TypeCompiler.Compile(HOPEDashboardResponseSchema),
  HOPEPatientTimeline: TypeCompiler.Compile(HOPEPatientTimelineSchema),
  HOPESubmissionListResponse: TypeCompiler.Compile(HOPESubmissionListResponseSchema),

  // F2F Validity Engine (T3-2b)
  CreateF2FBody: TypeCompiler.Compile(CreateF2FBodySchema),
  PatchF2FBody: TypeCompiler.Compile(PatchF2FBodySchema),
  F2FValidityResult: TypeCompiler.Compile(F2FValidityResultSchema),
  F2FEncounterResponse: TypeCompiler.Compile(F2FEncounterResponseSchema),
  F2FEncounterListResponse: TypeCompiler.Compile(F2FEncounterListResponseSchema),
  F2FQueueResponse: TypeCompiler.Compile(F2FQueueResponseSchema),

  // Cap Intelligence (T3-3)
  CapSummaryResponse: TypeCompiler.Compile(CapSummaryResponseSchema),
  CapPatientListResponse: TypeCompiler.Compile(CapPatientListResponseSchema),
  CapTrendResponse: TypeCompiler.Compile(CapTrendResponseSchema),
  CapSnapshotResponse: TypeCompiler.Compile(CapSnapshotResponseSchema),
  RecalculateCapResponse: TypeCompiler.Compile(RecalculateCapResponseSchema),

  // Electronic Signatures (T3-5)
  CreateSignatureRequestBody: TypeCompiler.Compile(CreateSignatureRequestBodySchema),
  SignDocumentBody: TypeCompiler.Compile(SignDocumentBodySchema),
  CountersignBody: TypeCompiler.Compile(CountersignBodySchema),
  RejectSignatureBody: TypeCompiler.Compile(RejectSignatureBodySchema),
  VoidSignatureBody: TypeCompiler.Compile(VoidSignatureBodySchema),
  MarkExceptionBody: TypeCompiler.Compile(MarkExceptionBodySchema),
  SignatureListQuery: TypeCompiler.Compile(SignatureListQuerySchema),
  SignatureListResponse: TypeCompiler.Compile(SignatureListResponseSchema),

  // Claim Lifecycle (T3-7a)
  Claim: TypeCompiler.Compile(ClaimSchema),
  ClaimRevision: TypeCompiler.Compile(ClaimRevisionSchema),
  ClaimSubmission: TypeCompiler.Compile(ClaimSubmissionSchema),
  ClaimRejection: TypeCompiler.Compile(ClaimRejectionSchema),
  BillHold: TypeCompiler.Compile(BillHoldSchema),
  CreateClaimBody: TypeCompiler.Compile(CreateClaimBodySchema),
  HoldBody: TypeCompiler.Compile(HoldBodySchema),
  ReplaceClaimBody: TypeCompiler.Compile(ReplaceClaimBodySchema),
  BulkSubmitBody: TypeCompiler.Compile(BulkSubmitBodySchema),
  ClaimListQuery: TypeCompiler.Compile(ClaimListQuerySchema),
  ClaimDetailResponse: TypeCompiler.Compile(ClaimDetailResponseSchema),
  ClaimListResponse: TypeCompiler.Compile(ClaimListResponseSchema),
  BulkSubmitResponse: TypeCompiler.Compile(BulkSubmitResponseSchema),
  ClaimReadinessResult: TypeCompiler.Compile(ClaimReadinessResultSchema),

  // ERA 835 + Remittance Reconciliation (T3-7b)
  Remittance835: TypeCompiler.Compile(Remittance835Schema),
  RemittancePosting: TypeCompiler.Compile(RemittancePostingSchema),
  UnmatchedRemittance: TypeCompiler.Compile(UnmatchedRemittanceSchema),
  Remittance835Detail: TypeCompiler.Compile(Remittance835DetailSchema),
  IngestERABody: TypeCompiler.Compile(IngestERABodySchema),
  IngestERAResult: TypeCompiler.Compile(IngestERAResultSchema),
  ManualMatchBody: TypeCompiler.Compile(ManualMatchBodySchema),
  ManualPostBody: TypeCompiler.Compile(ManualPostBodySchema),
  RemittanceListQuery: TypeCompiler.Compile(RemittanceListQuerySchema),
  RemittanceListResponse: TypeCompiler.Compile(RemittanceListResponseSchema),
  UnmatchedRemittanceListResponse: TypeCompiler.Compile(UnmatchedRemittanceListResponseSchema),
  ClaimRemittanceResponse: TypeCompiler.Compile(ClaimRemittanceResponseSchema),

  // FHIR R4 (T3-6)
  FhirPatient: TypeCompiler.Compile(FhirPatientSchema),
  FhirObservation: TypeCompiler.Compile(FhirObservationSchema),
  FhirBundle: TypeCompiler.Compile(FhirBundleSchema),
  PatientSearchQuery: TypeCompiler.Compile(PatientSearchQuerySchema),
  ObservationSearchQuery: TypeCompiler.Compile(ObservationSearchQuerySchema),
  OperationOutcome: TypeCompiler.Compile(OperationOutcomeSchema),

  // Claim Audit Rules Engine (T3-12)
  AuditFailure: TypeCompiler.Compile(AuditFailureSchema),
  AuditResult: TypeCompiler.Compile(AuditResultSchema),
  AuditSnapshotResponse: TypeCompiler.Compile(AuditSnapshotResponseSchema),
  WarnOverrideBody: TypeCompiler.Compile(WarnOverrideBodySchema),
  BulkHoldBody: TypeCompiler.Compile(BulkHoldBodySchema),
  BulkReleaseBody: TypeCompiler.Compile(BulkReleaseBodySchema),
  AuditDashboardResponse: TypeCompiler.Compile(AuditDashboardResponseSchema),
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
