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
  AssessmentListResponseSchema,
  AssessmentResponseSchema,
  CreateAssessmentBodySchema,
  TrajectoryResponseSchema,
} from "@/contexts/clinical/schemas/assessment.schema";
import { EsasScaleSchema } from "@/contexts/clinical/schemas/esasScale.schema";
import { NrsScaleSchema } from "@/contexts/clinical/schemas/nrsScale.schema";
import { PainadScaleSchema } from "@/contexts/clinical/schemas/painadScale.schema";
import { WongBakerScaleSchema } from "@/contexts/clinical/schemas/wongBakerScale.schema";
import {
  CreatePatientBodySchema,
  FlaccScaleSchema,
  PatchPatientBodySchema,
  PatientListQuerySchema,
  PatientSchema,
} from "@/contexts/clinical/schemas";
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
