/**
 * review_checklist_templates — discipline × visit_type checklist templates (T3-13).
 * System-level templates (location_id = NULL) are readable by all authenticated users.
 * Location-specific overrides carry a location_id.
 */

import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { users } from "./users.table.js";

export const reviewChecklistTemplates = pgTable(
  "review_checklist_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    locationId: uuid("location_id").references(() => locations.id),
    discipline: text("discipline").notNull(),
    visitType: text("visit_type").notNull(),
    /** ChecklistItem[]: { id, label, required, regulatoryRef?, scoringWeight? } */
    items: jsonb("items").notNull().default([]),
    version: integer("version").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    effectiveDate: date("effective_date").notNull().defaultNow(),
    createdById: uuid("created_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("idx_rct_discipline_visit_type").on(t.discipline, t.visitType),
    index("idx_rct_location_id").on(t.locationId),
  ],
);

export type ReviewChecklistTemplateInsert = typeof reviewChecklistTemplates.$inferInsert;
export type ReviewChecklistTemplateSelect = typeof reviewChecklistTemplates.$inferSelect;
