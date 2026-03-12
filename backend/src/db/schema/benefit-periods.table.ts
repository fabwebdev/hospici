import { boolean, date, integer, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { patients } from "./patients.table.js";
import { users } from "./users.table.js";

export const benefitPeriods = pgTable("benefit_periods", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id")
    .references(() => patients.id)
    .notNull(),
  locationId: uuid("location_id")
    .references(() => locations.id)
    .notNull(),
  periodNumber: integer("period_number").notNull(),
  startDate: date("start_date").notNull(),
  endDate: date("end_date").notNull(),
  periodType: varchar("period_type", { length: 50 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("active"),
  isActive: boolean("is_active").default(true),
  f2fRequired: boolean("f2f_required").default(false),
  f2fDate: date("f2f_date"),
  f2fPhysicianId: uuid("f2f_physician_id").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
