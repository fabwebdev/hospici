/**
 * encounters — one row per patient visit (T2-7 VantageChart).
 * VantageChart narrative fields are co-located here for CMS audit traceability.
 * Note-review columns added in T2-9 (migration 0013).
 */

import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { patients } from "./patients.table.js";
import { users } from "./users.table.js";

export const visitTypeEnum = pgEnum("visit_type", [
  "routine_rn",
  "admission",
  "recertification",
  "supervisory",
  "prn",
  "discharge",
]);

export const encounterStatusEnum = pgEnum("encounter_status", ["DRAFT", "COMPLETED", "SIGNED"]);

export const vantageChartMethodEnum = pgEnum("vantage_chart_method", ["TEMPLATE", "LLM"]);

export const noteReviewStatusEnum = pgEnum("note_review_status", [
  "PENDING",
  "IN_REVIEW",
  "REVISION_REQUESTED",
  "RESUBMITTED",
  "APPROVED",
  "LOCKED",
  "ESCALATED",
]);

export const encounters = pgTable(
  "encounters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    clinicianId: uuid("clinician_id")
      .notNull()
      .references(() => users.id),

    visitType: visitTypeEnum("visit_type").notNull(),
    status: encounterStatusEnum("status").notNull().default("DRAFT"),

    /** Full VantageChartInput captured via 9-step form */
    data: jsonb("data"),

    /** Layer 1 or Layer 2 generated draft text */
    vantageChartDraft: text("vantage_chart_draft"),
    /** Which layer produced the accepted note */
    vantageChartMethod: vantageChartMethodEnum("vantage_chart_method"),
    /** Timestamp when clinician accepted the note */
    vantageChartAcceptedAt: timestamp("vantage_chart_accepted_at", {
      withTimezone: true,
    }),
    /** CMS audit: maps each sentence → fragment ID + input snapshot */
    vantageChartTraceability: jsonb("vantage_chart_traceability"),

    // ── Note review fields (T2-9) ──────────────────────────────────────────────
    reviewStatus: noteReviewStatusEnum("review_status").notNull().default("PENDING"),
    reviewerId: uuid("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    escalatedAt: timestamp("escalated_at", { withTimezone: true }),
    escalationReason: text("escalation_reason"),
    /** Structured RevisionRequest[] JSONB — replaces free-text note */
    revisionRequests: jsonb("revision_requests").notNull().default([]),
    reviewPriority: integer("review_priority").notNull().default(0),
    assignedReviewerId: uuid("assigned_reviewer_id").references(() => users.id, {
      onDelete: "set null",
    }),
    dueBy: timestamp("due_by", { withTimezone: true }),
    billingImpact: boolean("billing_impact").notNull().default(false),
    complianceImpact: boolean("compliance_impact").notNull().default(false),
    firstPassApproved: boolean("first_pass_approved").notNull().default(false),
    revisionCount: integer("revision_count").notNull().default(0),

    visitedAt: timestamp("visited_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_encounters_patient_id").on(t.patientId),
    index("idx_encounters_location_id").on(t.locationId),
    index("idx_encounters_clinician_id").on(t.clinicianId),
    index("idx_encounters_visited_at").on(t.visitedAt),
    index("idx_encounters_status").on(t.status),
  ],
);

export const encountersRelations = relations(encounters, ({ one }) => ({
  patient: one(patients, {
    fields: [encounters.patientId],
    references: [patients.id],
  }),
  location: one(locations, {
    fields: [encounters.locationId],
    references: [locations.id],
  }),
  clinician: one(users, {
    fields: [encounters.clinicianId],
    references: [users.id],
  }),
}));

export type EncounterInsert = typeof encounters.$inferInsert;
export type EncounterSelect = typeof encounters.$inferSelect;
