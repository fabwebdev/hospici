import { date, integer, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { patients } from "./patients.table.js";

/**
 * care_plans — one row per patient; discipline_sections is a JSONB map
 * keyed by DisciplineType (RN | SW | CHAPLAIN | THERAPY | AIDE).
 *
 * Each discipline section is independently updatable via a JSONB merge PATCH
 * so that patching the RN section never overwrites the SW section.
 *
 * RLS: location_id enforced at row level — users only see their location's plans.
 * Discipline-level write gate is enforced in the service layer (role check).
 */
export const carePlans = pgTable("care_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id")
    .references(() => patients.id)
    .notNull(),
  locationId: uuid("location_id")
    .references(() => locations.id)
    .notNull(),
  /** JSONB map of DisciplineType → DisciplineSection */
  disciplineSections: jsonb("discipline_sections").notNull().default({}),
  /** Optimistic-lock version counter — incremented on every PATCH */
  version: integer("version").notNull().default(1),

  // ── Physician review compliance (42 CFR §418.56(b)) ───────────────────────
  // Promoted columns so BullMQ deadline jobs can query without touching JSONB.

  /** admissionDate + 2 calendar days; null until admissionDate is set */
  initialReviewDeadline: date("initial_review_deadline"),
  /** Timestamp when the attending/medical-director completed the 2-day initial review */
  initialReviewCompletedAt: timestamp("initial_review_completed_at", { withTimezone: true }),
  /** userId of the physician who completed the initial review */
  initialReviewedBy: uuid("initial_reviewed_by"),
  /** Timestamp of the most recent review (initial or 14-day ongoing) */
  lastReviewAt: timestamp("last_review_at", { withTimezone: true }),
  /** lastReviewAt + 14 calendar days — deadline for the next required review */
  nextReviewDue: date("next_review_due"),
  /** Full sign-off audit trail — JSONB (PhysicianReviewEntry[]) */
  reviewHistory: jsonb("review_history").notNull().default([]),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
