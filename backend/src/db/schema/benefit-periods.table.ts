// db/schema/benefit-periods.table.ts
// T3-4: Benefit Period Control System — full rewrite of stub table

import {
  boolean,
  date,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { noticesOfElection } from "./noe.table.js";
import { patients } from "./patients.table.js";
import { users } from "./users.table.js";

export const benefitPeriodStatusEnum = pgEnum("benefit_period_status", [
  "current",
  "upcoming",
  "recert_due",
  "at_risk",
  "past_due",
  "closed",
  "revoked",
  "transferred_out",
  "concurrent_care",
  "discharged",
]);

export const benefitPeriodRecertStatusEnum = pgEnum("benefit_period_recert_status", [
  "not_yet_due",
  "ready_for_recert",
  "pending_physician",
  "completed",
  "missed",
]);

export const benefitPeriodF2FStatusEnum = pgEnum("benefit_period_f2f_status", [
  "not_required",
  "not_yet_due",
  "due_soon",
  "documented",
  "invalid",
  "missing",
  "recert_blocked",
]);

export const benefitPeriodAdmissionTypeEnum = pgEnum("benefit_period_admission_type", [
  "new_admission",
  "hospice_to_hospice_transfer",
  "revocation_readmission",
]);

export const benefitPeriods = pgTable("benefit_periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id")
    .references(() => patients.id, { onDelete: "cascade" })
    .notNull(),
  locationId: uuid("location_id")
    .references(() => locations.id, { onDelete: "cascade" })
    .notNull(),
  periodNumber: integer("period_number").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  // period_length_days is GENERATED ALWAYS AS (end_date - start_date) STORED
  // — not included in insert type; read via $inferSelect only
  status: benefitPeriodStatusEnum("status").notNull().default("upcoming"),
  admissionType: benefitPeriodAdmissionTypeEnum("admission_type").default("new_admission"),
  isTransferDerived: boolean("is_transfer_derived").notNull().default(false),
  sourceAdmissionId: uuid("source_admission_id"),
  isReportingPeriod: boolean("is_reporting_period").notNull().default(false),
  recertDueDate: date("recert_due_date"),
  recertStatus: benefitPeriodRecertStatusEnum("recert_status").notNull().default("not_yet_due"),
  recertCompletedAt: timestamp("recert_completed_at", { withTimezone: true }),
  recertPhysicianId: uuid("recert_physician_id").references(() => users.id),
  f2fRequired: boolean("f2f_required").notNull().default(false),
  f2fStatus: benefitPeriodF2FStatusEnum("f2f_status").notNull().default("not_required"),
  f2fDocumentedAt: date("f2f_documented_at"),
  f2fProviderId: uuid("f2f_provider_id").references(() => users.id),
  f2fWindowStart: date("f2f_window_start"),
  f2fWindowEnd: date("f2f_window_end"),
  billingRisk: boolean("billing_risk").notNull().default(false),
  billingRiskReason: text("billing_risk_reason"),
  noeId: uuid("noe_id").references(() => noticesOfElection.id),
  concurrentCareStart: date("concurrent_care_start"),
  concurrentCareEnd: date("concurrent_care_end"),
  revocationDate: date("revocation_date"),
  correctionHistory: jsonb("correction_history").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type BenefitPeriodRow = typeof benefitPeriods.$inferSelect;
export type BenefitPeriodInsert = typeof benefitPeriods.$inferInsert;
