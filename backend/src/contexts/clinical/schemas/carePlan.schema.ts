// contexts/clinical/schemas/carePlan.schema.ts
// Unified interdisciplinary care plan with SMART goals per discipline section.

import { type Static, Type } from "@sinclair/typebox";

// ── Discipline enum ───────────────────────────────────────────────────────────

export const DisciplineTypeSchema = Type.Enum(
  {
    RN: "RN",
    SW: "SW",
    CHAPLAIN: "CHAPLAIN",
    THERAPY: "THERAPY",
    AIDE: "AIDE",
    VOLUNTEER: "VOLUNTEER",
    BEREAVEMENT: "BEREAVEMENT",
    PHYSICIAN: "PHYSICIAN",
  },
  { description: "Hospice discipline type (42 CFR §418.56 IDG disciplines)" },
);

export type DisciplineType = Static<typeof DisciplineTypeSchema>;

// ── SMART Goal ────────────────────────────────────────────────────────────────

export const SmartGoalStatusSchema = Type.Enum(
  {
    active: "active",
    met: "met",
    revised: "revised",
  },
  { description: "SMART goal status" },
);

export const SmartGoalSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    goal: Type.String({ minLength: 1, description: "Overall goal statement" }),
    specific: Type.String({ minLength: 1, description: "S — specific outcome" }),
    measurable: Type.String({ minLength: 1, description: "M — measurable criteria" }),
    achievable: Type.String({ minLength: 1, description: "A — achievable plan" }),
    relevant: Type.String({ minLength: 1, description: "R — relevant to patient needs" }),
    timeBound: Type.String({ minLength: 1, description: "T — time-bound commitment" }),
    targetDate: Type.String({ format: "date", description: "Target completion date" }),
    status: SmartGoalStatusSchema,
  },
  { additionalProperties: false },
);

export type SmartGoal = Static<typeof SmartGoalSchema>;

// ── Discipline section ────────────────────────────────────────────────────────

export const DisciplineSectionSchema = Type.Object(
  {
    notes: Type.String({ description: "Free-text clinical notes for this discipline" }),
    goals: Type.Array(SmartGoalSchema, { description: "SMART goals for this discipline" }),
    lastUpdatedBy: Type.String({ format: "uuid" }),
    lastUpdatedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

export type DisciplineSection = Static<typeof DisciplineSectionSchema>;

// ── JSONB envelope keyed by discipline ───────────────────────────────────────
// Each discipline section is optional — only disciplines that have documented
// content will have a key. Other disciplines' sections are never touched on PATCH.

export const DisciplineSectionsSchema = Type.Object(
  {
    RN: Type.Optional(DisciplineSectionSchema),
    SW: Type.Optional(DisciplineSectionSchema),
    CHAPLAIN: Type.Optional(DisciplineSectionSchema),
    THERAPY: Type.Optional(DisciplineSectionSchema),
    AIDE: Type.Optional(DisciplineSectionSchema),
    VOLUNTEER: Type.Optional(DisciplineSectionSchema),
    BEREAVEMENT: Type.Optional(DisciplineSectionSchema),
    PHYSICIAN: Type.Optional(DisciplineSectionSchema),
  },
  {
    additionalProperties: false,
    description: "Map of discipline → section (each discipline owns its own section)",
  },
);

export type DisciplineSections = Static<typeof DisciplineSectionsSchema>;

// ── Physician review compliance tracking ─────────────────────────────────────
// 42 CFR §418.56(b): attending physician + medical director/designee must review
// the initial plan within 2 calendar days of admission. The medical director/
// designee + full IDG must then review and revise at least every 14 days.
//
// These deadlines are enforced via promoted columns (queryable by BullMQ jobs)
// and surfaced in the response as `physicianReview`.

export const PhysicianReviewEntrySchema = Type.Object(
  {
    reviewedBy: Type.String({ format: "uuid", description: "Physician userId" }),
    reviewedAt: Type.String({ format: "date-time" }),
    type: Type.Enum({ initial: "initial", ongoing: "ongoing" }),
    signatureNote: Type.String({
      minLength: 1,
      description: "Physician attestation, e.g. 'I have reviewed and approve this plan of care'",
    }),
  },
  { additionalProperties: false },
);

export type PhysicianReviewEntry = Static<typeof PhysicianReviewEntrySchema>;

export const PhysicianReviewSchema = Type.Object(
  {
    /** Admission date + 2 calendar days — null if admissionDate not yet set */
    initialReviewDeadline: Type.Union([Type.String({ format: "date" }), Type.Null()]),
    /** When the initial 2-day review was completed */
    initialReviewCompletedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    /** Which physician completed the initial review */
    initialReviewedBy: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    /** Most recent review date (initial or ongoing) */
    lastReviewAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    /** lastReviewAt + 14 calendar days — deadline for next required review */
    nextReviewDue: Type.Union([Type.String({ format: "date" }), Type.Null()]),
    /** Full audit trail of every physician sign-off */
    reviewHistory: Type.Array(PhysicianReviewEntrySchema),
    /** True if initial 2-day deadline has passed without sign-off */
    isInitialReviewOverdue: Type.Boolean(),
    /** True if 14-day ongoing review is overdue */
    isOngoingReviewOverdue: Type.Boolean(),
  },
  { additionalProperties: false },
);

export type PhysicianReview = Static<typeof PhysicianReviewSchema>;

// ── POST /patients/:id/care-plan/physician-review — sign-off body ─────────────

export const PhysicianReviewBodySchema = Type.Object(
  {
    type: Type.Enum({ initial: "initial", ongoing: "ongoing" }),
    signatureNote: Type.String({
      minLength: 10,
      description: "Physician attestation statement (minimum 10 characters)",
    }),
  },
  { additionalProperties: false },
);

export type PhysicianReviewBody = Static<typeof PhysicianReviewBodySchema>;

// ── POST /patients/:id/care-plan — create ────────────────────────────────────

export const CreateCarePlanBodySchema = Type.Object(
  {
    notes: Type.Optional(
      Type.String({ description: "Initial notes (discipline inferred from user role)" }),
    ),
    goals: Type.Optional(Type.Array(SmartGoalSchema)),
  },
  { additionalProperties: false },
);

export type CreateCarePlanBody = Static<typeof CreateCarePlanBodySchema>;

// ── PATCH /patients/:id/care-plan/:discipline — partial update ────────────────

export const PatchCarePlanBodySchema = Type.Object(
  {
    notes: Type.Optional(Type.String()),
    goals: Type.Optional(Type.Array(SmartGoalSchema)),
  },
  {
    additionalProperties: false,
    description: "Partial update for one discipline section. Does not touch other disciplines.",
  },
);

export type PatchCarePlanBody = Static<typeof PatchCarePlanBodySchema>;

// ── Response ─────────────────────────────────────────────────────────────────

export const CarePlanResponseSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    patientId: Type.String({ format: "uuid" }),
    locationId: Type.String({ format: "uuid" }),
    disciplineSections: DisciplineSectionsSchema,
    physicianReview: PhysicianReviewSchema,
    version: Type.Integer({ minimum: 1 }),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

export type CarePlanResponse = Static<typeof CarePlanResponseSchema>;
