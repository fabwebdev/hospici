// contexts/clinical/schemas/patient-conditions.schema.ts
// Hospice patient diagnoses — ICD-10 conditions, terminal diagnosis flag, CMS-required related conditions.

import { type Static, Type } from "@sinclair/typebox";

export const ConditionClinicalStatusSchema = Type.Enum(
  { ACTIVE: "ACTIVE", RESOLVED: "RESOLVED", REMISSION: "REMISSION" },
  { description: "Clinical status of the condition" },
);

export const ConditionSeveritySchema = Type.Enum(
  { MILD: "MILD", MODERATE: "MODERATE", SEVERE: "SEVERE" },
  { description: "Condition severity" },
);

export const PatientConditionResponseSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    patientId: Type.String({ format: "uuid" }),
    icd10Code: Type.String({ minLength: 3, maxLength: 20 }),
    description: Type.String(),
    isTerminal: Type.Boolean({
      description: "Qualifying terminal diagnosis for hospice eligibility (42 CFR §418.22)",
    }),
    isRelated: Type.Boolean({ description: "CMS-required related condition on claim" }),
    clinicalStatus: ConditionClinicalStatusSchema,
    severity: Type.Optional(ConditionSeveritySchema),
    onsetDate: Type.Optional(Type.String({ format: "date" })),
    confirmedDate: Type.Optional(Type.String({ format: "date" })),
    isActive: Type.Boolean(),
    documentedBy: Type.String({ format: "uuid" }),
    createdAt: Type.String(),
    updatedAt: Type.String(),
  },
  { additionalProperties: false },
);

export type PatientConditionResponse = Static<typeof PatientConditionResponseSchema>;

export const CreateConditionBodySchema = Type.Object(
  {
    icd10Code: Type.String({ minLength: 3, maxLength: 20 }),
    description: Type.String({ minLength: 1 }),
    isTerminal: Type.Boolean(),
    isRelated: Type.Boolean(),
    clinicalStatus: ConditionClinicalStatusSchema,
    severity: Type.Optional(ConditionSeveritySchema),
    onsetDate: Type.Optional(Type.String({ format: "date" })),
    confirmedDate: Type.Optional(Type.String({ format: "date" })),
  },
  { additionalProperties: false },
);

export type CreateConditionBody = Static<typeof CreateConditionBodySchema>;

export const PatchConditionBodySchema = Type.Partial(CreateConditionBodySchema, {
  additionalProperties: false,
});

export type PatchConditionBody = Static<typeof PatchConditionBodySchema>;

export const ConditionListResponseSchema = Type.Object({
  conditions: Type.Array(PatientConditionResponseSchema),
  total: Type.Integer(),
});

export type ConditionListResponse = Static<typeof ConditionListResponseSchema>;
