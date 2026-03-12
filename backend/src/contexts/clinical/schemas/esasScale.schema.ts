// contexts/clinical/schemas/esasScale.schema.ts
// ESAS (Edmonton Symptom Assessment System) — multi-symptom hospice standard

import { type Static, Type } from "@sinclair/typebox";

const SymptomScore = Type.Integer({ minimum: 0, maximum: 10 });

export const EsasScaleSchema = Type.Object(
  {
    // All scores: 0 = no symptom, 10 = worst possible
    pain: SymptomScore,
    fatigue: SymptomScore,
    nausea: SymptomScore,
    depression: SymptomScore,
    anxiety: SymptomScore,
    drowsiness: SymptomScore,
    // 0 = best appetite, 10 = no appetite
    appetite: SymptomScore,
    // 0 = best wellbeing, 10 = worst
    wellbeing: SymptomScore,
    // shortness of breath
    dyspnea: SymptomScore,
    // Optional clinician-defined additional symptom
    otherSymptom: Type.Optional(Type.String({ maxLength: 100 })),
    otherScore: Type.Optional(SymptomScore),
  },
  { additionalProperties: false },
);

export type EsasScale = Static<typeof EsasScaleSchema>;
