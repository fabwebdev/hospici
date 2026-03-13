/**
 * scheduled_visits — one row per planned patient visit.
 * Visit scheduling + frequency tracking (T2-10).
 *
 * visit_type reuses the existing PG enum from encounters.
 * discipline stores DisciplineType as text (RN|SW|CHAPLAIN|THERAPY|AIDE).
 * frequency_plan is JSONB: { visitsPerWeek: number, notes?: string }
 *
 * RLS: location_id enforced — users only see visits for their location.
 * Write gate: owner (clinician_id) or admin/super_admin may PATCH status.
 */

import { relations } from "drizzle-orm";
import { date, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { visitTypeEnum } from "./encounters.table.js";
import { locations } from "./locations.table.js";
import { patients } from "./patients.table.js";
import { users } from "./users.table.js";

export const visitStatusEnum = pgEnum("visit_status", [
  "scheduled",
  "completed",
  "missed",
  "cancelled",
]);

export const scheduledVisits = pgTable(
  "scheduled_visits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    clinicianId: uuid("clinician_id").references(() => users.id, { onDelete: "set null" }),

    visitType: visitTypeEnum("visit_type").notNull(),

    /** DisciplineType: RN | SW | CHAPLAIN | THERAPY | AIDE */
    discipline: text("discipline").notNull(),

    /** Calendar date the visit is scheduled for */
    scheduledDate: date("scheduled_date").notNull(),

    /**
     * Frequency plan captured from the active care plan at scheduling time.
     * Shape: { visitsPerWeek: number, notes?: string }
     */
    frequencyPlan: jsonb("frequency_plan").notNull().default({}),

    status: visitStatusEnum("status").notNull().default("scheduled"),

    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    missedReason: text("missed_reason"),
    notes: text("notes"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_scheduled_visits_patient_id").on(t.patientId),
    index("idx_scheduled_visits_location_id").on(t.locationId),
    index("idx_scheduled_visits_clinician").on(t.clinicianId, t.scheduledDate),
    index("idx_scheduled_visits_status_date").on(t.status, t.scheduledDate),
  ],
);

export const scheduledVisitsRelations = relations(scheduledVisits, ({ one }) => ({
  patient: one(patients, {
    fields: [scheduledVisits.patientId],
    references: [patients.id],
  }),
  location: one(locations, {
    fields: [scheduledVisits.locationId],
    references: [locations.id],
  }),
  clinician: one(users, {
    fields: [scheduledVisits.clinicianId],
    references: [users.id],
  }),
}));

export type ScheduledVisitInsert = typeof scheduledVisits.$inferInsert;
export type ScheduledVisitSelect = typeof scheduledVisits.$inferSelect;
