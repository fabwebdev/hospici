// config/typebox-compiler.ts
// Central registry for ALL AOT-compiled TypeBox validators
// ⚠️  CRITICAL: All TypeCompiler.Compile() calls must be in this file only
// Never call TypeCompiler.Compile() inside functions or request handlers

import { TypeCompiler } from "@sinclair/typebox/compiler";

// Import all schemas
import { UserSchema, SessionSchema, BreakGlassSchema } from "@/contexts/identity/schemas";
import { PatientSchema, FlaccScaleSchema } from "@/contexts/clinical/schemas";
import { NOESchema, BenefitPeriodSchema, CapCalculationSchema } from "@/contexts/billing/schemas";
import { IDGMeetingSchema, AideSupervisionSchema } from "@/contexts/scheduling/schemas";
import { AuditLogSchema } from "@/contexts/identity/schemas/audit.schema";
import {
	HOPEAdmissionSchema,
	HOPEUpdateVisitSchema,
	HOPEDischargeAssessmentSchema,
	HOPEiQIESSubmissionSchema,
	HOPEReportingPeriodSchema,
} from "@/contexts/analytics/schemas/hope.schema";
import {
	HOPEComprehensiveAssessmentMeasureSchema,
	HOPEHVLDLMeasureSchema,
	HOPETreatmentPreferencesMeasureSchema,
	HOPEHospiceCareIndexSchema,
} from "@/contexts/analytics/schemas/hopeQualityMeasures.schema";

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

	// Clinical
	Patient: TypeCompiler.Compile(PatientSchema),
	FlaccScale: TypeCompiler.Compile(FlaccScaleSchema),

	// Billing
	NOE: TypeCompiler.Compile(NOESchema),
	BenefitPeriod: TypeCompiler.Compile(BenefitPeriodSchema),
	CapCalculation: TypeCompiler.Compile(CapCalculationSchema),

	// Scheduling
	IDGMeeting: TypeCompiler.Compile(IDGMeetingSchema),
	AideSupervision: TypeCompiler.Compile(AideSupervisionSchema),

	// Analytics — HOPE Quality Reporting (replaces HIS, effective 2025-10-01)
	HOPEAdmission: TypeCompiler.Compile(HOPEAdmissionSchema),
	HOPEUpdateVisit: TypeCompiler.Compile(HOPEUpdateVisitSchema),
	HOPEDischarge: TypeCompiler.Compile(HOPEDischargeAssessmentSchema),
	HOPEiQIESSubmission: TypeCompiler.Compile(HOPEiQIESSubmissionSchema),
	HOPEReportingPeriod: TypeCompiler.Compile(HOPEReportingPeriodSchema),
	HOPEComprehensiveAssessmentMeasure: TypeCompiler.Compile(HOPEComprehensiveAssessmentMeasureSchema),
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
export function getValidator<T extends ValidatorName>(
	name: T,
): (typeof Validators)[T] {
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
