import { boolean, date, integer, numeric, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { capSnapshots } from "./cap-snapshots.table.js";
import { locations } from "./locations.table.js";
import { patients } from "./patients.table.js";

export const capPatientContributions = pgTable("cap_patient_contributions", {
  id: uuid("id").primaryKey().defaultRandom(),
  snapshotId: uuid("snapshot_id")
    .references(() => capSnapshots.id, { onDelete: "cascade" })
    .notNull(),
  patientId: uuid("patient_id")
    .references(() => patients.id)
    .notNull(),
  locationId: uuid("location_id")
    .references(() => locations.id)
    .notNull(),
  capContributionAmount: numeric("cap_contribution_amount", { precision: 12, scale: 2 })
    .notNull()
    .default("0"),
  routineDays: integer("routine_days").notNull().default(0),
  continuousHomeCareDays: integer("continuous_home_care_days").notNull().default(0),
  inpatientDays: integer("inpatient_days").notNull().default(0),
  liveDischargeFlag: boolean("live_discharge_flag").notNull().default(false),
  admissionDate: date("admission_date").notNull(),
  dischargeDate: date("discharge_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
