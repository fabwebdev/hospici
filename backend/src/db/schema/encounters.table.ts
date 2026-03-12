/**
 * encounters — one row per patient visit (T2-7 VantageChart).
 * VantageChart narrative fields are co-located here for CMS audit traceability.
 * Note-review columns (review_status, reviewer_id, etc.) are added in T2-9.
 */

import { relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { patients } from "./patients.table.js";
import { users } from "./users.table.js";

export const visitTypeEnum = pgEnum("visit_type", [
  "routine_rn",
  "admission",
  "recertification",
  "supervisory",
  "prn",
  "discharge",
]);

export const encounterStatusEnum = pgEnum("encounter_status", [
  "DRAFT",
  "COMPLETED",
  "SIGNED",
]);

export const vantageChartMethodEnum = pgEnum("vantage_chart_method", [
  "TEMPLATE",
  "LLM",
]);

export const encounters = pgTable(
  "encounters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    clinicianId: uuid("clinician_id")
      .notNull()
      .references(() => users.id),

    visitType: visitTypeEnum("visit_type").notNull(),
    status: encounterStatusEnum("status").notNull().default("DRAFT"),

    /** Full VantageChartInput captured via 9-step form */
    data: jsonb("data"),

    /** Layer 1 or Layer 2 generated draft text */
    vantageChartDraft: text("vantage_chart_draft"),
    /** Which layer produced the accepted note */
    vantageChartMethod: vantageChartMethodEnum("vantage_chart_method"),
    /** Timestamp when clinician accepted the note */
    vantageChartAcceptedAt: timestamp("vantage_chart_accepted_at", {
      withTimezone: true,
    }),
    /** CMS audit: maps each sentence → fragment ID + input snapshot */
    vantageChartTraceability: jsonb("vantage_chart_traceability"),

    visitedAt: timestamp("visited_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("idx_encounters_patient_id").on(t.patientId),
    index("idx_encounters_location_id").on(t.locationId),
    index("idx_encounters_clinician_id").on(t.clinicianId),
    index("idx_encounters_visited_at").on(t.visitedAt),
    index("idx_encounters_status").on(t.status),
  ],
);

export const encountersRelations = relations(encounters, ({ one }) => ({
  patient: one(patients, {
    fields: [encounters.patientId],
    references: [patients.id],
  }),
  location: one(locations, {
    fields: [encounters.locationId],
    references: [locations.id],
  }),
  clinician: one(users, {
    fields: [encounters.clinicianId],
    references: [users.id],
  }),
}));

export type EncounterInsert = typeof encounters.$inferInsert;
export type EncounterSelect = typeof encounters.$inferSelect;
