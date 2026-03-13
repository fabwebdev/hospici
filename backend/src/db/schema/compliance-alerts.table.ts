import { date, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { patients } from "./patients.table.js";
import { users } from "./users.table.js";

export const alertTypeEnum = pgEnum("alert_type_enum", [
  "NOE_DEADLINE",
  "NOTR_DEADLINE",
  "IDG_OVERDUE",
  "AIDE_SUPERVISION_OVERDUE",
  "AIDE_SUPERVISION_UPCOMING",
  "HOPE_WINDOW_CLOSING",
  "F2F_REQUIRED",
  "CAP_THRESHOLD",
  "BENEFIT_PERIOD_EXPIRING",
  "RECERTIFICATION_DUE",
  // T2-9 note review alert types
  "NOTE_REVIEW_REQUIRED",
  "NOTE_INCOMPLETE",
  "NOTE_OVERDUE_REVIEW",
  // T2-10 visit scheduling alert types
  "MISSED_VISIT",
  "VISIT_FREQUENCY_VARIANCE",
  // T3-2a NOE/NOTR filing workbench
  "NOE_LATE",
  "NOTR_LATE",
  // T3-2b F2F Validity Engine
  "F2F_MISSING",
  "F2F_INVALID",
  // T3-3 Cap Intelligence Module
  "CAP_THRESHOLD_70",
  "CAP_THRESHOLD_80",
  "CAP_THRESHOLD_90",
  "CAP_PROJECTED_OVERAGE",
  // T3-4 Benefit Period Control System
  "RECERT_DUE",
  "RECERT_AT_RISK",
  "RECERT_PAST_DUE",
  "F2F_DUE_SOON",
  "BENEFIT_PERIOD_BILLING_RISK",
  // T3-7b ERA 835 Remittance Reconciliation
  "UNMATCHED_ERA",
  // T3-12 Claim Audit Rules Engine + Bill-Hold Dashboard
  "CLAIM_VALIDATION_ERROR",
  "CLAIM_REJECTION_STATUS",
  "BILL_HOLD_COMPLIANCE_BLOCK",
  "BILL_HOLD_MISSING_DOC",
  "BILL_HOLD_MANUAL_REVIEW",
  // T3-8 Vendor Governance + BAA Registry
  "BAA_EXPIRING",
  "BAA_MISSING",
  "SECURITY_REVIEW_OVERDUE",
  // T3-9 Physician Order Inbox
  "ORDER_EXPIRY",
]);

export const alertSeverityEnum = pgEnum("alert_severity_enum", ["critical", "warning", "info"]);
export const alertStatusEnum = pgEnum("alert_status_enum", [
  "new",
  "acknowledged",
  "assigned",
  "resolved",
]);

export const complianceAlerts = pgTable("compliance_alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id")
    .references(() => locations.id, { onDelete: "cascade" })
    .notNull(),
  patientId: uuid("patient_id")
    .references(() => patients.id, { onDelete: "cascade" })
    .notNull(),
  type: alertTypeEnum("type").notNull(),
  severity: alertSeverityEnum("severity").notNull(),
  patientName: text("patient_name").notNull(), // PHI — encrypted
  dueDate: date("due_date"),
  daysRemaining: integer("days_remaining").notNull().default(0),
  description: text("description").notNull(),
  rootCause: text("root_cause").notNull(),
  nextAction: text("next_action").notNull(),
  status: alertStatusEnum("status").notNull().default("new"),
  assignedTo: uuid("assigned_to").references(() => users.id, { onDelete: "set null" }),
  snoozedUntil: date("snoozed_until"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
