// contexts/clinical/schemas/patient-insurance.schema.ts
// Hospice patient insurance / coverage records.
// Covers Medicare Part A (primary for most hospice patients), Medicare Advantage,
// Medicaid, private insurance, and VA.

import { type Static, Type } from "@sinclair/typebox";

export const InsuranceCoverageTypeSchema = Type.Enum(
  {
    MEDICARE_PART_A: "MEDICARE_PART_A",
    MEDICARE_ADVANTAGE: "MEDICARE_ADVANTAGE",
    MEDICAID: "MEDICAID",
    MEDICAID_WAIVER: "MEDICAID_WAIVER",
    PRIVATE: "PRIVATE",
    VA: "VA",
    OTHER: "OTHER",
  },
  { description: "Insurance coverage type" },
);

export const SubscriberRelationshipSchema = Type.Enum(
  { SELF: "SELF", SPOUSE: "SPOUSE", CHILD: "CHILD", OTHER: "OTHER" },
  { description: "Subscriber relationship to patient" },
);

export const PatientInsuranceResponseSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    patientId: Type.String({ format: "uuid" }),
    coverageType: InsuranceCoverageTypeSchema,
    isPrimary: Type.Boolean(),
    payerName: Type.String(),
    payerId: Type.Optional(Type.String()),
    planName: Type.Optional(Type.String()),
    policyNumber: Type.Optional(Type.String()),
    groupNumber: Type.Optional(Type.String()),
    subscriberId: Type.String({ description: "Medicare Beneficiary ID or plan-specific member ID" }),
    subscriberFirstName: Type.Optional(Type.String()),
    subscriberLastName: Type.Optional(Type.String()),
    subscriberDob: Type.Optional(Type.String({ format: "date" })),
    relationshipToPatient: SubscriberRelationshipSchema,
    effectiveDate: Type.Optional(Type.String({ format: "date" })),
    terminationDate: Type.Optional(Type.String({ format: "date" })),
    priorAuthNumber: Type.Optional(Type.String()),
    isActive: Type.Boolean(),
    documentedBy: Type.String({ format: "uuid" }),
    createdAt: Type.String(),
    updatedAt: Type.String(),
  },
  { additionalProperties: false },
);

export type PatientInsuranceResponse = Static<typeof PatientInsuranceResponseSchema>;

export const CreateInsuranceBodySchema = Type.Object(
  {
    coverageType: InsuranceCoverageTypeSchema,
    isPrimary: Type.Boolean(),
    payerName: Type.String({ minLength: 1 }),
    payerId: Type.Optional(Type.String()),
    planName: Type.Optional(Type.String()),
    policyNumber: Type.Optional(Type.String()),
    groupNumber: Type.Optional(Type.String()),
    subscriberId: Type.String({ minLength: 1 }),
    subscriberFirstName: Type.Optional(Type.String()),
    subscriberLastName: Type.Optional(Type.String()),
    subscriberDob: Type.Optional(Type.String({ format: "date" })),
    relationshipToPatient: SubscriberRelationshipSchema,
    effectiveDate: Type.Optional(Type.String({ format: "date" })),
    terminationDate: Type.Optional(Type.String({ format: "date" })),
    priorAuthNumber: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export type CreateInsuranceBody = Static<typeof CreateInsuranceBodySchema>;

export const PatchInsuranceBodySchema = Type.Partial(CreateInsuranceBodySchema, {
  additionalProperties: false,
});

export type PatchInsuranceBody = Static<typeof PatchInsuranceBodySchema>;

export const InsuranceListResponseSchema = Type.Object({
  insurance: Type.Array(PatientInsuranceResponseSchema),
  total: Type.Integer(),
});

export type InsuranceListResponse = Static<typeof InsuranceListResponseSchema>;
