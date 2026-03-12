/**
 * VantageChart narrative templates — pre-authored clinical fragment library.
 *
 * Each template is a structured object matching NarrativeTemplate.
 * Templates are pre-compiled at module load via vantagechart-compiler.ts.
 *
 * Security: All conditions use the typed RuleCondition DSL — never raw strings.
 * Template strings use Handlebars {{variable}} syntax only.
 * Array helpers (formatSymptoms, formatInterventions, etc.) are registered
 * in the NarrativeAssemblerService constructor.
 */

import type { NarrativeTemplate } from "../schemas/narrative-template.schema.js";

export const ROUTINE_RN_TEMPLATE: NarrativeTemplate = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "Routine RN Visit — Standard",
  version: 1,
  visitType: "routine_rn",
  createdBy: "system",
  createdAt: "2026-03-12T00:00:00.000Z",
  lastModified: "2026-03-12T00:00:00.000Z",
  complianceTags: ["medicare_required", "hospice_cop_compliant", "idg_ready"],

  sections: [
    // ── 1. Visit Opening ──────────────────────────────────────────────────────
    {
      id: "opening",
      title: "Visit Opening",
      order: 1,
      fragments: [
        {
          id: "visit-context",
          template: "Routine RN visit conducted. Patient is {{overallCondition}}.",
          priority: 1,
          variables: {
            overallCondition: { source: "patientStatus.overallCondition" },
          },
        },
        {
          id: "orientation-status",
          template: " Patient is alert and oriented {{orientationLevel}}.",
          condition: { op: "truthy", path: "patientStatus.isAlertAndOriented" },
          priority: 2,
          variables: {
            orientationLevel: {
              source: "patientStatus.orientationLevel",
              transform: "upperCase",
              fallback: "",
            },
          },
        },
        {
          id: "not-oriented",
          template: " Patient is not alert and oriented.",
          condition: { op: "falsy", path: "patientStatus.isAlertAndOriented" },
          priority: 2,
          variables: {},
        },
      ],
    },

    // ── 2. Pain Assessment ────────────────────────────────────────────────────
    {
      id: "pain-assessment",
      title: "Pain Assessment",
      order: 2,
      condition: { op: "eq", path: "painAssessment.hasPain", value: true },
      fragments: [
        {
          id: "pain-present",
          template:
            " Patient reports pain rated {{painScale}}/10{{painLocationPhrase}}{{painQualityPhrase}}.",
          priority: 1,
          variables: {
            painScale: { source: "painAssessment.painScale", fallback: "unknown" },
            painLocationPhrase: {
              source: "painAssessment.painLocation",
              fallback: "",
            },
            painQualityPhrase: {
              source: "painAssessment.painQuality",
              transform: "joinWithComma",
              fallback: "",
            },
          },
        },
        {
          id: "pain-managed",
          template: " Pain is well-managed with current regimen.",
          condition: {
            op: "and",
            conditions: [
              { op: "eq", path: "painAssessment.painManagementEffective", value: true },
              { op: "lte", path: "painAssessment.painScale", value: 3 },
            ],
          },
          priority: 2,
          variables: {},
        },
        {
          id: "pain-suboptimal",
          template: " Pain management suboptimal. Recommend PRN medication review.",
          condition: {
            op: "or",
            conditions: [
              { op: "eq", path: "painAssessment.painManagementEffective", value: false },
              { op: "gt", path: "painAssessment.painScale", value: 3 },
            ],
          },
          priority: 2,
          variables: {},
        },
        {
          id: "breakthrough-pain",
          template: " Breakthrough pain noted between scheduled medications.",
          condition: { op: "eq", path: "painAssessment.breakthroughPain", value: true },
          priority: 3,
          variables: {},
        },
      ],
    },

    // ── 3. No Pain ────────────────────────────────────────────────────────────
    {
      id: "no-pain",
      title: "Pain Assessment — No Pain",
      order: 3,
      condition: { op: "eq", path: "painAssessment.hasPain", value: false },
      fragments: [
        {
          id: "pain-absent",
          template: " Patient denies pain at time of visit.",
          priority: 1,
          variables: {},
        },
      ],
    },

    // ── 4. Symptom Review ─────────────────────────────────────────────────────
    {
      id: "symptom-review",
      title: "Symptom Review",
      order: 4,
      condition: { op: "arrayLength", path: "symptoms", gt: 0 },
      fragments: [
        {
          id: "symptom-summary",
          template: " Symptom review: {{formatSymptoms symptoms}}.",
          priority: 1,
          variables: {
            symptoms: { source: "symptoms" },
          },
        },
        {
          id: "worsening-symptoms",
          template:
            " Notable worsening in {{worseningSymptomNames symptoms}}. Care plan adjustments may be warranted.",
          condition: {
            op: "arrayAny",
            path: "symptoms",
            where: { op: "eq", path: "isWorsening", value: true },
          },
          priority: 2,
          variables: {
            symptoms: { source: "symptoms" },
          },
        },
      ],
    },

    // ── 5. Interventions ──────────────────────────────────────────────────────
    {
      id: "interventions",
      title: "Interventions Provided",
      order: 5,
      condition: { op: "arrayLength", path: "interventions", gt: 0 },
      fragments: [
        {
          id: "intervention-list",
          template: " Interventions provided: {{formatInterventions interventions}}.",
          priority: 1,
          variables: {
            interventions: { source: "interventions" },
          },
        },
        {
          id: "positive-response",
          template: " Patient responded positively to all interventions.",
          condition: {
            op: "arrayEvery",
            path: "interventions",
            where: { op: "eq", path: "patientResponse", value: "positive" },
          },
          priority: 2,
          variables: {},
        },
      ],
    },

    // ── 6. Psychosocial ───────────────────────────────────────────────────────
    {
      id: "psychosocial",
      title: "Psychosocial Assessment",
      order: 6,
      fragments: [
        {
          id: "caregiver-status",
          template: " Caregiver is coping {{copingStatus}} with patient's condition.",
          priority: 1,
          variables: {
            copingStatus: { source: "psychosocial.caregiverCoping" },
          },
        },
        {
          id: "patient-mood",
          template: " Patient mood is {{mood}}.",
          priority: 2,
          variables: {
            mood: { source: "psychosocial.patientMood" },
          },
        },
        {
          id: "spiritual-concerns",
          template: " Spiritual concerns identified. Chaplain referral recommended.",
          condition: { op: "eq", path: "psychosocial.spiritualConcerns", value: true },
          priority: 3,
          variables: {},
        },
      ],
    },

    // ── 7. Care Plan ──────────────────────────────────────────────────────────
    {
      id: "care-plan",
      title: "Care Plan Compliance",
      order: 7,
      fragments: [
        {
          id: "frequencies-followed",
          template: " Care plan frequencies are being followed.",
          condition: { op: "eq", path: "carePlan.frequenciesFollowed", value: true },
          priority: 1,
          variables: {},
        },
        {
          id: "frequencies-not-followed",
          template:
            " Care plan frequencies NOT being followed. Barriers: {{barriers}}. IDG discussion needed.",
          condition: { op: "eq", path: "carePlan.frequenciesFollowed", value: false },
          priority: 1,
          variables: {
            barriers: {
              source: "carePlan.barriers",
              transform: "joinWithComma",
              fallback: "unknown",
            },
          },
        },
        {
          id: "medication-compliance",
          template: " Medication compliance: {{compliance}}.",
          priority: 2,
          variables: {
            compliance: { source: "carePlan.medicationCompliance" },
          },
        },
      ],
    },

    // ── 8. Safety ─────────────────────────────────────────────────────────────
    {
      id: "safety",
      title: "Safety Assessment",
      order: 8,
      fragments: [
        {
          id: "fall-risk",
          template: " Fall risk assessed as {{fallRisk}}.",
          priority: 1,
          variables: {
            fallRisk: { source: "safety.fallRisk" },
          },
        },
        {
          id: "safety-concerns",
          template: " SAFETY CONCERNS identified: {{formatSafetyConcerns safety}}. Immediate attention required.",
          condition: {
            op: "or",
            conditions: [
              { op: "eq", path: "safety.fallRisk", value: "high" },
              { op: "arrayLength", path: "safety.environmentConcerns", gt: 0 },
            ],
          },
          priority: 2,
          variables: {
            safety: { source: "safety" },
          },
        },
      ],
    },

    // ── 9. Plan Changes ───────────────────────────────────────────────────────
    {
      id: "plan-changes",
      title: "Plan Changes",
      order: 9,
      condition: { op: "arrayLength", path: "planChanges", gt: 0 },
      fragments: [
        {
          id: "changes-intro",
          template: " The following care plan changes are recommended:",
          priority: 1,
          variables: {},
        },
        {
          id: "change-list",
          template: " {{formatPlanChanges planChanges}}",
          priority: 2,
          variables: {
            planChanges: { source: "planChanges" },
          },
        },
      ],
    },

    // ── 10. Additional Notes ──────────────────────────────────────────────────
    {
      id: "additional-notes",
      title: "Additional Notes",
      order: 10,
      condition: { op: "truthy", path: "additionalNotes" },
      fragments: [
        {
          id: "free-text",
          template: " Clinician notes: {{additionalNotes}}",
          priority: 1,
          variables: {
            additionalNotes: { source: "additionalNotes" },
          },
        },
      ],
    },

    // ── 11. Visit Closing (always last) ───────────────────────────────────────
    {
      id: "closing",
      title: "Visit Closing",
      order: 100,
      fragments: [
        {
          id: "next-visit",
          template: " Next RN visit per care plan frequency. Continue to monitor.",
          priority: 1,
          variables: {},
        },
      ],
    },
  ],

  contextRules: [
    {
      trigger: { op: "eq", path: "patientStatus.overallCondition", value: "critical" },
      action: "addPhrase",
      value: " CRITICAL CONDITION — Notify physician of status change.",
    },
    {
      trigger: { op: "eq", path: "patientStatus.overallCondition", value: "deceased" },
      action: "addPhrase",
      value: " Patient expired. Notify attending physician, hospice medical director, and family per protocol.",
    },
    {
      trigger: { op: "gte", path: "painAssessment.painScale", value: 7 },
      action: "addPhrase",
      value: " SEVERE PAIN (≥7/10) — Immediate intervention required.",
    },
    {
      trigger: {
        op: "arrayAny",
        path: "symptoms",
        where: { op: "gte", path: "severity", value: 8 },
      },
      action: "addPhrase",
      value: " Urgent symptom burden (severity ≥8) noted. Escalate to IDG.",
    },
    {
      trigger: { op: "eq", path: "psychosocial.caregiverCoping", value: "crisis" },
      action: "addPhrase",
      value: " CAREGIVER CRISIS — SW referral required. Consider respite care.",
    },
  ],
};

/** Admission template — abbreviated; full expansion deferred to post-MVP */
export const ADMISSION_TEMPLATE: NarrativeTemplate = {
  id: "00000000-0000-0000-0000-000000000002",
  name: "Admission Visit — Standard",
  version: 1,
  visitType: "admission",
  createdBy: "system",
  createdAt: "2026-03-12T00:00:00.000Z",
  lastModified: "2026-03-12T00:00:00.000Z",
  complianceTags: ["medicare_required", "hospice_cop_compliant", "admission_required"],
  sections: [
    {
      id: "opening",
      title: "Admission Visit Opening",
      order: 1,
      fragments: [
        {
          id: "admission-context",
          template:
            "Admission RN visit conducted. Patient is {{overallCondition}}. Hospice election signed and consent documented.",
          priority: 1,
          variables: {
            overallCondition: { source: "patientStatus.overallCondition" },
          },
        },
      ],
    },
    // Additional admission-specific sections would be added here
    {
      id: "closing",
      title: "Admission Closing",
      order: 100,
      fragments: [
        {
          id: "admission-next",
          template:
            " Initial IDG scheduled per admission protocol. Follow-up RN visit per care plan.",
          priority: 1,
          variables: {},
        },
      ],
    },
  ],
  contextRules: [],
};

/** Template registry — keyed by visitType */
export const TEMPLATE_REGISTRY: Record<string, NarrativeTemplate> = {
  routine_rn: ROUTINE_RN_TEMPLATE,
  admission: ADMISSION_TEMPLATE,
};

/** Get template by visit type, falling back to routine RN */
export function getTemplate(visitType: string): NarrativeTemplate {
  return TEMPLATE_REGISTRY[visitType] ?? ROUTINE_RN_TEMPLATE;
}
