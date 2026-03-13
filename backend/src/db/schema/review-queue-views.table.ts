/**
 * review_queue_views — DB-persisted saved filter/sort/column configurations (T3-13).
 * viewScope: note_review | chart_audit — determines which queue endpoint it applies to.
 * Partial unique index prevents two default views for the same (owner, scope).
 */

import {
  boolean,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { users } from "./users.table.js";

export const viewScopeEnum = pgEnum("view_scope_enum", ["note_review", "chart_audit"]);

export const reviewQueueViews = pgTable(
  "review_queue_views",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    name: text("name").notNull(),
    viewScope: viewScopeEnum("view_scope").notNull(),
    /** Same shape as query params for the scoped queue endpoint */
    filters: jsonb("filters").notNull().default({}),
    sortConfig: jsonb("sort_config")
      .notNull()
      .default({ sortBy: "lastActivityAt", sortDir: "desc" }),
    columnConfig: jsonb("column_config")
      .notNull()
      .default({ visibleColumns: [], columnOrder: [] }),
    groupBy: text("group_by"),
    isShared: boolean("is_shared").notNull().default(false),
    isPinned: boolean("is_pinned").notNull().default(false),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_rqv_owner_id").on(t.ownerId),
    index("idx_rqv_location_id").on(t.locationId),
    // Partial unique index enforced in DB migration — Drizzle workaround: omit from here
    // since Drizzle doesn't support WHERE clauses on uniqueIndex yet.
    index("idx_rqv_scope").on(t.viewScope),
  ],
);

export type ReviewQueueViewInsert = typeof reviewQueueViews.$inferInsert;
export type ReviewQueueViewSelect = typeof reviewQueueViews.$inferSelect;
