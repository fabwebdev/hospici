/**
 * Drizzle table definition — medication_administrations (MAR)
 *
 * Each row records a single administration event for a scheduled or PRN medication.
 * Includes effectiveness monitoring and adverse-effect tracking.
 *
 * RLS: location_id column — policies in migration 0010.
 */

import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { medications } from "./medications.table.js";
import { patients } from "./patients.table.js";
import { users } from "./users.table.js";

export const administrationTypeEnum = pgEnum("medication_administration_type", [
  "GIVEN",
  "OMITTED",
  "REFUSED",
]);

export const medicationAdministrations = pgTable(
  "medication_administrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    medicationId: uuid("medication_id")
      .notNull()
      .references(() => medications.id),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    administeredAt: timestamp("administered_at", { withTimezone: true }).notNull(),
    administeredBy: uuid("administered_by")
      .notNull()
      .references(() => users.id),
    administrationType: administrationTypeEnum("administration_type").notNull(),
    doseGiven: text("dose_given"),
    routeGiven: text("route_given"),
    omissionReason: text("omission_reason"),
    /** 1 = no relief / effect, 5 = complete relief / expected effect */
    effectivenessRating: integer("effectiveness_rating"),
    adverseEffectNoted: boolean("adverse_effect_noted").notNull().default(false),
    adverseEffectDescription: text("adverse_effect_description"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_med_admin_medication").on(t.medicationId, t.administeredAt),
    index("idx_med_admin_patient").on(t.patientId, t.administeredAt),
  ],
);
