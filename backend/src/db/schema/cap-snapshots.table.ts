import { integer, numeric, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { users } from "./users.table.js";

export const capSnapshots = pgTable("cap_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id")
    .references(() => locations.id)
    .notNull(),
  capYear: integer("cap_year").notNull(),
  calculatedAt: timestamp("calculated_at", { withTimezone: true }).defaultNow().notNull(),
  utilizationPercent: numeric("utilization_percent", { precision: 6, scale: 3 })
    .notNull()
    .default("0"),
  projectedYearEndPercent: numeric("projected_year_end_percent", { precision: 6, scale: 3 })
    .notNull()
    .default("0"),
  estimatedLiability: numeric("estimated_liability", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  patientCount: integer("patient_count").notNull().default(0),
  formulaVersion: varchar("formula_version", { length: 20 }).notNull().default("1.0.0"),
  inputHash: varchar("input_hash", { length: 64 }).notNull(),
  triggeredBy: varchar("triggered_by", { length: 20 }).notNull().default("scheduled"),
  triggeredByUserId: uuid("triggered_by_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
