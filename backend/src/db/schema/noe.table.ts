import { date, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { patients } from "./patients.table.js";

export const noticeOfElection = pgTable("notice_of_election", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id")
    .references(() => patients.id)
    .notNull(),
  /** References benefit_periods.id — FK added once benefit_periods table exists */
  benefitPeriodId: uuid("benefit_period_id").notNull(),
  locationId: uuid("location_id")
    .references(() => locations.id)
    .notNull(),
  status: varchar("status", { length: 50 }).notNull().default("draft"),
  electionDate: date("election_date").notNull(),
  filedDate: date("filed_date"),
  filingDeadline: date("filing_deadline").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  lateFilingReason: text("late_filing_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
