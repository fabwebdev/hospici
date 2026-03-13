/**
 * qapi_action_items — child rows for QAPI events (T3-11).
 * Independently queryable — not JSONB array on qapi_events.
 */

import { relations } from "drizzle-orm";
import { date, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { qapiEvents } from "./qapi-events.table.js";
import { users } from "./users.table.js";

export const qapiActionItems = pgTable(
  "qapi_action_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => qapiEvents.id, { onDelete: "cascade" }),
    /** Denormalized for RLS policy */
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    action: text("action").notNull(),
    assignedToId: uuid("assigned_to_id")
      .notNull()
      .references(() => users.id),
    dueDate: date("due_date").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    completedById: uuid("completed_by_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_qapi_action_items_event_id").on(t.eventId),
    index("idx_qapi_action_items_location_id").on(t.locationId),
    index("idx_qapi_action_items_due_date").on(t.dueDate),
    index("idx_qapi_action_items_assigned_to").on(t.assignedToId),
  ],
);

export const qapiActionItemsRelations = relations(qapiActionItems, ({ one }) => ({
  event: one(qapiEvents, {
    fields: [qapiActionItems.eventId],
    references: [qapiEvents.id],
  }),
  location: one(locations, {
    fields: [qapiActionItems.locationId],
    references: [locations.id],
  }),
  assignedTo: one(users, {
    fields: [qapiActionItems.assignedToId],
    references: [users.id],
  }),
}));

export type QAPIActionItemInsert = typeof qapiActionItems.$inferInsert;
export type QAPIActionItemSelect = typeof qapiActionItems.$inferSelect;
