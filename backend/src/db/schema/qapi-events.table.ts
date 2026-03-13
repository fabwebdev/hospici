/**
 * qapi_events — one row per QAPI quality event (T3-11).
 * Closed events are immutable at DB level via RLS UPDATE policy.
 */

import { relations } from "drizzle-orm";
import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { patients } from "./patients.table.js";
import { users } from "./users.table.js";

export const qapiEventTypeEnum = pgEnum("qapi_event_type_enum", [
  "ADVERSE_EVENT",
  "NEAR_MISS",
  "COMPLAINT",
  "GRIEVANCE",
  "QUALITY_TREND",
]);

export const qapiEventStatusEnum = pgEnum("qapi_event_status_enum", [
  "OPEN",
  "IN_PROGRESS",
  "CLOSED",
]);

export const qapiEvents = pgTable(
  "qapi_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    eventType: qapiEventTypeEnum("event_type").notNull(),
    patientId: uuid("patient_id").references(() => patients.id),
    reportedById: uuid("reported_by_id")
      .notNull()
      .references(() => users.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    description: text("description").notNull(),
    rootCauseAnalysis: text("root_cause_analysis"),
    /** Populated when event is raised from a trend spike in the UI */
    linkedTrendContext: jsonb("linked_trend_context"),
    status: qapiEventStatusEnum("status").notNull().default("OPEN"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedById: uuid("closed_by_id").references(() => users.id),
    closureEvidence: text("closure_evidence"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_qapi_events_location_id").on(t.locationId),
    index("idx_qapi_events_status").on(t.status),
    index("idx_qapi_events_patient_id").on(t.patientId),
    index("idx_qapi_events_reported_by_id").on(t.reportedById),
    index("idx_qapi_events_occurred_at").on(t.occurredAt),
  ],
);

export const qapiEventsRelations = relations(qapiEvents, ({ one }) => ({
  location: one(locations, {
    fields: [qapiEvents.locationId],
    references: [locations.id],
  }),
  reportedBy: one(users, {
    fields: [qapiEvents.reportedById],
    references: [users.id],
  }),
  patient: one(patients, {
    fields: [qapiEvents.patientId],
    references: [patients.id],
  }),
}));

export type QAPIEventInsert = typeof qapiEvents.$inferInsert;
export type QAPIEventSelect = typeof qapiEvents.$inferSelect;
