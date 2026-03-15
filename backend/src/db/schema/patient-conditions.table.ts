/**
 * Drizzle table definition — patient_conditions
 *
 * Stores ICD-10 diagnoses for hospice patients.
 * isTerminal flags the qualifying terminal diagnosis (42 CFR §418.22).
 * isRelated flags CMS-required related conditions included on claims.
 *
 * RLS: location_id column — policies in migration 0033.
 */

import {
  boolean,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { patients } from "./patients.table.js";
import { users } from "./users.table.js";

export const conditionClinicalStatusEnum = pgEnum("condition_clinical_status", [
  "ACTIVE",
  "RESOLVED",
  "REMISSION",
]);

export const conditionSeverityEnum = pgEnum("condition_severity", ["MILD", "MODERATE", "SEVERE"]);

export const patientConditions = pgTable(
  "patient_conditions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    icd10Code: varchar("icd10_code", { length: 20 }).notNull(),
    description: text("description").notNull(),
    isTerminal: boolean("is_terminal").notNull().default(false),
    isRelated: boolean("is_related").notNull().default(false),
    clinicalStatus: conditionClinicalStatusEnum("clinical_status").notNull().default("ACTIVE"),
    severity: conditionSeverityEnum("severity"),
    onsetDate: date("onset_date"),
    confirmedDate: date("confirmed_date"),
    isActive: boolean("is_active").notNull().default(true),
    documentedBy: uuid("documented_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_patient_conditions_patient_active").on(t.patientId, t.isActive),
    index("idx_patient_conditions_terminal").on(t.patientId, t.isTerminal),
    index("idx_patient_conditions_icd10").on(t.patientId, t.icd10Code),
  ],
);
