/**
 * Medication schemas — TypeBox definitions for the full medication management module.
 *
 * Covers:
 *   - Active medication list (scheduled + PRN)
 *   - Comfort-kit classification
 *   - Controlled substance tracking (DEA schedule)
 *   - Medicare/hospice billing classification
 *   - Pharmacy coordination fields
 *   - Caregiver teaching documentation
 *   - Medication reconciliation
 *   - Physician order linkage (nullable FK — T3-9)
 *   - MAR (medication administration record) with effectiveness + adverse-effect monitoring
 *   - Patient allergy tracking
 *   - OpenFDA drug interaction warning shape
 *
 * Schema-first: TypeBox → Drizzle table → migration → typebox-compiler.ts
 * No TypeCompiler.Compile() calls here — all in typebox-compiler.ts.
 */

import { type Static, Type } from "@sinclair/typebox";

// ── Medication enums ───────────────────────────────────────────────────────────

export const MedicationStatusSchema = Type.Union([
  Type.Literal("ACTIVE"),
  Type.Literal("DISCONTINUED"),
  Type.Literal("ON_HOLD"),
]);
export type MedicationStatus = Static<typeof MedicationStatusSchema>;

export const FrequencyTypeSchema = Type.Union([
  Type.Literal("SCHEDULED"),
  Type.Literal("PRN"), // as-needed
]);
export type FrequencyType = Static<typeof FrequencyTypeSchema>;

/** DEA controlled substance schedules I–V */
export const DEAScheduleSchema = Type.Union([
  Type.Literal("I"),
  Type.Literal("II"),
  Type.Literal("III"),
  Type.Literal("IV"),
  Type.Literal("V"),
]);
export type DEASchedule = Static<typeof DEAScheduleSchema>;

/**
 * Hospice Medicare billing classification.
 * PART_A_RELATED  — directly related to terminal diagnosis; covered under Medicare Part A hospice benefit.
 * PART_D          — unrelated to terminal diagnosis; patient uses Part D standalone plan.
 * NOT_COVERED     — neither Part A nor Part D covers this medication.
 * OTC             — over-the-counter; not billed.
 */
export const MedicareCoverageTypeSchema = Type.Union([
  Type.Literal("PART_A_RELATED"),
  Type.Literal("PART_D"),
  Type.Literal("NOT_COVERED"),
  Type.Literal("OTC"),
]);
export type MedicareCoverageType = Static<typeof MedicareCoverageTypeSchema>;

// ── Core medication schema ─────────────────────────────────────────────────────

export const MedicationSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  patientId: Type.String({ format: "uuid" }),
  locationId: Type.String({ format: "uuid" }),
  // Drug identity
  name: Type.String({ minLength: 1, maxLength: 200 }),
  genericName: Type.Optional(Type.String({ maxLength: 200 })),
  brandName: Type.Optional(Type.String({ maxLength: 200 })),
  // Dosing
  dosage: Type.String({ maxLength: 100 }),
  route: Type.String({ maxLength: 100 }), // PO, IV, SQ, SL, topical…
  frequency: Type.String({ maxLength: 100 }), // "BID", "Q4H", "Q4H PRN pain ≥4"
  frequencyType: FrequencyTypeSchema,
  prnReason: Type.Optional(Type.String({ maxLength: 500 })),
  prnMaxDosesPerDay: Type.Optional(Type.Integer({ minimum: 1 })),
  // Hospice-specific
  isComfortKit: Type.Boolean(),
  indication: Type.String({ maxLength: 500 }),
  // Dates
  startDate: Type.String({ format: "date" }),
  endDate: Type.Optional(Type.String({ format: "date" })),
  // Prescriber
  prescriberId: Type.Optional(Type.String({ format: "uuid" })),
  // Physician order linkage (T3-9 physician order inbox)
  physicianOrderId: Type.Optional(Type.String({ format: "uuid" })),
  // Status + discontinuation
  status: MedicationStatusSchema,
  discontinuedReason: Type.Optional(Type.String({ maxLength: 500 })),
  discontinuedAt: Type.Optional(Type.String({ format: "date-time" })),
  discontinuedBy: Type.Optional(Type.String({ format: "uuid" })),
  // Controlled substance
  isControlledSubstance: Type.Boolean(),
  deaSchedule: Type.Optional(DEAScheduleSchema),
  // Billing classification
  medicareCoverageType: MedicareCoverageTypeSchema,
  // Pharmacy coordination
  pharmacyName: Type.Optional(Type.String({ maxLength: 200 })),
  pharmacyPhone: Type.Optional(Type.String({ maxLength: 20 })),
  pharmacyFax: Type.Optional(Type.String({ maxLength: 20 })),
  // Caregiver teaching
  patientInstructions: Type.Optional(Type.String({ maxLength: 2000 })),
  teachingCompleted: Type.Boolean(),
  teachingCompletedAt: Type.Optional(Type.String({ format: "date-time" })),
  teachingCompletedBy: Type.Optional(Type.String({ format: "uuid" })),
  // Medication reconciliation
  reconciledAt: Type.Optional(Type.String({ format: "date-time" })),
  reconciledBy: Type.Optional(Type.String({ format: "uuid" })),
  reconciliationNotes: Type.Optional(Type.String({ maxLength: 1000 })),
  createdAt: Type.String({ format: "date-time" }),
  updatedAt: Type.String({ format: "date-time" }),
});
export type MedicationRow = Static<typeof MedicationSchema>;

export const CreateMedicationBodySchema = Type.Object({
  name: Type.String({ minLength: 1, maxLength: 200 }),
  genericName: Type.Optional(Type.String({ maxLength: 200 })),
  brandName: Type.Optional(Type.String({ maxLength: 200 })),
  dosage: Type.String({ minLength: 1, maxLength: 100 }),
  route: Type.String({ minLength: 1, maxLength: 100 }),
  frequency: Type.String({ minLength: 1, maxLength: 100 }),
  frequencyType: FrequencyTypeSchema,
  prnReason: Type.Optional(Type.String({ maxLength: 500 })),
  prnMaxDosesPerDay: Type.Optional(Type.Integer({ minimum: 1 })),
  isComfortKit: Type.Optional(Type.Boolean()),
  indication: Type.String({ minLength: 1, maxLength: 500 }),
  startDate: Type.String({ format: "date" }),
  endDate: Type.Optional(Type.String({ format: "date" })),
  prescriberId: Type.Optional(Type.String({ format: "uuid" })),
  physicianOrderId: Type.Optional(Type.String({ format: "uuid" })),
  isControlledSubstance: Type.Optional(Type.Boolean()),
  deaSchedule: Type.Optional(DEAScheduleSchema),
  medicareCoverageType: MedicareCoverageTypeSchema,
  pharmacyName: Type.Optional(Type.String({ maxLength: 200 })),
  pharmacyPhone: Type.Optional(Type.String({ maxLength: 20 })),
  pharmacyFax: Type.Optional(Type.String({ maxLength: 20 })),
  patientInstructions: Type.Optional(Type.String({ maxLength: 2000 })),
});
export type CreateMedicationBody = Static<typeof CreateMedicationBodySchema>;

export const PatchMedicationBodySchema = Type.Partial(
  Type.Object({
    status: MedicationStatusSchema,
    discontinuedReason: Type.String({ maxLength: 500 }),
    endDate: Type.String({ format: "date" }),
    medicareCoverageType: MedicareCoverageTypeSchema,
    pharmacyName: Type.String({ maxLength: 200 }),
    pharmacyPhone: Type.String({ maxLength: 20 }),
    pharmacyFax: Type.String({ maxLength: 20 }),
    patientInstructions: Type.String({ maxLength: 2000 }),
    teachingCompleted: Type.Boolean(),
    reconciliationNotes: Type.String({ maxLength: 1000 }),
    reconciledAt: Type.String({ format: "date-time" }),
    physicianOrderId: Type.String({ format: "uuid" }),
  }),
);
export type PatchMedicationBody = Static<typeof PatchMedicationBodySchema>;

// ── Drug interaction warning (OpenFDA response) ────────────────────────────────

export const DrugInteractionWarningSchema = Type.Object({
  description: Type.String(),
  severity: Type.String(),
  interactingDrug: Type.String(),
});
export type DrugInteractionWarning = Static<typeof DrugInteractionWarningSchema>;

// ── Response schemas ───────────────────────────────────────────────────────────

export const MedicationResponseSchema = Type.Object({
  ...MedicationSchema.properties,
  interactionWarnings: Type.Optional(Type.Array(DrugInteractionWarningSchema)),
});
export type MedicationResponse = Static<typeof MedicationResponseSchema>;

export const MedicationListResponseSchema = Type.Object({
  medications: Type.Array(MedicationResponseSchema),
  total: Type.Integer(),
});
export type MedicationListResponse = Static<typeof MedicationListResponseSchema>;

// ── MAR (Medication Administration Record) ────────────────────────────────────

export const AdministrationTypeSchema = Type.Union([
  Type.Literal("GIVEN"),
  Type.Literal("OMITTED"),
  Type.Literal("REFUSED"),
]);
export type AdministrationType = Static<typeof AdministrationTypeSchema>;

export const MedicationAdministrationSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  medicationId: Type.String({ format: "uuid" }),
  patientId: Type.String({ format: "uuid" }),
  locationId: Type.String({ format: "uuid" }),
  administeredAt: Type.String({ format: "date-time" }),
  administeredBy: Type.String({ format: "uuid" }),
  administrationType: AdministrationTypeSchema,
  doseGiven: Type.Optional(Type.String({ maxLength: 100 })),
  routeGiven: Type.Optional(Type.String({ maxLength: 100 })),
  omissionReason: Type.Optional(Type.String({ maxLength: 500 })),
  /** Effectiveness on a 1–5 scale (1 = no relief, 5 = complete relief) */
  effectivenessRating: Type.Optional(Type.Integer({ minimum: 1, maximum: 5 })),
  adverseEffectNoted: Type.Boolean(),
  adverseEffectDescription: Type.Optional(Type.String({ maxLength: 1000 })),
  notes: Type.Optional(Type.String({ maxLength: 1000 })),
  createdAt: Type.String({ format: "date-time" }),
});
export type MedicationAdministration = Static<typeof MedicationAdministrationSchema>;

export const RecordAdministrationBodySchema = Type.Object({
  administeredAt: Type.String({ format: "date-time" }),
  administrationType: AdministrationTypeSchema,
  doseGiven: Type.Optional(Type.String({ maxLength: 100 })),
  routeGiven: Type.Optional(Type.String({ maxLength: 100 })),
  omissionReason: Type.Optional(Type.String({ maxLength: 500 })),
  effectivenessRating: Type.Optional(Type.Integer({ minimum: 1, maximum: 5 })),
  adverseEffectNoted: Type.Optional(Type.Boolean()),
  adverseEffectDescription: Type.Optional(Type.String({ maxLength: 1000 })),
  notes: Type.Optional(Type.String({ maxLength: 1000 })),
});
export type RecordAdministrationBody = Static<typeof RecordAdministrationBodySchema>;

export const AdministrationListResponseSchema = Type.Object({
  administrations: Type.Array(MedicationAdministrationSchema),
  total: Type.Integer(),
});
export type AdministrationListResponse = Static<typeof AdministrationListResponseSchema>;

// ── Patient allergies ──────────────────────────────────────────────────────────

export const AllergySeveritySchema = Type.Union([
  Type.Literal("MILD"),
  Type.Literal("MODERATE"),
  Type.Literal("SEVERE"),
  Type.Literal("LIFE_THREATENING"),
]);
export type AllergySeverity = Static<typeof AllergySeveritySchema>;

export const AllergenTypeSchema = Type.Union([
  Type.Literal("DRUG"),
  Type.Literal("FOOD"),
  Type.Literal("ENVIRONMENTAL"),
  Type.Literal("OTHER"),
]);
export type AllergenType = Static<typeof AllergenTypeSchema>;

export const PatientAllergySchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  patientId: Type.String({ format: "uuid" }),
  locationId: Type.String({ format: "uuid" }),
  allergen: Type.String({ minLength: 1, maxLength: 200 }),
  allergenType: AllergenTypeSchema,
  reaction: Type.String({ maxLength: 500 }),
  severity: AllergySeveritySchema,
  onsetDate: Type.Optional(Type.String({ format: "date" })),
  documentedBy: Type.String({ format: "uuid" }),
  documentedAt: Type.String({ format: "date-time" }),
  isActive: Type.Boolean(),
  createdAt: Type.String({ format: "date-time" }),
});
export type PatientAllergy = Static<typeof PatientAllergySchema>;

export const CreateAllergyBodySchema = Type.Object({
  allergen: Type.String({ minLength: 1, maxLength: 200 }),
  allergenType: AllergenTypeSchema,
  reaction: Type.String({ minLength: 1, maxLength: 500 }),
  severity: AllergySeveritySchema,
  onsetDate: Type.Optional(Type.String({ format: "date" })),
});
export type CreateAllergyBody = Static<typeof CreateAllergyBodySchema>;

export const PatchAllergyBodySchema = Type.Partial(
  Type.Object({
    isActive: Type.Boolean(),
    reaction: Type.String({ maxLength: 500 }),
    severity: AllergySeveritySchema,
  }),
);
export type PatchAllergyBody = Static<typeof PatchAllergyBodySchema>;

export const AllergyListResponseSchema = Type.Object({
  allergies: Type.Array(PatientAllergySchema),
  total: Type.Integer(),
});
export type AllergyListResponse = Static<typeof AllergyListResponseSchema>;

// ── DoseSpot SSO ───────────────────────────────────────────────────────────────

export const DoseSpotSsoResponseSchema = Type.Object({
  ssoUrl: Type.String({ format: "uri" }),
  expiresAt: Type.String({ format: "date-time" }),
});
export type DoseSpotSsoResponse = Static<typeof DoseSpotSsoResponseSchema>;
