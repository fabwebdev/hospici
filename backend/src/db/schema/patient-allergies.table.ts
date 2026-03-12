/**
 * Drizzle table definition — patient_allergies
 *
 * Stores drug, food, and environmental allergies.
 * Checked by the medication service against OpenFDA drug interaction results.
 *
 * RLS: location_id column — policies in migration 0010.
 */

import { boolean, date, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { patients } from "./patients.table.js";
import { users } from "./users.table.js";

export const allergySeverityEnum = pgEnum("allergy_severity", [
  "MILD",
  "MODERATE",
  "SEVERE",
  "LIFE_THREATENING",
]);

export const allergenTypeEnum = pgEnum("allergen_type", ["DRUG", "FOOD", "ENVIRONMENTAL", "OTHER"]);

export const patientAllergies = pgTable(
  "patient_allergies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    allergen: text("allergen").notNull(),
    allergenType: allergenTypeEnum("allergen_type").notNull(),
    reaction: text("reaction").notNull(),
    severity: allergySeverityEnum("severity").notNull(),
    onsetDate: date("onset_date"),
    documentedBy: uuid("documented_by")
      .notNull()
      .references(() => users.id),
    documentedAt: timestamp("documented_at", { withTimezone: true }).notNull().defaultNow(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_patient_allergies_patient_active").on(t.patientId, t.isActive),
    index("idx_patient_allergies_drug").on(t.patientId, t.allergenType),
  ],
);
