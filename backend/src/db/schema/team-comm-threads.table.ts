/**
 * Drizzle table definition — team_comm_threads
 *
 * Top-level conversation threads for per-patient team communication.
 *
 * RLS: location_id column — policies in migration 0031.
 */

import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { patients } from "./patients.table.js";
import { users } from "./users.table.js";

export const teamCommThreads = pgTable(
  "team_comm_threads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    subject: text("subject").notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_team_comm_threads_patient_id").on(t.patientId)],
);
