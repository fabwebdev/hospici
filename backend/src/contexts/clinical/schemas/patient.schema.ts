// contexts/clinical/schemas/patient.schema.ts
// Patient demographics and FHIR R4 Patient resource + CRUD request/response schemas

import { type Static, Type } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";

export const HumanNameSchema = Type.Object({
  use: Type.Optional(
    Type.Enum({
      usual: "usual",
      official: "official",
      temp: "temp",
      nickname: "nickname",
      old: "old",
      maiden: "maiden",
    }),
  ),
  family: Type.String(),
  given: Type.Array(Type.String()),
});

export const AddressSchema = Type.Object({
  use: Type.Optional(
    Type.Enum({ home: "home", work: "work", temp: "temp", old: "old", billing: "billing" }),
  ),
  line: Type.Array(Type.String()),
  city: Type.String(),
  state: Type.String(),
  postalCode: Type.String(),
  country: Type.String({ default: "US" }),
});

export const IdentifierSchema = Type.Object({
  system: Type.String(),
  value: Type.String(),
});

export const PatientSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    resourceType: Type.Literal("Patient"),
    identifier: Type.Array(IdentifierSchema),
    name: Type.Array(HumanNameSchema),
    gender: Type.Optional(
      Type.Enum({
        male: "male",
        female: "female",
        other: "other",
        unknown: "unknown",
      }),
    ),
    birthDate: Type.String({ format: "date" }),
    address: Type.Optional(Type.Array(AddressSchema)),
    hospiceLocationId: Type.String({ format: "uuid" }),
    admissionDate: Type.Optional(Type.String({ format: "date" })),
    dischargeDate: Type.Optional(Type.String({ format: "date" })),
    // Extension point for R6 migration
    _gender: Type.Optional(Type.Object({ id: Type.Optional(Type.String()) })),
  },
  {
    additionalProperties: false,
    description: "Hospici Patient Resource (FHIR R4 compatible)",
  },
);

export const PatientValidator = TypeCompiler.Compile(PatientSchema);

export type Patient = Static<typeof PatientSchema>;
export type HumanName = Static<typeof HumanNameSchema>;
export type Address = Static<typeof AddressSchema>;
export type Identifier = Static<typeof IdentifierSchema>;

// ── Care model ────────────────────────────────────────────────────────────────

export const CareModelSchema = Type.Enum(
  { HOSPICE: "HOSPICE", PALLIATIVE: "PALLIATIVE", CCM: "CCM" },
  { description: "Care delivery model" },
);

export type CareModel = Static<typeof CareModelSchema>;

// ── CRUD request schemas ──────────────────────────────────────────────────────

const GenderEnum = Type.Enum({
  male: "male",
  female: "female",
  other: "other",
  unknown: "unknown",
});

/** POST /patients — body (no id; server generates) */
export const CreatePatientBodySchema = Type.Object(
  {
    identifier: Type.Array(IdentifierSchema),
    name: Type.Array(HumanNameSchema),
    gender: Type.Optional(GenderEnum),
    birthDate: Type.String({ format: "date" }),
    address: Type.Optional(Type.Array(AddressSchema)),
    hospiceLocationId: Type.String({ format: "uuid" }),
    admissionDate: Type.Optional(Type.String({ format: "date" })),
    dischargeDate: Type.Optional(Type.String({ format: "date" })),
    careModel: Type.Optional(CareModelSchema),
    _gender: Type.Optional(Type.Object({ id: Type.Optional(Type.String()) })),
  },
  { additionalProperties: false },
);

export type CreatePatientBody = Static<typeof CreatePatientBodySchema>;

/** PATCH /patients/:id — all fields optional */
export const PatchPatientBodySchema = Type.Partial(CreatePatientBodySchema, {
  additionalProperties: false,
});

export type PatchPatientBody = Static<typeof PatchPatientBodySchema>;

/** Full patient response (promoted DB columns + decrypted FHIR data) */
export const PatientResponseSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    resourceType: Type.Literal("Patient"),
    identifier: Type.Array(IdentifierSchema),
    name: Type.Array(HumanNameSchema),
    gender: Type.Optional(GenderEnum),
    birthDate: Type.String({ format: "date" }),
    address: Type.Optional(Type.Array(AddressSchema)),
    hospiceLocationId: Type.String({ format: "uuid" }),
    admissionDate: Type.Optional(Type.String()),
    dischargeDate: Type.Optional(Type.String()),
    careModel: CareModelSchema,
    createdAt: Type.Optional(Type.String()),
    updatedAt: Type.Optional(Type.String()),
    _gender: Type.Optional(Type.Object({ id: Type.Optional(Type.String()) })),
  },
  { additionalProperties: false },
);

export type PatientResponse = Static<typeof PatientResponseSchema>;

/** GET /patients — query parameters */
export const PatientListQuerySchema = Type.Object(
  {
    page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
    limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
    careModel: Type.Optional(CareModelSchema),
  },
  { additionalProperties: false },
);

export type PatientListQuery = Static<typeof PatientListQuerySchema>;

/** GET /patients — response envelope */
export const PatientListResponseSchema = Type.Object({
  patients: Type.Array(PatientResponseSchema),
  total: Type.Integer(),
  page: Type.Integer(),
  limit: Type.Integer(),
});
