// contexts/fhir/schemas/fhir.schema.ts
// FHIR R4 Resource schemas (US Core Profile compliant)

import { type Static, Type } from "@sinclair/typebox";

// ── FHIR Primitive Types ─────────────────────────────────────────────────────

export const FhirIdSchema = Type.String({
  pattern: "^[A-Za-z0-9\\-\\.]{1,64}$",
  description: "FHIR id type",
});

export const FhirUriSchema = Type.String({ format: "uri" });

export const FhirDateSchema = Type.String({
  pattern:
    "^([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)(-(0[1-9]|1[0-2])(-(0[1-9]|[1-2][0-9]|3[0-1]))?)?$",
  description: "FHIR date type (YYYY, YYYY-MM, or YYYY-MM-DD)",
});

export const FhirDateTimeSchema = Type.String({
  pattern:
    "^([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)(-(0[1-9]|1[0-2])(-(0[1-9]|[1-2][0-9]|3[0-1])(T([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)(\\.[0-9]+)?(Z|(\\+|-)((0[0-9]|1[0-3]):[0-5][0-9]|14:00)))?)?)?$",
  description: "FHIR dateTime type",
});

export const FhirInstantSchema = Type.String({
  format: "date-time",
  description: "FHIR instant type (XML dateTime with timezone)",
});

// ── FHIR Datatypes ───────────────────────────────────────────────────────────

export const FhirCodingSchema = Type.Object({
  system: Type.Optional(FhirUriSchema),
  version: Type.Optional(Type.String()),
  code: Type.Optional(Type.String()),
  display: Type.Optional(Type.String()),
  userSelected: Type.Optional(Type.Boolean()),
});

export const FhirCodeableConceptSchema = Type.Object({
  coding: Type.Optional(Type.Array(FhirCodingSchema)),
  text: Type.Optional(Type.String()),
});

export const FhirIdentifierSchema = Type.Object({
  use: Type.Optional(
    Type.Enum({
      usual: "usual",
      official: "official",
      temp: "temp",
      secondary: "secondary",
      old: "old",
    }),
  ),
  type: Type.Optional(FhirCodeableConceptSchema),
  system: Type.Optional(FhirUriSchema),
  value: Type.Optional(Type.String()),
});

export const FhirHumanNameSchema = Type.Object({
  use: Type.Optional(
    Type.Enum({
      usual: "usual",
      official: "official",
      temp: "temp",
      nickname: "nickname",
      anonymous: "anonymous",
      old: "old",
      maiden: "maiden",
    }),
  ),
  text: Type.Optional(Type.String()),
  family: Type.Optional(Type.String()),
  given: Type.Optional(Type.Array(Type.String())),
  prefix: Type.Optional(Type.Array(Type.String())),
  suffix: Type.Optional(Type.Array(Type.String())),
});

export const FhirAddressSchema = Type.Object({
  use: Type.Optional(
    Type.Enum({ home: "home", work: "work", temp: "temp", old: "old", billing: "billing" }),
  ),
  type: Type.Optional(Type.Enum({ postal: "postal", physical: "physical", both: "both" })),
  text: Type.Optional(Type.String()),
  line: Type.Optional(Type.Array(Type.String())),
  city: Type.Optional(Type.String()),
  district: Type.Optional(Type.String()),
  state: Type.Optional(Type.String()),
  postalCode: Type.Optional(Type.String()),
  country: Type.Optional(Type.String()),
});

export const FhirContactPointSchema = Type.Object({
  system: Type.Optional(
    Type.Enum({
      phone: "phone",
      fax: "fax",
      email: "email",
      pager: "pager",
      url: "url",
      sms: "sms",
      other: "other",
    }),
  ),
  value: Type.Optional(Type.String()),
  use: Type.Optional(
    Type.Enum({ home: "home", work: "work", temp: "temp", old: "old", mobile: "mobile" }),
  ),
});

export const FhirReferenceSchema = Type.Object({
  reference: Type.Optional(Type.String()),
  type: Type.Optional(FhirUriSchema),
  identifier: Type.Optional(FhirIdentifierSchema),
  display: Type.Optional(Type.String()),
});

export const FhirQuantitySchema = Type.Object({
  value: Type.Optional(Type.Number()),
  comparator: Type.Optional(Type.Enum({ "<": "<", "<=": "<=", ">=": ">=", ">": ">" })),
  unit: Type.Optional(Type.String()),
  system: Type.Optional(FhirUriSchema),
  code: Type.Optional(Type.String()),
});

// ── US Core Patient Profile ───────────────────────────────────────────────────

export const FhirPatientSchema = Type.Object(
  {
    resourceType: Type.Literal("Patient"),
    id: Type.Optional(FhirIdSchema),
    meta: Type.Optional(
      Type.Object({
        versionId: Type.Optional(Type.String()),
        lastUpdated: Type.Optional(FhirInstantSchema),
        profile: Type.Optional(Type.Array(FhirUriSchema)),
      }),
    ),
    identifier: Type.Array(FhirIdentifierSchema),
    active: Type.Optional(Type.Boolean()),
    name: Type.Array(FhirHumanNameSchema),
    telecom: Type.Optional(Type.Array(FhirContactPointSchema)),
    gender: Type.Enum({ male: "male", female: "female", other: "other", unknown: "unknown" }),
    birthDate: Type.Optional(FhirDateSchema),
    deceasedBoolean: Type.Optional(Type.Boolean()),
    deceasedDateTime: Type.Optional(FhirDateTimeSchema),
    address: Type.Optional(Type.Array(FhirAddressSchema)),
    managingOrganization: Type.Optional(FhirReferenceSchema),
  },
  { additionalProperties: true, description: "US Core Patient Profile (R4)" },
);

export type FhirPatient = Static<typeof FhirPatientSchema>;

// ── US Core Observation Profile ───────────────────────────────────────────────

export const FhirObservationSchema = Type.Object(
  {
    resourceType: Type.Literal("Observation"),
    id: Type.Optional(FhirIdSchema),
    meta: Type.Optional(
      Type.Object({
        versionId: Type.Optional(Type.String()),
        lastUpdated: Type.Optional(FhirInstantSchema),
        profile: Type.Optional(Type.Array(FhirUriSchema)),
      }),
    ),
    status: Type.Enum({
      registered: "registered",
      preliminary: "preliminary",
      final: "final",
      amended: "amended",
      corrected: "corrected",
      cancelled: "cancelled",
      "entered-in-error": "entered-in-error",
      unknown: "unknown",
    }),
    category: Type.Optional(Type.Array(FhirCodeableConceptSchema)),
    code: FhirCodeableConceptSchema,
    subject: FhirReferenceSchema,
    effectiveDateTime: Type.Optional(FhirDateTimeSchema),
    effectivePeriod: Type.Optional(
      Type.Object({
        start: Type.Optional(FhirDateTimeSchema),
        end: Type.Optional(FhirDateTimeSchema),
      }),
    ),
    issued: Type.Optional(FhirInstantSchema),
    performer: Type.Optional(Type.Array(FhirReferenceSchema)),
    valueQuantity: Type.Optional(FhirQuantitySchema),
    valueCodeableConcept: Type.Optional(FhirCodeableConceptSchema),
    valueString: Type.Optional(Type.String()),
    valueBoolean: Type.Optional(Type.Boolean()),
    valueInteger: Type.Optional(Type.Integer()),
    interpretation: Type.Optional(Type.Array(FhirCodeableConceptSchema)),
    note: Type.Optional(Type.Array(Type.Object({ text: Type.String() }))),
    component: Type.Optional(
      Type.Array(
        Type.Object({
          code: FhirCodeableConceptSchema,
          valueQuantity: Type.Optional(FhirQuantitySchema),
          valueCodeableConcept: Type.Optional(FhirCodeableConceptSchema),
          valueString: Type.Optional(Type.String()),
        }),
      ),
    ),
  },
  { additionalProperties: true, description: "US Core Observation Profile (R4)" },
);

export type FhirObservation = Static<typeof FhirObservationSchema>;

// ── FHIR Bundle (for search results) ──────────────────────────────────────────

export const FhirBundleEntrySchema = Type.Object({
  fullUrl: Type.Optional(FhirUriSchema),
  resource: Type.Optional(Type.Union([FhirPatientSchema, FhirObservationSchema])),
  search: Type.Optional(
    Type.Object({
      mode: Type.Optional(Type.Enum({ match: "match", include: "include", outcome: "outcome" })),
      score: Type.Optional(Type.Number()),
    }),
  ),
});

export const FhirBundleSchema = Type.Object(
  {
    resourceType: Type.Literal("Bundle"),
    id: Type.Optional(FhirIdSchema),
    meta: Type.Optional(
      Type.Object({
        versionId: Type.Optional(Type.String()),
        lastUpdated: Type.Optional(FhirInstantSchema),
      }),
    ),
    type: Type.Enum({
      document: "document",
      message: "message",
      transaction: "transaction",
      "transaction-response": "transaction-response",
      batch: "batch",
      "batch-response": "batch-response",
      history: "history",
      searchset: "searchset",
      collection: "collection",
    }),
    total: Type.Optional(Type.Integer()),
    link: Type.Optional(
      Type.Array(
        Type.Object({
          relation: Type.String(),
          url: FhirUriSchema,
        }),
      ),
    ),
    entry: Type.Optional(Type.Array(FhirBundleEntrySchema)),
  },
  { additionalProperties: false, description: "FHIR Bundle Resource (R4)" },
);

export type FhirBundle = Static<typeof FhirBundleSchema>;

// ── Search Parameter Schemas ─────────────────────────────────────────────────

export const PatientSearchQuerySchema = Type.Object(
  {
    _id: Type.Optional(Type.String()),
    identifier: Type.Optional(Type.String()),
    given: Type.Optional(Type.String()),
    family: Type.Optional(Type.String()),
    name: Type.Optional(Type.String()),
    gender: Type.Optional(
      Type.Enum({ male: "male", female: "female", other: "other", unknown: "unknown" }),
    ),
    birthdate: Type.Optional(Type.String()),
    _count: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
    _page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  },
  { additionalProperties: false },
);

export type PatientSearchQuery = Static<typeof PatientSearchQuerySchema>;

export const ObservationSearchQuerySchema = Type.Object(
  {
    _id: Type.Optional(Type.String()),
    patient: Type.Optional(Type.String()),
    subject: Type.Optional(Type.String()),
    code: Type.Optional(Type.String()),
    category: Type.Optional(Type.String()),
    date: Type.Optional(Type.String()),
    "date-gt": Type.Optional(Type.String()),
    "date-lt": Type.Optional(Type.String()),
    "date-ge": Type.Optional(Type.String()),
    "date-le": Type.Optional(Type.String()),
    _count: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 20 })),
    _page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  },
  { additionalProperties: false },
);

export type ObservationSearchQuery = Static<typeof ObservationSearchQuerySchema>;

// ── SMART on FHIR Scope Schemas ───────────────────────────────────────────────

export const SmartScopeSchema = Type.Object({
  scopeType: Type.Enum({ patient: "patient", user: "user", system: "system" }),
  resource: Type.String(),
  action: Type.Enum({ read: "read", write: "write", "*": "*" }),
});

export type SmartScope = Static<typeof SmartScopeSchema>;

// ── OperationOutcome (for errors) ─────────────────────────────────────────────

export const OperationOutcomeIssueSchema = Type.Object({
  severity: Type.Enum({
    fatal: "fatal",
    error: "error",
    warning: "warning",
    information: "information",
  }),
  code: Type.String(),
  diagnostics: Type.Optional(Type.String()),
  details: Type.Optional(FhirCodeableConceptSchema),
});

export const OperationOutcomeSchema = Type.Object(
  {
    resourceType: Type.Literal("OperationOutcome"),
    id: Type.Optional(FhirIdSchema),
    issue: Type.Array(OperationOutcomeIssueSchema),
  },
  { additionalProperties: false },
);

export type OperationOutcome = Static<typeof OperationOutcomeSchema>;
