// contexts/f2f/schemas/f2f.schema.ts
// F2F Validity Engine — TypeBox schemas for T3-2b

import { type Static, Type } from "@sinclair/typebox";

export const F2FProviderRoleSchema = Type.Union([
  Type.Literal("physician"),
  Type.Literal("np"),
  Type.Literal("pa"),
]);

export const F2FEncounterSettingSchema = Type.Union([
  Type.Literal("office"),
  Type.Literal("home"),
  Type.Literal("telehealth"),
  Type.Literal("snf"),
  Type.Literal("hospital"),
]);

export const CreateF2FBodySchema = Type.Object(
  {
    benefitPeriodId: Type.String({ format: "uuid" }),
    f2fDate: Type.String({ format: "date" }),
    f2fProviderId: Type.Optional(Type.String({ format: "uuid" })),
    f2fProviderNpi: Type.Optional(Type.String({ minLength: 10, maxLength: 10 })),
    f2fProviderRole: F2FProviderRoleSchema,
    encounterSetting: F2FEncounterSettingSchema,
    clinicalFindings: Type.String({ minLength: 1 }),
  },
  { additionalProperties: false },
);

export const PatchF2FBodySchema = Type.Object(
  {
    f2fDate: Type.Optional(Type.String({ format: "date" })),
    f2fProviderId: Type.Optional(Type.String({ format: "uuid" })),
    f2fProviderNpi: Type.Optional(Type.String({ minLength: 10, maxLength: 10 })),
    f2fProviderRole: Type.Optional(F2FProviderRoleSchema),
    encounterSetting: Type.Optional(F2FEncounterSettingSchema),
    clinicalFindings: Type.Optional(Type.String({ minLength: 1 })),
  },
  { additionalProperties: false },
);

export const F2FValidityResultSchema = Type.Object(
  {
    isValid: Type.Boolean(),
    reasons: Type.Array(Type.String()),
    validatedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

export const F2FEncounterResponseSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    patientId: Type.String({ format: "uuid" }),
    locationId: Type.String({ format: "uuid" }),
    benefitPeriodId: Type.String({ format: "uuid" }),
    f2fDate: Type.String({ format: "date" }),
    f2fProviderId: Type.Optional(Type.String({ format: "uuid" })),
    f2fProviderNpi: Type.Optional(Type.String()),
    f2fProviderRole: F2FProviderRoleSchema,
    encounterSetting: F2FEncounterSettingSchema,
    clinicalFindings: Type.String(),
    isValidForRecert: Type.Boolean(),
    validatedAt: Type.Optional(Type.String({ format: "date-time" })),
    invalidationReason: Type.Optional(Type.String()),
    physicianTaskId: Type.Optional(Type.String({ format: "uuid" })),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
    // Denormalised period info
    periodNumber: Type.Number(),
    periodType: Type.String(),
  },
  { additionalProperties: false },
);

export const F2FEncounterListResponseSchema = Type.Object(
  {
    encounters: Type.Array(F2FEncounterResponseSchema),
    total: Type.Number(),
  },
  { additionalProperties: false },
);

export const F2FQueueItemSchema = Type.Object(
  {
    patientId: Type.String({ format: "uuid" }),
    patientName: Type.String(),
    periodNumber: Type.Number(),
    periodType: Type.String(),
    startDate: Type.String({ format: "date" }),
    endDate: Type.String({ format: "date" }),
    recertDate: Type.String({ format: "date" }),
    daysUntilRecert: Type.Number(),
    f2fStatus: Type.Union([
      Type.Literal("valid"),
      Type.Literal("invalid"),
      Type.Literal("missing"),
    ]),
    lastF2FDate: Type.Optional(Type.String({ format: "date" })),
    assignedPhysicianId: Type.Optional(Type.String({ format: "uuid" })),
  },
  { additionalProperties: false },
);

export const F2FQueueResponseSchema = Type.Object(
  {
    items: Type.Array(F2FQueueItemSchema),
    total: Type.Number(),
  },
  { additionalProperties: false },
);

export type CreateF2FBody = Static<typeof CreateF2FBodySchema>;
export type PatchF2FBody = Static<typeof PatchF2FBodySchema>;
export type F2FValidityResult = Static<typeof F2FValidityResultSchema>;
export type F2FEncounterResponse = Static<typeof F2FEncounterResponseSchema>;
export type F2FEncounterListResponse = Static<typeof F2FEncounterListResponseSchema>;
export type F2FQueueItem = Static<typeof F2FQueueItemSchema>;
export type F2FQueueResponse = Static<typeof F2FQueueResponseSchema>;
