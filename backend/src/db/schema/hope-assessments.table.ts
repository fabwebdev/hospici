/**
 * hope_assessments — one row per HOPE assessment (HOPE-A, HOPE-UV, HOPE-D).
 *
 * CMS HOPE replaces HIS effective October 1, 2025.
 * Failure to submit: 2% Medicare payment reduction (42 CFR §418.312).
 *
 * Status state machine:
 *   draft → in_progress → ready_for_review → approved_for_submission
 *   → submitted → accepted | rejected | needs_correction
 *
 * RLS: location_id enforced — users only see assessments for their location.
 * completeness_score, fatal_error_count, warning_count are cached from last validate call.
 */

import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
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

export const hopeAssessmentStatusEnum = pgEnum("hope_assessment_status", [
  "draft",
  "in_progress",
  "ready_for_review",
  "approved_for_submission",
  "submitted",
  "accepted",
  "rejected",
  "needs_correction",
]);

export const hopeAssessments = pgTable(
  "hope_assessments",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id, { onDelete: "cascade" }),

    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),

    /** CMS codes: '01' = HOPE-A, '02' = HOPE-UV, '03' = HOPE-D */
    assessmentType: varchar("assessment_type", { length: 2 }).notNull(),

    assessmentDate: date("assessment_date").notNull(),

    /** For HOPE-A: hospice election date. For HOPE-D: discharge/death date. For HOPE-UV: visit date. */
    electionDate: date("election_date").notNull(),

    /** Computed window start: electionDate for A/D, visitDate (= assessmentDate) for UV */
    windowStart: date("window_start").notNull(),

    /** Computed window deadline: windowStart + 7 days for A and D; same-day for UV */
    windowDeadline: date("window_deadline").notNull(),

    assignedClinicianId: uuid("assigned_clinician_id").references(() => users.id, {
      onDelete: "set null",
    }),

    status: hopeAssessmentStatusEnum("status").notNull().default("draft"),

    /** 0–100, cached from last /validate call */
    completenessScore: integer("completeness_score").notNull().default(0),

    /** Count of blocking errors from last /validate call */
    fatalErrorCount: integer("fatal_error_count").notNull().default(0),

    /** Count of non-blocking warnings from last /validate call */
    warningCount: integer("warning_count").notNull().default(0),

    /** UV assessments with high symptom burden flag follow-up */
    symptomFollowUpRequired: boolean("symptom_follow_up_required").notNull().default(false),

    symptomFollowUpDueAt: date("symptom_follow_up_due_at"),

    /** Full TypeBox-validated HOPE clinical payload (sections A–Q as applicable) */
    data: jsonb("data").notNull().default({}),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_hope_assessments_patient_id").on(t.patientId),
    index("idx_hope_assessments_location_id").on(t.locationId),
    index("idx_hope_assessments_status").on(t.status, t.assessmentType),
    index("idx_hope_assessments_clinician").on(t.assignedClinicianId),
    index("idx_hope_assessments_window").on(t.windowDeadline, t.status),
  ],
);

export const hopeAssessmentsRelations = relations(hopeAssessments, ({ one }) => ({
  patient: one(patients, {
    fields: [hopeAssessments.patientId],
    references: [patients.id],
  }),
  location: one(locations, {
    fields: [hopeAssessments.locationId],
    references: [locations.id],
  }),
  assignedClinician: one(users, {
    fields: [hopeAssessments.assignedClinicianId],
    references: [users.id],
  }),
}));

export type HopeAssessmentInsert = typeof hopeAssessments.$inferInsert;
export type HopeAssessmentSelect = typeof hopeAssessments.$inferSelect;

/** Valid assessment type codes — use these constants instead of raw strings */
export const HOPE_ASSESSMENT_TYPES = {
  ADMISSION: "01",
  UPDATE_VISIT: "02",
  DISCHARGE: "03",
} as const;

export type HopeAssessmentType = (typeof HOPE_ASSESSMENT_TYPES)[keyof typeof HOPE_ASSESSMENT_TYPES];

/** Valid next-state transitions for the HOPE status machine */
export const HOPE_STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ["in_progress"],
  in_progress: ["ready_for_review"],
  ready_for_review: ["approved_for_submission", "in_progress"],
  approved_for_submission: ["submitted"],
  submitted: ["accepted", "rejected", "needs_correction"],
  accepted: [],
  rejected: ["ready_for_review"],
  needs_correction: ["in_progress"],
};

/** Statuses that block submission — must have 0 fatal errors to leave these */
export const HOPE_BLOCKING_STATUSES = ["draft", "in_progress", "ready_for_review"] as const;
