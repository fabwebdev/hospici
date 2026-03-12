/**
 * hope_iqies_submissions — one row per iQIES submission attempt.
 *
 * An assessment can have multiple attempts (retries + corrections).
 * attempt_number is 1-indexed; >1 = retry or correction.
 *
 * payload_hash: SHA-256 of submitted XML — tamper-evident audit trail.
 * correction_type: maps to iQIES action codes (modification / inactivation).
 *
 * RLS: location_id enforced — users only see submissions for their location.
 */

import { relations } from "drizzle-orm";
import {
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { hopeAssessments } from "./hope-assessments.table.js";
import { locations } from "./locations.table.js";
import { users } from "./users.table.js";

export const hopeSubmissionStatusEnum = pgEnum("hope_submission_status", [
  "pending",
  "accepted",
  "rejected",
  "correction_pending",
]);

export const hopeCorrectionTypeEnum = pgEnum("hope_correction_type", [
  "none",
  "modification",
  "inactivation",
]);

export const hopeIqiesSubmissions = pgTable(
  "hope_iqies_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    assessmentId: uuid("assessment_id")
      .notNull()
      .references(() => hopeAssessments.id, { onDelete: "cascade" }),

    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),

    /** 1-indexed; >1 = retry or correction */
    attemptNumber: integer("attempt_number").notNull().default(1),

    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),

    responseReceivedAt: timestamp("response_received_at", { withTimezone: true }),

    /** iQIES-assigned tracking identifier returned in X-iQIES-Tracking-ID header */
    trackingId: varchar("tracking_id", { length: 100 }),

    submittedByUserId: uuid("submitted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),

    submissionStatus: hopeSubmissionStatusEnum("submission_status").notNull().default("pending"),

    /** Maps to iQIES action codes: none | modification | inactivation */
    correctionType: hopeCorrectionTypeEnum("correction_type").notNull().default("none"),

    /** iQIES error codes, e.g. A0310A_INVALID, WINDOW_VIOLATION, CCN_NOT_FOUND */
    rejectionCodes: text("rejection_codes").array().notNull().default([]),

    rejectionDetails: text("rejection_details"),

    /** SHA-256 of submitted XML payload — tamper-evident audit trail */
    payloadHash: varchar("payload_hash", { length: 64 }).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_hope_submissions_assessment").on(t.assessmentId),
    index("idx_hope_submissions_location").on(t.locationId, t.submissionStatus),
    index("idx_hope_submissions_status").on(t.submissionStatus, t.submittedAt),
  ],
);

export const hopeIqiesSubmissionsRelations = relations(hopeIqiesSubmissions, ({ one }) => ({
  assessment: one(hopeAssessments, {
    fields: [hopeIqiesSubmissions.assessmentId],
    references: [hopeAssessments.id],
  }),
  location: one(locations, {
    fields: [hopeIqiesSubmissions.locationId],
    references: [locations.id],
  }),
  submittedBy: one(users, {
    fields: [hopeIqiesSubmissions.submittedByUserId],
    references: [users.id],
  }),
}));

export type HopeIqiesSubmissionInsert = typeof hopeIqiesSubmissions.$inferInsert;
export type HopeIqiesSubmissionSelect = typeof hopeIqiesSubmissions.$inferSelect;
