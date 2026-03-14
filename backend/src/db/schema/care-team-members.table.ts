/**
 * Drizzle table definition — care_team_members
 *
 * Tracks all clinicians and external providers assigned to a patient's care team.
 * Soft-delete via unassigned_at — active members have unassigned_at IS NULL.
 *
 * RLS: location_id column — policies in migration 0030.
 */

import { boolean, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { patients } from "./patients.table.js";
import { users } from "./users.table.js";

export const careTeamDisciplineEnum = pgEnum("care_team_discipline_enum", [
  "PHYSICIAN",
  "RN",
  "SW",
  "CHAPLAIN",
  "AIDE",
  "VOLUNTEER",
  "BEREAVEMENT",
  "THERAPIST",
]);

export const careTeamMembers = pgTable(
  "care_team_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patients.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    // Nullable — external providers may not have a system account
    userId: uuid("user_id").references(() => users.id),
    // Denormalized name for external providers (always populated)
    name: text("name").notNull(),
    discipline: careTeamDisciplineEnum("discipline").notNull(),
    role: text("role").notNull(),
    phone: text("phone"),
    email: text("email"),
    isPrimaryContact: boolean("is_primary_contact").notNull().default(false),
    isOnCall: boolean("is_on_call").notNull().default(false),
    assignedByUserId: uuid("assigned_by_user_id").references(() => users.id),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    // Soft delete — NULL means currently assigned
    unassignedAt: timestamp("unassigned_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Partial index — only active assignments
    index("idx_care_team_members_patient_active").on(t.patientId),
  ],
);
