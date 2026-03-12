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
