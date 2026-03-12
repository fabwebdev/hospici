/**
 * HOPE Quality Measures — HQRP (Hospice Quality Reporting Program)
 *
 * These measures are calculated from HOPE assessment data and submitted to
 * CMS as part of the mandatory Hospice Quality Reporting Program (HQRP).
 *
 * Non-submission penalty: 2% reduction in Medicare payment rates.
 *
 * Current HOPE-derived measures:
 *   NQF #3235 — Hospice and Palliative Care Composite Process Measure
 *               (Comprehensive Assessment at Admission)
 *   NQF #3633 — Treatment Preferences
 *   NQF #3634 — Hospice Visits When Death is Imminent (HVLDL)
 *   HCI       — Hospice Care Index (composite of 10 indicators)
 *
 * References:
 *   - CMS HQRP Measures Technical Specifications
 *   - NQF Measure Descriptions for Hospice
 *   - 42 CFR §418.312
 */

import { type Static, Type } from "@sinclair/typebox";

// ---------------------------------------------------------------------------
// NQF #3235 — Comprehensive Assessment at Admission
// ---------------------------------------------------------------------------

/**
 * Composite process measure: did the hospice conduct a comprehensive
 * assessment at admission covering all required domains?
 *
 * Denominator: All hospice patients with a HOPE-A completed
 * Numerator: HOPE-A with all 7 required domains addressed:
 *   1. Pain screening (Section J)
 *   2. Dyspnea screening
 *   3. Mood screening (Section D — PHQ-2)
 *   4. Cognitive status (Section C — BIMS or staff assessment)
 *   5. Nutritional status (Section K)
 *   6. Functional status (Section F — ADLs)
 *   7. Advance directives (Section B)
 */
export const HOPEComprehensiveAssessmentMeasureSchema = Type.Object(
  {
    patientId: Type.String({ format: "uuid" }),
    locationId: Type.String({ format: "uuid" }),
    hopeAdmissionId: Type.String({ format: "uuid" }),
    measurementPeriodStart: Type.String({ format: "date" }),
    measurementPeriodEnd: Type.String({ format: "date" }),
    // Domain completion flags
    painScreeningCompleted: Type.Boolean(),
    dyspneaScreeningCompleted: Type.Boolean(),
    moodScreeningCompleted: Type.Boolean(),
    cognitiveAssessmentCompleted: Type.Boolean(),
    nutritionalAssessmentCompleted: Type.Boolean(),
    functionalAssessmentCompleted: Type.Boolean(),
    advanceDirectivesDocumented: Type.Boolean(),
    // Calculated measure result
    allDomainsCompleted: Type.Boolean({
      description: "Numerator: true when all 7 domains are addressed",
    }),
    // Reporting
    inDenominator: Type.Boolean(),
    inNumerator: Type.Boolean(),
    exclusionReason: Type.Optional(
      Type.String({ description: "Reason for exclusion from denominator" }),
    ),
    calculatedAt: Type.String({ format: "date-time" }),
  },
  {
    additionalProperties: false,
    description: "NQF #3235: Comprehensive Assessment at Admission",
  },
);

// ---------------------------------------------------------------------------
// NQF #3634 — Hospice Visits When Death is Imminent (HVLDL)
// ---------------------------------------------------------------------------

/**
 * Two-part measure:
 *   Part A — Visits by RN or MD in last 3 days of life
 *   Part B — Visits by SWW or Chaplain in last 7 days of life
 *
 * Denominator: Patients who died while enrolled in hospice
 * Numerator A: ≥2 RN or MD visits in last 3 days
 * Numerator B: ≥1 SWW or chaplain visit in last 7 days
 */
export const HOPEHVLDLMeasureSchema = Type.Object(
  {
    patientId: Type.String({ format: "uuid" }),
    locationId: Type.String({ format: "uuid" }),
    hopeDischargeId: Type.String({ format: "uuid", description: "Linked HOPE-D assessment" }),
    dateOfDeath: Type.String({ format: "date" }),
    measurementPeriodStart: Type.String({ format: "date" }),
    measurementPeriodEnd: Type.String({ format: "date" }),
    // Part A: RN/MD visits in last 3 days
    rnOrMdVisitsLast3Days: Type.Integer({
      minimum: 0,
      description: "Count of RN or MD visits in last 3 days of life",
    }),
    partANumerator: Type.Boolean({
      description: "True if ≥2 RN or MD visits in last 3 days",
    }),
    // Part B: SWW/chaplain visits in last 7 days
    swwOrChaplainVisitsLast7Days: Type.Integer({
      minimum: 0,
      description: "Count of social worker or chaplain visits in last 7 days of life",
    }),
    partBNumerator: Type.Boolean({
      description: "True if ≥1 SWW or chaplain visit in last 7 days",
    }),
    // Reporting
    inDenominator: Type.Boolean(),
    exclusionReason: Type.Optional(Type.String()),
    calculatedAt: Type.String({ format: "date-time" }),
  },
  {
    additionalProperties: false,
    description: "NQF #3634: Hospice Visits When Death is Imminent (HVLDL)",
  },
);

// ---------------------------------------------------------------------------
// NQF #3633 — Treatment Preferences
// ---------------------------------------------------------------------------

/**
 * Was the patient asked about and offered the opportunity to express
 * treatment preferences?
 *
 * Denominator: All patients with a HOPE-A
 * Numerator: HOPE-A documents that preferences were elicited
 */
export const HOPETreatmentPreferencesMeasureSchema = Type.Object(
  {
    patientId: Type.String({ format: "uuid" }),
    locationId: Type.String({ format: "uuid" }),
    hopeAdmissionId: Type.String({ format: "uuid" }),
    measurementPeriodStart: Type.String({ format: "date" }),
    measurementPeriodEnd: Type.String({ format: "date" }),
    preferencesElicited: Type.Boolean({
      description: "Patient/family given opportunity to express treatment preferences",
    }),
    advanceDirectiveOnFile: Type.Boolean(),
    polstOrDNROnFile: Type.Boolean(),
    inDenominator: Type.Boolean(),
    inNumerator: Type.Boolean(),
    exclusionReason: Type.Optional(Type.String()),
    calculatedAt: Type.String({ format: "date-time" }),
  },
  {
    additionalProperties: false,
    description: "NQF #3633: Treatment Preferences",
  },
);

// ---------------------------------------------------------------------------
// Hospice Care Index (HCI) — Composite of 10 Indicators
// ---------------------------------------------------------------------------

/**
 * HCI is a composite score (0–10) based on 10 claims-derived quality indicators.
 * Submitted alongside HOPE data to CMS for public reporting.
 *
 * The 10 HCI indicators:
 *   1. Visits near death (hospice visits in last 3 days)
 *   2. Avoided burdensome transitions (no hospitalization in last 3 days)
 *   3. Continuous home care (crisis care when needed)
 *   4. Early hospice enrollment (elected >7 days before death)
 *   5. Short stay (enrolled ≤7 days) — inverse indicator
 *   6. Nursing home residents — visits near death
 *   7. Chemotherapy near death — inverse indicator
 *   8. Multiple hospitalizations in last 90 days — inverse indicator
 *   9. Feeding tube usage — inverse indicator
 *  10. Length of service
 */
export const HOPEHospiceCareIndexSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    locationId: Type.String({ format: "uuid" }),
    reportingPeriodStart: Type.String({ format: "date" }),
    reportingPeriodEnd: Type.String({ format: "date" }),
    totalPatientsInPeriod: Type.Integer({ minimum: 0 }),
    // Indicator scores (1 point each when met)
    indicator1_visitsNearDeath: Type.Number({
      minimum: 0,
      maximum: 1,
      description: "Rate of visits near death",
    }),
    indicator2_avoidedTransitions: Type.Number({ minimum: 0, maximum: 1 }),
    indicator3_continuousHomeCare: Type.Number({ minimum: 0, maximum: 1 }),
    indicator4_earlyEnrollment: Type.Number({ minimum: 0, maximum: 1 }),
    indicator5_shortStay: Type.Number({
      minimum: 0,
      maximum: 1,
      description: "Inverse — lower is better",
    }),
    indicator6_nhVisitsNearDeath: Type.Number({ minimum: 0, maximum: 1 }),
    indicator7_chemotherapy: Type.Number({ minimum: 0, maximum: 1, description: "Inverse" }),
    indicator8_multipleHospitalizations: Type.Number({
      minimum: 0,
      maximum: 1,
      description: "Inverse",
    }),
    indicator9_feedingTube: Type.Number({ minimum: 0, maximum: 1, description: "Inverse" }),
    indicator10_lengthOfService: Type.Number({ minimum: 0, maximum: 1 }),
    // Composite HCI score (0.0–10.0)
    hciCompositeScore: Type.Number({
      minimum: 0,
      maximum: 10,
      description: "HCI composite score — higher is better",
    }),
    calculatedAt: Type.String({ format: "date-time" }),
    submittedToHQRP: Type.Boolean(),
    submittedAt: Type.Optional(Type.String({ format: "date-time" })),
  },
  {
    additionalProperties: false,
    description: "Hospice Care Index (HCI) — 10-indicator composite",
  },
);

// ---------------------------------------------------------------------------
// HQRP Reporting Period Schema
// ---------------------------------------------------------------------------

export const HOPEReportingPeriodSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    locationId: Type.String({ format: "uuid" }),
    // HQRP reporting periods are calendar year quarters (Q1–Q4)
    calendarYear: Type.Integer({
      minimum: 2025,
      description: "Calendar year — HOPE effective Oct 1, 2025",
    }),
    quarter: Type.Enum(
      {
        q1: "Q1", // Jan–Mar
        q2: "Q2", // Apr–Jun
        q3: "Q3", // Jul–Sep
        q4: "Q4", // Oct–Dec
      },
      { description: "HQRP reporting quarter" },
    ),
    periodStart: Type.String({ format: "date" }),
    periodEnd: Type.String({ format: "date" }),
    // Submission status
    submissionDeadline: Type.String({
      format: "date",
      description: "HQRP submission deadline (typically 4.5 months after quarter end)",
    }),
    submissionStatus: Type.Enum({
      notStarted: "not_started",
      inProgress: "in_progress",
      submitted: "submitted",
      accepted: "accepted",
      rejected: "rejected",
    }),
    // Measures
    totalAdmissionAssessments: Type.Integer({ minimum: 0 }),
    totalDischargeAssessments: Type.Integer({ minimum: 0 }),
    totalUpdateVisitAssessments: Type.Integer({ minimum: 0 }),
    submittedAt: Type.Optional(Type.String({ format: "date-time" })),
    hqrpTrackingId: Type.Optional(Type.String()),
    penaltyApplied: Type.Boolean({
      default: false,
      description: "True if 2% payment penalty applied for non-submission",
    }),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  {
    additionalProperties: false,
    description: "HQRP Reporting Period — tracks submission status per quarter",
  },
);

// ---------------------------------------------------------------------------
// TypeScript types
// ---------------------------------------------------------------------------

export type HOPEComprehensiveAssessmentMeasure = Static<
  typeof HOPEComprehensiveAssessmentMeasureSchema
>;
export type HOPEHVLDLMeasure = Static<typeof HOPEHVLDLMeasureSchema>;
export type HOPETreatmentPreferencesMeasure = Static<typeof HOPETreatmentPreferencesMeasureSchema>;
export type HOPEHospiceCareIndex = Static<typeof HOPEHospiceCareIndexSchema>;
export type HOPEReportingPeriod = Static<typeof HOPEReportingPeriodSchema>;

// ---------------------------------------------------------------------------
// Quality measure calculation helpers
// ---------------------------------------------------------------------------

/**
 * Determine if comprehensive assessment measure numerator is met.
 * All 7 required domains must be addressed in the HOPE-A.
 */
export function calculateComprehensiveAssessmentNumerator(
  painCompleted: boolean,
  dyspneaCompleted: boolean,
  moodCompleted: boolean,
  cognitiveCompleted: boolean,
  nutritionalCompleted: boolean,
  functionalCompleted: boolean,
  advanceDirectivesDocumented: boolean,
): boolean {
  return (
    painCompleted &&
    dyspneaCompleted &&
    moodCompleted &&
    cognitiveCompleted &&
    nutritionalCompleted &&
    functionalCompleted &&
    advanceDirectivesDocumented
  );
}

/**
 * Determine if HVLDL Part A numerator is met.
 * Requires ≥2 RN or MD visits in the last 3 days of life.
 */
export function calculateHVLDLPartA(rnOrMdVisitsLast3Days: number): boolean {
  return rnOrMdVisitsLast3Days >= 2;
}

/**
 * Determine if HVLDL Part B numerator is met.
 * Requires ≥1 SWW or chaplain visit in the last 7 days of life.
 */
export function calculateHVLDLPartB(swwOrChaplainVisitsLast7Days: number): boolean {
  return swwOrChaplainVisitsLast7Days >= 1;
}

/**
 * Days until HQRP submission deadline.
 * Returns negative if overdue.
 */
export function daysUntilHQRPDeadline(submissionDeadline: string): number {
  const deadline = new Date(submissionDeadline);
  const today = new Date();
  return Math.floor((deadline.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
