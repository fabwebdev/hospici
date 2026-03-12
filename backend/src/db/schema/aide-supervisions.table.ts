import { boolean, date, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { patients } from "./patients.table.js";
import { users } from "./users.table.js";

export const aideSupervisions = pgTable("aide_supervisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id")
    .references(() => patients.id)
    .notNull(),
  locationId: uuid("location_id")
    .references(() => locations.id)
    .notNull(),
  aideId: uuid("aide_id")
    .references(() => users.id)
    .notNull(),
  supervisorId: uuid("supervisor_id")
    .references(() => users.id)
    .notNull(),
  supervisionDate: date("supervision_date").notNull(),
  nextSupervisionDue: date("next_supervision_due").notNull(),
  method: varchar("method", { length: 50 }).notNull(),
  findings: text("findings").notNull(),
  actionRequired: boolean("action_required").default(false),
  actionTaken: text("action_taken"),
  actionCompletedAt: timestamp("action_completed_at", { withTimezone: true }),
  isOverdue: boolean("is_overdue").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});
