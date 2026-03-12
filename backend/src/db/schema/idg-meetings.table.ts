import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { patients } from "./patients.table.js";

export const idgMeetings = pgTable("idg_meetings", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id")
    .references(() => patients.id)
    .notNull(),
  locationId: uuid("location_id")
    .references(() => locations.id)
    .notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: varchar("status", { length: 50 }).notNull().default("scheduled"),
  attendees: jsonb("attendees").notNull().default([]),
  rnPresent: boolean("rn_present").default(false),
  mdPresent: boolean("md_present").default(false),
  swPresent: boolean("sw_present").default(false),
  daysSinceLastIdg: integer("days_since_last_idg"),
  isCompliant: boolean("is_compliant").default(true),
  carePlanReviewed: boolean("care_plan_reviewed").default(false),
  symptomManagementDiscussed: boolean("symptom_management_discussed").default(false),
  goalsOfCareReviewed: boolean("goals_of_care_reviewed").default(false),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
