/**
 * HOPE — Hospice Outcomes and Patient Evaluation
 *
 * CMS Quality Reporting tool effective October 1, 2025.
 * Replaces HIS (Hospice Item Set). Submitted via iQIES.
 *
 * Assessment types:
 *   HOPE-A  (01) — Admission, within 7 calendar days of hospice election
 *   HOPE-UV (02) — Update Visit, at each qualifying patient-family-centered visit
 *   HOPE-D  (03) — Discharge, within 7 calendar days of discharge or death
 *
 * Failure to submit: 2% Medicare payment reduction (HQRP penalty)
 *
 * References:
 *   - 42 CFR §418.312 — Hospice Quality Reporting Requirements
 *   - CMS HOPE Data Submission Specifications v1.00
 *   - iQIES Technical Specifications
 */

import { Type, type Static } from "@sinclair/typebox";

// ---------------------------------------------------------------------------
// Section A — Administrative Information
// ---------------------------------------------------------------------------

export const HOPEAssessmentTypeSchema = Type.Enum(
	{
		admission: "01",
		updateVisit: "02",
		discharge: "03",
	},
	{ description: "A0310A: Type of HOPE Assessment" },
);

export const HOPEGenderSchema = Type.Enum(
	{
		male: "1",
		female: "2",
		unknown: "9",
	},
	{ description: "A0800: Patient gender" },
);

export const HOPERaceEthnicitySchema = Type.Object(
	{
		americanIndianAlaskaNative: Type.Optional(Type.Boolean()),
		asian: Type.Optional(Type.Boolean()),
		blackAfricanAmerican: Type.Optional(Type.Boolean()),
		hispanicLatino: Type.Optional(Type.Boolean()),
		nativeHawaiianPacificIslander: Type.Optional(Type.Boolean()),
		white: Type.Optional(Type.Boolean()),
		other: Type.Optional(Type.Boolean()),
		unknown: Type.Optional(Type.Boolean()),
	},
	{ description: "A1000: Race and ethnicity (multi-select)" },
);

export const HOPEMaritalStatusSchema = Type.Enum(
	{
		neverMarried: "1",
		married: "2",
		widowed: "3",
		separated: "4",
		divorced: "5",
		unknown: "9",
	},
	{ description: "A1200: Marital status" },
);

export const HOPEAdministrativeSchema = Type.Object(
	{
		// A0100 — Facility CMS Certification Number (6-digit)
		cmsCertificationNumber: Type.String({
			pattern: "^\\d{6}$",
			description: "A0100: CMS Certification Number of hospice provider",
		}),
		// A0310A — Assessment type
		assessmentType: HOPEAssessmentTypeSchema,
		// A0500 — Patient legal name
		patientLastName: Type.String({ minLength: 1, maxLength: 40, description: "A0500A" }),
		patientFirstName: Type.String({ minLength: 1, maxLength: 20, description: "A0500B" }),
		patientMiddleInitial: Type.Optional(Type.String({ maxLength: 1, description: "A0500C" })),
		// A0600 — SSN and Medicare number (PHI — encrypted at rest)
		socialSecurityNumber: Type.Optional(
			Type.String({
				pattern: "^\\d{3}-\\d{2}-\\d{4}$",
				description: "A0600A: SSN — PHI, pgcrypto encrypted",
			}),
		),
		medicareNumber: Type.Optional(
			Type.String({
				maxLength: 12,
				description: "A0600B: Medicare Beneficiary Identifier — PHI, pgcrypto encrypted",
			}),
		),
		// A0700 — Medicaid number (PHI)
		medicaidNumber: Type.Optional(
			Type.String({ maxLength: 20, description: "A0700 — PHI, pgcrypto encrypted" }),
		),
		// A0800 — Gender
		gender: HOPEGenderSchema,
		// A0900 — Birth date (PHI)
		birthDate: Type.String({
			format: "date",
			description: "A0900 — PHI, pgcrypto encrypted",
		}),
		// A1000 — Race/ethnicity
		raceEthnicity: HOPERaceEthnicitySchema,
		// A1100 — Language
		prefersEnglish: Type.Boolean({ description: "A1100A: Patient/family prefers English" }),
		interpreterAvailable: Type.Optional(
			Type.Boolean({ description: "A1100B: Interpreter available when needed" }),
		),
		// A1200 — Marital status
		maritalStatus: HOPEMaritalStatusSchema,
	},
	{ description: "Section A — Administrative Information" },
);

// ---------------------------------------------------------------------------
// Section B — Background Information
// ---------------------------------------------------------------------------

export const HOPELivingArrangementSchema = Type.Enum(
	{
		privateHome: "01",
		boardCareAssistedLiving: "02",
		skilledNursingFacility: "03",
		nursingFacilityNonMedicare: "04",
		inpatientHospice: "05",
		hospital: "06",
		other: "07",
		unknown: "99",
	},
	{ description: "B1000: Living arrangement at time of assessment" },
);

export const HOPEBackgroundSchema = Type.Object(
	{
		// B0100 — Comatose
		comatose: Type.Boolean({ description: "B0100: Patient is comatose" }),
		// B0200 — Hearing
		hearing: Type.Enum(
			{
				adequate: "0",
				minimalDifficulty: "1",
				moderateDifficulty: "2",
				highlyImpaired: "3",
				notAssessable: "4",
			},
			{ description: "B0200: Hearing ability" },
		),
		// B0300 — Vision
		vision: Type.Enum(
			{
				adequate: "0",
				impaired: "1",
				moderatelyImpaired: "2",
				highlyImpaired: "3",
				severelyImpaired: "4",
			},
			{ description: "B0300: Vision ability" },
		),
		// B1000 — Living arrangement
		livingArrangement: HOPELivingArrangementSchema,
		// B1200 — Tobacco use
		tobaccoUse: Type.Boolean({ description: "B1200: Current tobacco use" }),
		// B1300 — Advance directives documented
		advanceDirectiveDocumented: Type.Boolean({
			description: "B1300: Advance directives or POLST on file",
		}),
	},
	{ description: "Section B — Patient and Caregiver Background" },
);

// ---------------------------------------------------------------------------
// Section C — Cognitive Patterns (BIMS)
// ---------------------------------------------------------------------------

// BIMS response scale: 0–3 per item, max 15 total
export const HOPEBIMSWordRecallSchema = Type.Enum(
	{
		noRecall: "0",
		afterCuedPrompt: "1",
		withoutCuedPrompt: "2",
	},
	{ description: "C0400: BIMS word recall scoring" },
);

export const HOPECognitiveSchema = Type.Object(
	{
		// C0100 — Can BIMS be conducted?
		bimsConduct: Type.Boolean({ description: "C0100: Patient able to complete BIMS" }),
		// C0200–C0500 — BIMS (when conducted)
		bims: Type.Optional(
			Type.Object({
				repetitionScore: Type.Integer({
					minimum: 0,
					maximum: 3,
					description: "C0200: Words repeated (0–3)",
				}),
				temporalOrientationYear: Type.Enum(
					{
						incorrect: "0",
						missedByMoreThanTwo: "1",
						missedByTwo: "2",
						correct: "3",
					},
					{ description: "C0300A: Year" },
				),
				temporalOrientationMonth: Type.Enum(
					{
						incorrect: "0",
						missedByMoreThanOne: "2",
						correct: "3",
					},
					{ description: "C0300B: Month" },
				),
				temporalOrientationDay: Type.Enum(
					{
						incorrect: "0",
						missedByOne: "1",
						correct: "2",
					},
					{ description: "C0300C: Day of week" },
				),
				wordRecallSock: HOPEBIMSWordRecallSchema,
				wordRecallBlue: HOPEBIMSWordRecallSchema,
				wordRecallBed: HOPEBIMSWordRecallSchema,
				// C0500 — BIMS summary score (0–15, auto-calculated)
				bimsSummaryScore: Type.Integer({
					minimum: 0,
					maximum: 15,
					description: "C0500: BIMS summary score (13–15=intact, 8–12=moderate impairment, 0–7=severe impairment)",
				}),
			}),
		),
		// C0700–C1310 — Staff assessment (when BIMS not conducted)
		staffAssessment: Type.Optional(
			Type.Object({
				shortTermMemoryOk: Type.Boolean({ description: "C0700: Short-term memory" }),
				longTermMemoryOk: Type.Boolean({ description: "C0800: Long-term memory" }),
				decisionMakingAbility: Type.Enum(
					{
						independent: "0",
						modifiedIndependence: "1",
						moderatelyImpaired: "2",
						severelyImpaired: "3",
					},
					{ description: "C0900: Cognitive skills for daily decision-making" },
				),
				// CAM — Confusion Assessment Method (delirium)
				deliriumInattention: Type.Boolean({ description: "C1310A: Inattention (CAM)" }),
				deliriumDisorganizedThinking: Type.Boolean({
					description: "C1310B: Disorganized thinking (CAM)",
				}),
				deliriumAlteredConsciousness: Type.Boolean({
					description: "C1310C: Altered level of consciousness (CAM)",
				}),
				deliriumPsychomotorChanges: Type.Boolean({
					description: "C1310D: Psychomotor changes (CAM)",
				}),
			}),
		),
	},
	{ description: "Section C — Cognitive Patterns" },
);

// ---------------------------------------------------------------------------
// Section D — Mood (PHQ-2 Depression Screening)
// ---------------------------------------------------------------------------

export const HOPEPHQFrequencySchema = Type.Enum(
	{
		never: "0",
		oneToSixDays: "1",
		sevenToElevenDays: "2",
		twelveTo14Days: "3",
		unableToAnswer: "9",
	},
	{ description: "D0200: PHQ-2 frequency scale" },
);

export const HOPEMoodSchema = Type.Object(
	{
		// D0100 — Should patient mood interview be conducted?
		moodInterviewConducted: Type.Enum(
			{
				no_nonResponsive: "0",
				no_declined: "1",
				yes: "2",
			},
			{ description: "D0100: Patient mood interview status" },
		),
		// D0200 — PHQ-2 Patient interview
		phqLittleInterest: Type.Optional(
			HOPEPHQFrequencySchema,
		), // D0200A
		phqFeelingDown: Type.Optional(
			HOPEPHQFrequencySchema,
		), // D0200B
		// D0300 — PHQ-2 summary score (0–6, 3+ = positive screen)
		phqSummaryScore: Type.Optional(
			Type.Integer({
				minimum: 0,
				maximum: 6,
				description: "D0300: PHQ-2 score (≥3 = positive screen for depression)",
			}),
		),
		// D0500 — Staff assessment of mood (when patient interview not conducted)
		staffMoodAssessment: Type.Optional(
			Type.Object({
				expressedSadness: Type.Boolean({ description: "D0500A" }),
				cryingTearfulness: Type.Boolean({ description: "D0500B" }),
				expressedAnxiety: Type.Boolean({ description: "D0500C" }),
				withdrawnDecreasedSocialInteraction: Type.Boolean({ description: "D0500D" }),
				expressedAngerIrritability: Type.Boolean({ description: "D0500E" }),
			}),
		),
	},
	{ description: "Section D — Mood Assessment (PHQ-2)" },
);

// ---------------------------------------------------------------------------
// Section F — Functional Status (ADLs)
// ---------------------------------------------------------------------------

// ADL support scale per CMS HOPE specifications
export const HOPEADLSupportSchema = Type.Enum(
	{
		independent: "0",
		setupOnly: "1",
		limitedAssistance: "2",
		extensiveAssistance: "3",
		totalDependence: "4",
		activityDidNotOccur: "7",
		notAssessable: "8",
	},
	{ description: "F0400: ADL self-performance support scale" },
);

export const HOPEFunctionalStatusSchema = Type.Object(
	{
		// F0400 — ADL assistance needed
		bedMobility: HOPEADLSupportSchema, // F0400A
		transfer: HOPEADLSupportSchema, // F0400B
		walkInRoom: HOPEADLSupportSchema, // F0400C
		walkInCorridor: HOPEADLSupportSchema, // F0400D
		dressing: HOPEADLSupportSchema, // F0400E
		eating: HOPEADLSupportSchema, // F0400F
		toiletUse: HOPEADLSupportSchema, // F0400G
		personalHygiene: HOPEADLSupportSchema, // F0400H
		bathing: HOPEADLSupportSchema, // F0400I
	},
	{ description: "Section F — Functional Status (ADL Self-Performance)" },
);

// ---------------------------------------------------------------------------
// Section J — Pain Assessment
// ---------------------------------------------------------------------------

export const HOPEPainSchema = Type.Object(
	{
		// J0100 — Pain assessment interview conducted
		interviewConducted: Type.Enum(
			{
				no_nonResponsive: "0",
				no_declined: "1",
				yes: "2",
			},
			{ description: "J0100: Pain assessment interview status" },
		),
		// J0300 — Pain presence (patient or staff report)
		painPresent: Type.Optional(
			Type.Boolean({ description: "J0300: Pain present in last 7 days" }),
		),
		// J0400 — Pain frequency
		painFrequency: Type.Optional(
			Type.Enum(
				{
					almostConstantly: "1",
					frequently: "2",
					occasionally: "3",
					rarely: "4",
				},
				{ description: "J0400: How often patient experienced pain" },
			),
		),
		// J0500 — Pain effect on function
		painAffectsDailyActivities: Type.Optional(
			Type.Boolean({ description: "J0500A: Pain interferes with daily activities" }),
		),
		painAffectsSleep: Type.Optional(
			Type.Boolean({ description: "J0500B: Pain interferes with sleep" }),
		),
		// J0600 — Pain intensity
		painIntensityNumeric: Type.Optional(
			Type.Integer({
				minimum: 0,
				maximum: 10,
				description: "J0600A: Pain intensity (0–10 NRS; use 99 if unable)",
			}),
		),
		painIntensityVerbal: Type.Optional(
			Type.Enum(
				{
					none: "0",
					mild: "1",
					moderate: "2",
					severe: "3",
					unableToAnswer: "9",
				},
				{ description: "J0600B: Verbal descriptor scale" },
			),
		),
		// J0700 — Respondent
		respondent: Type.Optional(
			Type.Enum(
				{
					patient: "1",
					familyOrSignificantOther: "2",
					staff: "3",
				},
				{ description: "J0700: Who provided pain information" },
			),
		),
		// J0800 — Staff behavioral indicators (when verbal interview not possible)
		staffPainIndicators: Type.Optional(
			Type.Object({
				nonVerbalVocalizations: Type.Boolean({ description: "J0800A: Moaning, groaning" }),
				facialExpressions: Type.Boolean({
					description: "J0800B: Grimacing, frowning",
				}),
				protectiveBehaviors: Type.Boolean({
					description: "J0800C: Guarding, resisting care",
				}),
				restlessness: Type.Boolean({ description: "J0800D: Restlessness, agitation" }),
			}),
		),
	},
	{ description: "Section J — Pain Assessment" },
);

// ---------------------------------------------------------------------------
// Section K — Swallowing and Nutritional Status
// ---------------------------------------------------------------------------

export const HOPENutritionalSchema = Type.Object(
	{
		// K0100 — Swallowing disorder indicators
		swallowingDisorderLoss: Type.Boolean({
			description: "K0100A: Loss of liquids or solids from mouth",
		}),
		swallowingDisorderCoughing: Type.Boolean({
			description: "K0100B: Coughing or choking during meals",
		}),
		swallowingDisorderNone: Type.Boolean({
			description: "K0100Z: None of the above",
		}),
		// K0200 — Weight and height
		heightInInches: Type.Optional(
			Type.Number({ minimum: 20, maximum: 120, description: "K0200A: Height in inches" }),
		),
		weightInLbs: Type.Optional(
			Type.Number({ minimum: 10, maximum: 800, description: "K0200B: Weight in pounds" }),
		),
	},
	{ description: "Section K — Swallowing and Nutritional Status" },
);

// ---------------------------------------------------------------------------
// Section M — Medications
// ---------------------------------------------------------------------------

export const HOPEMedicationsSchema = Type.Object(
	{
		// M0300 — High-risk medications received in last 14 days
		antipsychotics: Type.Boolean({ description: "M0300A: Antipsychotics" }),
		anticoagulants: Type.Boolean({ description: "M0300B: Anticoagulants" }),
		opioids: Type.Boolean({ description: "M0300C: Opioids" }),
		hypnotics: Type.Boolean({ description: "M0300D: Hypnotics/sedatives" }),
		antibiotics: Type.Boolean({ description: "M0300E: Antibiotics" }),
		diuretics: Type.Boolean({ description: "M0300F: Diuretics" }),
	},
	{ description: "Section M — Medications (high-risk, last 14 days)" },
);

// ---------------------------------------------------------------------------
// Section N — Active Diagnoses
// ---------------------------------------------------------------------------

export const HOPEDiagnosisSchema = Type.Object(
	{
		// N0300 — Active diagnoses at time of assessment
		terminalDiagnosis: Type.String({
			minLength: 1,
			maxLength: 500,
			description: "N0300A: Terminal (primary hospice) diagnosis — ICD-10",
		}),
		terminalDiagnosisIcd10: Type.String({
			pattern: "^[A-Z][0-9A-Z]{1,6}$",
			description: "N0300A: ICD-10-CM code for terminal diagnosis",
		}),
		otherDiagnoses: Type.Optional(
			Type.Array(
				Type.Object({
					description: Type.String({ maxLength: 500 }),
					icd10Code: Type.Optional(
						Type.String({ pattern: "^[A-Z][0-9A-Z]{1,6}$" }),
					),
				}),
				{ description: "N0300B: Other active diagnoses" },
			),
		),
	},
	{ description: "Section N — Active Diagnoses" },
);

// ---------------------------------------------------------------------------
// Section O — Special Treatments
// ---------------------------------------------------------------------------

export const HOPESpecialTreatmentsSchema = Type.Object(
	{
		// O0100 — Treatments while on hospice
		chemotherapy: Type.Boolean({ description: "O0100A: Chemotherapy" }),
		radiation: Type.Boolean({ description: "O0100B: Radiation" }),
		respiratoryTherapy: Type.Boolean({ description: "O0100C: Respiratory therapy" }),
		dialysis: Type.Boolean({ description: "O0100D: Dialysis — note: typically revocation trigger" }),
		totalParenteralNutrition: Type.Boolean({ description: "O0100E: Total parenteral nutrition" }),
		ivMedications: Type.Boolean({ description: "O0100F: IV medications" }),
	},
	{ description: "Section O — Special Treatments and Programs" },
);

// ---------------------------------------------------------------------------
// Section P — Discharge Information (HOPE-D only)
// ---------------------------------------------------------------------------

export const HOPEDischargeDestinationSchema = Type.Enum(
	{
		community: "01",
		assistedLivingGroupHome: "02",
		skilledNursingFacility: "03",
		inpatientHospice: "04",
		hospital: "05",
		died: "06",
		unknown: "99",
	},
	{ description: "P0200: Discharge destination" },
);

export const HOPEPlaceOfDeathSchema = Type.Enum(
	{
		home: "01",
		assistedLiving: "02",
		skilledNursingFacility: "03",
		inpatientHospice: "04",
		hospital: "05",
		unknown: "99",
	},
	{ description: "P0300A: Place of death (when P0200 = 06)" },
);

export const HOPEDischargeSchema_SectionP = Type.Object(
	{
		// P0100 — Discharge/death date
		dischargeDate: Type.String({
			format: "date",
			description: "P0100: Date of discharge or death",
		}),
		// P0200 — Discharge destination
		dischargeDestination: HOPEDischargeDestinationSchema,
		// P0300 — Death information (when destination = died)
		placeOfDeath: Type.Optional(HOPEPlaceOfDeathSchema),
		// P0400 — Reason for discharge
		dischargeReason: Type.Optional(
			Type.Enum(
				{
					death: "01",
					revocation: "02",
					nonCoveredServices: "03",
					moveOutOfArea: "04",
					transferred: "05",
					noLongerTerminallyIll: "06",
					other: "07",
				},
				{ description: "P0400: Reason for discharge" },
			),
		),
	},
	{ description: "Section P — Discharge Information (HOPE-D only)" },
);

// ---------------------------------------------------------------------------
// Section Q — Participation in Assessment
// ---------------------------------------------------------------------------

export const HOPEParticipationSchema = Type.Object(
	{
		patientParticipated: Type.Boolean({ description: "Q0100A: Patient participated in assessment" }),
		familyParticipated: Type.Optional(
			Type.Boolean({ description: "Q0100B: Family/significant other participated" }),
		),
		legalRepresentativeParticipated: Type.Optional(
			Type.Boolean({ description: "Q0100C: Guardian/legally authorized representative participated" }),
		),
	},
	{ description: "Section Q — Participation in Assessment" },
);

// ---------------------------------------------------------------------------
// Composite HOPE Assessment Schemas
// ---------------------------------------------------------------------------

/**
 * HOPE-A — Admission Assessment
 * Must be completed within 7 calendar days of hospice election.
 * Includes all sections A–Q.
 */
export const HOPEAdmissionSchema = Type.Object(
	{
		id: Type.String({ format: "uuid" }),
		patientId: Type.String({ format: "uuid" }),
		locationId: Type.String({ format: "uuid", description: "RLS — hospice location" }),
		assessmentType: Type.Literal("01"),
		assessmentDate: Type.String({
			format: "date",
			description: "Date assessment was completed (must be ≤7 days post-election)",
		}),
		electionDate: Type.String({
			format: "date",
			description: "Hospice election date (used to validate 7-day window)",
		}),
		status: Type.Enum(
			{
				draft: "draft",
				inProgress: "in_progress",
				completed: "completed",
				submitted: "submitted",
				accepted: "accepted",
				rejected: "rejected",
				corrected: "corrected",
			},
			{ description: "iQIES submission status" },
		),
		// iQIES tracking
		iqiesSubmissionId: Type.Optional(
			Type.String({ description: "iQIES-assigned submission tracking ID" }),
		),
		submittedAt: Type.Optional(Type.String({ format: "date-time" })),
		acceptedAt: Type.Optional(Type.String({ format: "date-time" })),
		rejectionReasons: Type.Optional(
			Type.Array(
				Type.Object({
					code: Type.String(),
					description: Type.String(),
				}),
			),
		),
		// Sections
		sectionA: HOPEAdministrativeSchema,
		sectionB: HOPEBackgroundSchema,
		sectionC: HOPECognitiveSchema,
		sectionD: HOPEMoodSchema,
		sectionF: HOPEFunctionalStatusSchema,
		sectionJ: HOPEPainSchema,
		sectionK: HOPENutritionalSchema,
		sectionM: HOPEMedicationsSchema,
		sectionN: HOPEDiagnosisSchema,
		sectionO: HOPESpecialTreatmentsSchema,
		sectionQ: HOPEParticipationSchema,
		// Metadata
		completedBy: Type.String({ format: "uuid", description: "Clinician who completed assessment" }),
		createdAt: Type.String({ format: "date-time" }),
		updatedAt: Type.String({ format: "date-time" }),
	},
	{
		additionalProperties: false,
		description: "HOPE-A: Hospice Outcomes and Patient Evaluation — Admission Assessment",
	},
);

/**
 * HOPE-UV — Update Visit Assessment
 * Collected at each qualifying patient-family-centered visit.
 * Abbreviated set: symptoms, pain, functional status.
 */
export const HOPEUpdateVisitSchema = Type.Object(
	{
		id: Type.String({ format: "uuid" }),
		patientId: Type.String({ format: "uuid" }),
		locationId: Type.String({ format: "uuid" }),
		assessmentType: Type.Literal("02"),
		assessmentDate: Type.String({ format: "date" }),
		visitId: Type.Optional(
			Type.String({ format: "uuid", description: "Linked visit/encounter ID" }),
		),
		status: Type.Enum({
			draft: "draft",
			inProgress: "in_progress",
			completed: "completed",
			submitted: "submitted",
			accepted: "accepted",
			rejected: "rejected",
		}),
		iqiesSubmissionId: Type.Optional(Type.String()),
		submittedAt: Type.Optional(Type.String({ format: "date-time" })),
		// Update visit sections (subset of full assessment)
		sectionC: HOPECognitiveSchema,
		sectionD: HOPEMoodSchema,
		sectionF: HOPEFunctionalStatusSchema,
		sectionJ: HOPEPainSchema,
		sectionO: HOPESpecialTreatmentsSchema,
		sectionQ: HOPEParticipationSchema,
		completedBy: Type.String({ format: "uuid" }),
		createdAt: Type.String({ format: "date-time" }),
		updatedAt: Type.String({ format: "date-time" }),
	},
	{
		additionalProperties: false,
		description: "HOPE-UV: Hospice Outcomes and Patient Evaluation — Update Visit Assessment",
	},
);

/**
 * HOPE-D — Discharge Assessment
 * Must be completed within 7 calendar days of discharge or death.
 * Includes Section P (Discharge Information).
 */
export const HOPEDischargeAssessmentSchema = Type.Object(
	{
		id: Type.String({ format: "uuid" }),
		patientId: Type.String({ format: "uuid" }),
		locationId: Type.String({ format: "uuid" }),
		assessmentType: Type.Literal("03"),
		assessmentDate: Type.String({ format: "date" }),
		dischargeDate: Type.String({
			format: "date",
			description: "Must be within 7 days of this assessment date",
		}),
		status: Type.Enum({
			draft: "draft",
			inProgress: "in_progress",
			completed: "completed",
			submitted: "submitted",
			accepted: "accepted",
			rejected: "rejected",
		}),
		iqiesSubmissionId: Type.Optional(Type.String()),
		submittedAt: Type.Optional(Type.String({ format: "date-time" })),
		// Discharge sections
		sectionF: HOPEFunctionalStatusSchema,
		sectionJ: HOPEPainSchema,
		sectionP: HOPEDischargeSchema_SectionP,
		sectionQ: HOPEParticipationSchema,
		completedBy: Type.String({ format: "uuid" }),
		createdAt: Type.String({ format: "date-time" }),
		updatedAt: Type.String({ format: "date-time" }),
	},
	{
		additionalProperties: false,
		description: "HOPE-D: Hospice Outcomes and Patient Evaluation — Discharge Assessment",
	},
);

// ---------------------------------------------------------------------------
// iQIES Submission Schema
// ---------------------------------------------------------------------------

export const HOPEiQIESSubmissionSchema = Type.Object(
	{
		id: Type.String({ format: "uuid" }),
		locationId: Type.String({ format: "uuid" }),
		assessmentId: Type.String({ format: "uuid" }),
		assessmentType: HOPEAssessmentTypeSchema,
		submissionAttempt: Type.Integer({ minimum: 1, maximum: 3 }),
		submittedAt: Type.String({ format: "date-time" }),
		responseReceivedAt: Type.Optional(Type.String({ format: "date-time" })),
		iqiesTrackingId: Type.Optional(Type.String()),
		responseStatus: Type.Enum(
			{
				pending: "pending",
				accepted: "accepted",
				rejected: "rejected",
				warning: "warning",
			},
			{ description: "iQIES response status" },
		),
		responseErrors: Type.Optional(
			Type.Array(
				Type.Object({
					errorCode: Type.String(),
					errorMessage: Type.String(),
					fieldPath: Type.Optional(Type.String()),
				}),
			),
		),
	},
	{
		additionalProperties: false,
		description: "iQIES Submission tracking record",
	},
);

// ---------------------------------------------------------------------------
// TypeScript types (derived from TypeBox schemas)
// ---------------------------------------------------------------------------

export type HOPEAdministrative = Static<typeof HOPEAdministrativeSchema>;
export type HOPEBackground = Static<typeof HOPEBackgroundSchema>;
export type HOPECognitive = Static<typeof HOPECognitiveSchema>;
export type HOPEMood = Static<typeof HOPEMoodSchema>;
export type HOPEFunctionalStatus = Static<typeof HOPEFunctionalStatusSchema>;
export type HOPEPain = Static<typeof HOPEPainSchema>;
export type HOPENutritional = Static<typeof HOPENutritionalSchema>;
export type HOPEMedications = Static<typeof HOPEMedicationsSchema>;
export type HOPEDiagnosis = Static<typeof HOPEDiagnosisSchema>;
export type HOPESpecialTreatments = Static<typeof HOPESpecialTreatmentsSchema>;
export type HOPEDischargeInfo = Static<typeof HOPEDischargeSchema_SectionP>;
export type HOPEParticipation = Static<typeof HOPEParticipationSchema>;

export type HOPEAdmission = Static<typeof HOPEAdmissionSchema>;
export type HOPEUpdateVisit = Static<typeof HOPEUpdateVisitSchema>;
export type HOPEDischargeAssessment = Static<typeof HOPEDischargeAssessmentSchema>;
export type HOPEiQIESSubmission = Static<typeof HOPEiQIESSubmissionSchema>;

// ---------------------------------------------------------------------------
// HOPE Reporting Period — HQRP submission windows
// ---------------------------------------------------------------------------

export const HOPEReportingPeriodSchema = Type.Object(
	{
		id: Type.String({ format: "uuid" }),
		locationId: Type.String({ format: "uuid" }),
		calendarYear: Type.Integer({ minimum: 2025, description: "Calendar year (HQRP uses Q4 deadlines)" }),
		quarter: Type.Integer({ minimum: 1, maximum: 4 }),
		startDate: Type.String({ format: "date" }),
		endDate: Type.String({ format: "date" }),
		submissionDeadline: Type.String({ format: "date", description: "iQIES submission deadline" }),
		status: Type.Enum(
			{ open: "open", submitted: "submitted", closed: "closed" },
			{ description: "Reporting period status" },
		),
		penaltyApplied: Type.Boolean({ description: "2% Medicare reduction applied for missed deadline" }),
		createdAt: Type.String({ format: "date-time" }),
	},
	{
		additionalProperties: false,
		description: "HQRP reporting period with iQIES submission tracking",
	},
);

export type HOPEReportingPeriod = Static<typeof HOPEReportingPeriodSchema>;

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate HOPE-A 7-day window.
 * Assessment must be completed within 7 calendar days of election date.
 */
export function validateHOPEAdmissionWindow(
	electionDate: string,
	assessmentDate: string,
): { valid: boolean; daysFromElection: number; deadline: string } {
	const election = new Date(electionDate);
	const assessment = new Date(assessmentDate);
	const deadline = new Date(election);
	deadline.setDate(deadline.getDate() + 7);

	const daysFromElection = Math.floor(
		(assessment.getTime() - election.getTime()) / (1000 * 60 * 60 * 24),
	);

	return {
		valid: assessment <= deadline,
		daysFromElection,
		deadline: deadline.toISOString().split("T")[0] ?? "",
	};
}

/**
 * Validate HOPE-D 7-day window.
 * Discharge assessment must be completed within 7 calendar days of discharge/death.
 */
export function validateHOPEDischargeWindow(
	dischargeDate: string,
	assessmentDate: string,
): { valid: boolean; daysFromDischarge: number; deadline: string } {
	const discharge = new Date(dischargeDate);
	const assessment = new Date(assessmentDate);
	const deadline = new Date(discharge);
	deadline.setDate(deadline.getDate() + 7);

	const daysFromDischarge = Math.floor(
		(assessment.getTime() - discharge.getTime()) / (1000 * 60 * 60 * 24),
	);

	return {
		valid: assessment <= deadline,
		daysFromDischarge,
		deadline: deadline.toISOString().split("T")[0] ?? "",
	};
}

/**
 * Check whether a BIMS score indicates cognitive impairment level.
 * Used for quality measure computation.
 */
export function interpretBIMSScore(
	score: number,
): "intact" | "moderate_impairment" | "severe_impairment" {
	if (score >= 13) return "intact";
	if (score >= 8) return "moderate_impairment";
	return "severe_impairment";
}

/**
 * Check PHQ-2 screen result.
 * Score ≥3 = positive screen; triggers full PHQ-9 or clinical follow-up.
 */
export function interpretPHQ2Score(score: number): {
	positiveScreen: boolean;
	recommendation: string;
} {
	return {
		positiveScreen: score >= 3,
		recommendation:
			score >= 3
				? "Positive screen — conduct full PHQ-9 or refer for clinical evaluation"
				: "Negative screen — document and monitor",
	};
}
