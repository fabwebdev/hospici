/**
 * VantageChartInputSchema — the full structured input captured via the 9-step
 * form before narrative assembly. Stored as JSONB in encounters.data.
 *
 * This schema is the source-of-truth for both:
 *  - Layer 1 deterministic assembly (vantageChart.templates.ts)
 *  - Traceability records stored for CMS audit
 */

import { type Static, Type } from "@sinclair/typebox";

export const VisitTypeSchema = Type.Enum(
  {
    routine_rn: "routine_rn",
    admission: "admission",
    recertification: "recertification",
    supervisory: "supervisory",
    prn: "prn",
    discharge: "discharge",
  },
  { $id: "VisitType" },
);

export type VisitType = Static<typeof VisitTypeSchema>;

export const VantageChartInputSchema = Type.Object(
  {
    // ── Visit Context ──────────────────────────────────────────────────────────
    visitType: VisitTypeSchema,

    // ── Patient Status ─────────────────────────────────────────────────────────
    patientStatus: Type.Object({
      overallCondition: Type.Enum({
        stable: "stable",
        declining: "declining",
        improving: "improving",
        critical: "critical",
        deceased: "deceased",
      }),
      isAlertAndOriented: Type.Boolean(),
      orientationLevel: Type.Optional(
        Type.Enum({ x0: "x0", x1: "x1", x2: "x2", x3: "x3", x4: "x4" }),
      ),
    }),

    // ── Pain Assessment ────────────────────────────────────────────────────────
    painAssessment: Type.Object({
      hasPain: Type.Boolean(),
      painScale: Type.Optional(Type.Number({ minimum: 0, maximum: 10 })),
      painLocation: Type.Optional(Type.String()),
      painQuality: Type.Optional(
        Type.Array(
          Type.Enum({
            sharp: "sharp",
            dull: "dull",
            aching: "aching",
            burning: "burning",
            throbbing: "throbbing",
          }),
        ),
      ),
      painManagementEffective: Type.Optional(Type.Boolean()),
      breakthroughPain: Type.Optional(Type.Boolean()),
    }),

    // ── Symptoms (ESAS-inspired) ───────────────────────────────────────────────
    symptoms: Type.Array(
      Type.Object({
        symptom: Type.Enum({
          pain: "pain",
          dyspnea: "dyspnea",
          fatigue: "fatigue",
          nausea: "nausea",
          depression: "depression",
          anxiety: "anxiety",
          drowsiness: "drowsiness",
          appetite: "appetite",
          wellbeing: "wellbeing",
        }),
        severity: Type.Number({ minimum: 0, maximum: 10 }),
        isNew: Type.Boolean(),
        isWorsening: Type.Boolean(),
        interventionProvided: Type.Boolean(),
      }),
    ),

    // ── Interventions Provided ─────────────────────────────────────────────────
    interventions: Type.Array(
      Type.Object({
        category: Type.Enum({
          medication_admin: "medication_admin",
          wound_care: "wound_care",
          symptom_management: "symptom_management",
          psychosocial_support: "psychosocial_support",
          spiritual_care: "spiritual_care",
          caregiver_education: "caregiver_education",
          safety_assessment: "safety_assessment",
          equipment: "equipment",
        }),
        description: Type.String(),
        patientResponse: Type.Enum({
          positive: "positive",
          neutral: "neutral",
          negative: "negative",
        }),
      }),
    ),

    // ── Psychosocial ───────────────────────────────────────────────────────────
    psychosocial: Type.Object({
      caregiverCoping: Type.Enum({
        well: "well",
        adequate: "adequate",
        struggling: "struggling",
        crisis: "crisis",
      }),
      patientMood: Type.Enum({
        calm: "calm",
        anxious: "anxious",
        depressed: "depressed",
        agitated: "agitated",
        peaceful: "peaceful",
      }),
      spiritualConcerns: Type.Optional(Type.Boolean()),
    }),

    // ── Care Plan Adherence ────────────────────────────────────────────────────
    carePlan: Type.Object({
      frequenciesFollowed: Type.Boolean(),
      medicationCompliance: Type.Enum({
        compliant: "compliant",
        partial: "partial",
        noncompliant: "noncompliant",
      }),
      barriers: Type.Optional(Type.Array(Type.String())),
    }),

    // ── Safety & Environment ───────────────────────────────────────────────────
    safety: Type.Object({
      fallRisk: Type.Enum({ low: "low", moderate: "moderate", high: "high" }),
      equipmentNeeds: Type.Optional(Type.Array(Type.String())),
      environmentConcerns: Type.Optional(Type.Array(Type.String())),
    }),

    // ── Plan Changes ───────────────────────────────────────────────────────────
    planChanges: Type.Array(
      Type.Object({
        type: Type.Enum({
          new_order: "new_order",
          discontinue: "discontinue",
          frequency_change: "frequency_change",
          medication_change: "medication_change",
        }),
        description: Type.String(),
        requiresPhysician: Type.Boolean(),
      }),
    ),

    // ── Clinician free text (optional, 1000-char cap) ──────────────────────────
    additionalNotes: Type.Optional(Type.String({ maxLength: 1000 })),

    // ── Metadata ───────────────────────────────────────────────────────────────
    recordedAt: Type.String({ format: "date-time" }),
    inputMethod: Type.Enum({
      touch: "touch",
      voice: "voice",
      mixed: "mixed",
    }),
  },
  { $id: "VantageChartInput" },
);

export type VantageChartInput = Static<typeof VantageChartInputSchema>;
