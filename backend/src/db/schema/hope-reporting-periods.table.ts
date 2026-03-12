/**
 * hope_reporting_periods — one row per location per HQRP quarter.
 *
 * HQRP (Hospice Quality Reporting Program) operates on calendar year quarters.
 * Unique constraint: (location_id, calendar_year, quarter).
 *
 * penalty_applied: true when 2% Medicare reduction triggered by missed deadline.
 *
 * RLS: location_id enforced.
 */

import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

export const hopePeriodStatusEnum = pgEnum("hope_period_status", ["open", "submitted", "closed"]);
import { locations } from "./locations.table.js";

export const hopeReportingPeriods = pgTable(
  "hope_reporting_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),

    calendarYear: integer("calendar_year").notNull(),

    /** 1–4 (Q1 = Jan–Mar, Q2 = Apr–Jun, Q3 = Jul–Sep, Q4 = Oct–Dec) */
    quarter: integer("quarter").notNull(),

    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),

    /** HQRP submission deadline: typically 4.5 months after quarter end */
    submissionDeadline: date("submission_deadline").notNull(),

    status: hopePeriodStatusEnum("status").notNull().default("open"),

    penaltyApplied: boolean("penalty_applied").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_hope_period_location_year_quarter").on(t.locationId, t.calendarYear, t.quarter),
    index("idx_hope_periods_location").on(t.locationId, t.calendarYear, t.quarter),
  ],
);

export const hopeReportingPeriodsRelations = relations(hopeReportingPeriods, ({ one }) => ({
  location: one(locations, {
    fields: [hopeReportingPeriods.locationId],
    references: [locations.id],
  }),
}));

export type HopeReportingPeriodInsert = typeof hopeReportingPeriods.$inferInsert;
export type HopeReportingPeriodSelect = typeof hopeReportingPeriods.$inferSelect;

/** Submission deadlines per HQRP rules (month after quarter close) */
export const HQRP_SUBMISSION_DEADLINES: Record<number, string> = {
  1: "08-15", // Q1 (Jan–Mar) → August 15
  2: "11-15", // Q2 (Apr–Jun) → November 15
  3: "02-15", // Q3 (Jul–Sep) → February 15 (next year)
  4: "05-15", // Q4 (Oct–Dec) → May 15 (next year)
};
