/**
 * Drizzle table definition — medications
 *
 * Stores the active medication list for each patient.
 * Promoted columns allow BullMQ jobs and compliance queries to filter without JSONB parsing.
 *
 * RLS: location_id column — policies in migration 0010.
 */

import { boolean, date, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { patients } from "./patients.table.js";
import { users } from "./users.table.js";

export const medicationStatusEnum = pgEnum("medication_status", [
  "ACTIVE",
  "DISCONTINUED",
  "ON_HOLD",
]);

export const frequencyTypeEnum = pgEnum("medication_frequency_type", ["SCHEDULED", "PRN"]);

export const deaScheduleEnum = pgEnum("dea_schedule", ["I", "II", "III", "IV", "V"]);

export const medicareCoverageTypeEnum = pgEnum("medicare_coverage_type", [
  "PART_A_RELATED",
  "PART_D",
  "NOT_COVERED",
  "OTC",
]);

export const medications = pgTable(
  "medications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    // Drug identity
    name: text("name").notNull(),
    genericName: text("generic_name"),
    brandName: text("brand_name"),
    // Dosing
    dosage: text("dosage").notNull(),
    route: text("route").notNull(),
    frequency: text("frequency").notNull(),
    frequencyType: frequencyTypeEnum("frequency_type").notNull().default("SCHEDULED"),
    prnReason: text("prn_reason"),
    prnMaxDosesPerDay: text("prn_max_doses_per_day"), // stored as text; parsed as int in service
    // Hospice-specific
    isComfortKit: boolean("is_comfort_kit").notNull().default(false),
    indication: text("indication").notNull(),
    // Dates
    startDate: date("start_date").notNull(),
    endDate: date("end_date"),
    // Prescriber + physician order linkage
    prescriberId: uuid("prescriber_id").references(() => users.id),
    physicianOrderId: uuid("physician_order_id"), // FK wired in T3-9
    // Status + discontinuation
    status: medicationStatusEnum("status").notNull().default("ACTIVE"),
    discontinuedReason: text("discontinued_reason"),
    discontinuedAt: timestamp("discontinued_at", { withTimezone: true }),
    discontinuedBy: uuid("discontinued_by").references(() => users.id),
    // Controlled substance tracking
    isControlledSubstance: boolean("is_controlled_substance").notNull().default(false),
    deaSchedule: deaScheduleEnum("dea_schedule"),
    // Billing classification
    medicareCoverageType: medicareCoverageTypeEnum("medicare_coverage_type")
      .notNull()
      .default("PART_A_RELATED"),
    // Pharmacy coordination
    pharmacyName: text("pharmacy_name"),
    pharmacyPhone: text("pharmacy_phone"),
    pharmacyFax: text("pharmacy_fax"),
    // Caregiver teaching
    patientInstructions: text("patient_instructions"),
    teachingCompleted: boolean("teaching_completed").notNull().default(false),
    teachingCompletedAt: timestamp("teaching_completed_at", { withTimezone: true }),
    teachingCompletedBy: uuid("teaching_completed_by").references(() => users.id),
    // Medication reconciliation
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    reconciledBy: uuid("reconciled_by").references(() => users.id),
    reconciliationNotes: text("reconciliation_notes"),
    // Audit timestamps
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_medications_patient_status").on(t.patientId, t.status),
    index("idx_medications_comfort_kit").on(t.patientId, t.isComfortKit),
    index("idx_medications_controlled").on(t.patientId, t.isControlledSubstance),
  ],
);
