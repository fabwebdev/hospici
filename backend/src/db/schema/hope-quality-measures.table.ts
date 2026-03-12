/**
 * hope_quality_measures — computed measure rates per reporting period.
 *
 * One row per (reporting_period_id, measure_code).
 * rate = numerator / denominator * 100 (stored as 0–100 percent, two decimal places).
 * national_average / target_rate: seeded statics, updated by hqrp-period-close job.
 *
 * Measure codes:
 *   NQF3235 — Comprehensive Assessment at Admission
 *   NQF3633 — Treatment Preferences
 *   NQF3634A — HVLDL Part A (RN/MD visits in last 3 days)
 *   NQF3634B — HVLDL Part B (SWW/Chaplain visits in last 7 days)
 *   HCI     — Hospice Care Index composite (0–10)
 *
 * RLS: location_id enforced.
 */

import { relations } from "drizzle-orm";
import {
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { hopeReportingPeriods } from "./hope-reporting-periods.table.js";
import { locations } from "./locations.table.js";

export const hopeMeasureCodeEnum = pgEnum("hope_measure_code", [
  "NQF3235",
  "NQF3633",
  "NQF3634A",
  "NQF3634B",
  "HCI",
]);

export const hopeQualityMeasures = pgTable(
  "hope_quality_measures",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),

    reportingPeriodId: uuid("reporting_period_id")
      .notNull()
      .references(() => hopeReportingPeriods.id, { onDelete: "cascade" }),

    measureCode: hopeMeasureCodeEnum("measure_code").notNull(),

    numerator: integer("numerator").notNull().default(0),
    denominator: integer("denominator").notNull().default(0),

    /** numerator / denominator * 100, two decimal places */
    rate: numeric("rate", { precision: 5, scale: 2 }),

    /** CMS national average for benchmarking — seeded, updated quarterly */
    nationalAverage: numeric("national_average", { precision: 5, scale: 2 }),

    /** Performance target (≥70% for most HQRP measures) */
    targetRate: numeric("target_rate", { precision: 5, scale: 2 }),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_hope_measure_period_code").on(t.reportingPeriodId, t.measureCode),
    index("idx_hope_measures_period").on(t.reportingPeriodId),
    index("idx_hope_measures_location").on(t.locationId, t.measureCode),
  ],
);

export const hopeQualityMeasuresRelations = relations(hopeQualityMeasures, ({ one }) => ({
  location: one(locations, {
    fields: [hopeQualityMeasures.locationId],
    references: [locations.id],
  }),
  reportingPeriod: one(hopeReportingPeriods, {
    fields: [hopeQualityMeasures.reportingPeriodId],
    references: [hopeReportingPeriods.id],
  }),
}));

export type HopeQualityMeasureInsert = typeof hopeQualityMeasures.$inferInsert;
export type HopeQualityMeasureSelect = typeof hopeQualityMeasures.$inferSelect;

/**
 * CMS national averages (2025 baseline) — seeded as static values.
 * Updated by hqrp-period-close BullMQ job each quarter.
 */
export const HQRP_NATIONAL_AVERAGES: Record<string, number> = {
  NQF3235: 87.4,  // Comprehensive Assessment at Admission
  NQF3633: 92.1,  // Treatment Preferences
  NQF3634A: 71.3, // HVLDL Part A
  NQF3634B: 68.5, // HVLDL Part B
  HCI: 7.2,       // HCI composite (0–10 scale)
};

/** Target rates — ≥70% for NQF measures, ≥7.0 for HCI */
export const HQRP_TARGET_RATES: Record<string, number> = {
  NQF3235: 70.0,
  NQF3633: 70.0,
  NQF3634A: 70.0,
  NQF3634B: 70.0,
  HCI: 7.0,
};
