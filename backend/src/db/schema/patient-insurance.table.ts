/**
 * Drizzle table definition — patient_insurance
 *
 * Stores insurance / coverage records for hospice patients.
 * Supports multiple plans (primary Medicare Part A, secondary Medicaid, etc.).
 * subscriberId stores the Medicare Beneficiary Identifier (MBI) or plan-specific ID.
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

export const insuranceCoverageTypeEnum = pgEnum("insurance_coverage_type", [
  "MEDICARE_PART_A",
  "MEDICARE_ADVANTAGE",
  "MEDICAID",
  "MEDICAID_WAIVER",
  "PRIVATE",
  "VA",
  "OTHER",
]);

export const subscriberRelationshipEnum = pgEnum("subscriber_relationship", [
  "SELF",
  "SPOUSE",
  "CHILD",
  "OTHER",
]);

export const patientInsurance = pgTable(
  "patient_insurance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    coverageType: insuranceCoverageTypeEnum("coverage_type").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    payerName: text("payer_name").notNull(),
    payerId: varchar("payer_id", { length: 50 }),
    planName: text("plan_name"),
    policyNumber: varchar("policy_number", { length: 50 }),
    groupNumber: varchar("group_number", { length: 50 }),
    subscriberId: varchar("subscriber_id", { length: 50 }).notNull(),
    subscriberFirstName: varchar("subscriber_first_name", { length: 100 }),
    subscriberLastName: varchar("subscriber_last_name", { length: 100 }),
    subscriberDob: date("subscriber_dob"),
    relationshipToPatient: subscriberRelationshipEnum("relationship_to_patient").notNull(),
    effectiveDate: date("effective_date"),
    terminationDate: date("termination_date"),
    priorAuthNumber: varchar("prior_auth_number", { length: 50 }),
    isActive: boolean("is_active").notNull().default(true),
    documentedBy: uuid("documented_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_patient_insurance_patient_active").on(t.patientId, t.isActive),
    index("idx_patient_insurance_primary").on(t.patientId, t.isPrimary),
    index("idx_patient_insurance_coverage_type").on(t.patientId, t.coverageType),
  ],
);
