// Analytics context schema exports
// HOPE — Hospice Outcomes and Patient Evaluation (replaced HIS effective Oct 1, 2025)

export {
	// Section schemas
	HOPEAdministrativeSchema,
	HOPEBackgroundSchema,
	HOPECognitiveSchema,
	HOPEMoodSchema,
	HOPEFunctionalStatusSchema,
	HOPEPainSchema,
	HOPENutritionalSchema,
	HOPEMedicationsSchema,
	HOPEDiagnosisSchema,
	HOPESpecialTreatmentsSchema,
	HOPEDischargeSchema_SectionP,
	HOPEParticipationSchema,
	// Composite assessment schemas
	HOPEAdmissionSchema,
	HOPEUpdateVisitSchema,
	HOPEDischargeAssessmentSchema,
	HOPEiQIESSubmissionSchema,
	// Enum schemas
	HOPEAssessmentTypeSchema,
	HOPEGenderSchema,
	HOPEMaritalStatusSchema,
	HOPELivingArrangementSchema,
	HOPEADLSupportSchema,
	HOPEDischargeDestinationSchema,
	HOPEPlaceOfDeathSchema,
	// Helpers
	validateHOPEAdmissionWindow,
	validateHOPEDischargeWindow,
	interpretBIMSScore,
	interpretPHQ2Score,
} from "@/contexts/analytics/schemas/hope.schema";

export {
	// Quality measure schemas
	HOPEComprehensiveAssessmentMeasureSchema,
	HOPEHVLDLMeasureSchema,
	HOPETreatmentPreferencesMeasureSchema,
	HOPEHospiceCareIndexSchema,
	HOPEReportingPeriodSchema,
	// Helpers
	calculateComprehensiveAssessmentNumerator,
	calculateHVLDLPartA,
	calculateHVLDLPartB,
	daysUntilHQRPDeadline,
} from "@/contexts/analytics/schemas/hopeQualityMeasures.schema";
