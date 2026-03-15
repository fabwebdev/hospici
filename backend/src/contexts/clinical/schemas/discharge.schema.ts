import { type Static, Type } from "@sinclair/typebox";

export const DischargeTypeSchema = Type.Enum(
  {
    expected_death: "expected_death",
    revocation: "revocation",
    transfer: "transfer",
    live_discharge: "live_discharge",
  },
  { description: "Hospice discharge type" },
);
export type DischargeType = Static<typeof DischargeTypeSchema>;

export const DeathLocationSchema = Type.Enum({
  home: "home",
  inpatient: "inpatient",
  snf: "snf",
  hospital: "hospital",
});
export type DeathLocation = Static<typeof DeathLocationSchema>;

export const DischargeBodySchema = Type.Object(
  {
    dischargeType: DischargeTypeSchema,
    dischargeDate: Type.String({ format: "date" }),
    timeOfDeath: Type.Optional(Type.String()),
    pronouncingPhysician: Type.Optional(Type.String({ minLength: 1 })),
    locationAtDeath: Type.Optional(DeathLocationSchema),
    witnessName: Type.Optional(Type.String()),
    familyNotified: Type.Optional(Type.Boolean()),
    physicianNotificationAt: Type.Optional(Type.String({ format: "date-time" })),
    revocationReason: Type.Optional(Type.String({ minLength: 20 })),
    patientRepresentative: Type.Optional(Type.String()),
    noeId: Type.Optional(Type.String({ format: "uuid" })),
    receivingAgencyNpi: Type.Optional(Type.String()),
    receivingHospiceName: Type.Optional(Type.String()),
    transferDate: Type.Optional(Type.String({ format: "date" })),
    physicianDocumentation: Type.Optional(Type.String()),
    liveDischargeReason: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type DischargeBody = Static<typeof DischargeBodySchema>;

export const DischargeResponseSchema = Type.Object(
  {
    patientId: Type.String({ format: "uuid" }),
    dischargeType: DischargeTypeSchema,
    dischargeDate: Type.String({ format: "date" }),
    hopeDWindowDeadline: Type.Optional(Type.String({ format: "date" })),
    notrId: Type.Optional(Type.String({ format: "uuid" })),
    notrDeadline: Type.Optional(Type.String({ format: "date" })),
  },
  { additionalProperties: false },
);
export type DischargeResponse = Static<typeof DischargeResponseSchema>;
