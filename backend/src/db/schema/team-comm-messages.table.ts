/**
 * Drizzle table definition — team_comm_messages
 *
 * Individual messages within a team communication thread.
 *
 * RLS: location_id column — policies in migration 0031.
 */

import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { patients } from "./patients.table.js";
import { teamCommThreads } from "./team-comm-threads.table.js";
import { users } from "./users.table.js";

export const teamCommMessages = pgTable(
  "team_comm_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    threadId: uuid("thread_id")
      .notNull()
      .references(() => teamCommThreads.id),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    authorUserId: uuid("author_user_id").references(() => users.id),
    body: text("body").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_team_comm_messages_thread_sent").on(t.threadId, t.sentAt)],
);
