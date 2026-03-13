import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { noticeFilingStatusEnum, noticesOfElection } from "./noe.table.js";
import { patients } from "./patients.table.js";
import { users } from "./users.table.js";

export const noticesOfTerminationRevocation = pgTable("notices_of_termination_revocation", {
  id: uuid("id").primaryKey().defaultRandom(),
  noeId: uuid("noe_id")
    .references(() => noticesOfElection.id)
    .notNull(),
  patientId: uuid("patient_id")
    .references(() => patients.id, { onDelete: "cascade" })
    .notNull(),
  locationId: uuid("location_id")
    .references(() => locations.id, { onDelete: "cascade" })
    .notNull(),
  status: noticeFilingStatusEnum("status").notNull().default("draft"),
  revocationDate: date("revocation_date").notNull(),
  revocationReason: text("revocation_reason").notNull(),
  deadlineDate: date("deadline_date").notNull(),
  isLate: boolean("is_late").notNull().default(false),
  lateReason: text("late_reason"),
  overrideApprovedBy: uuid("override_approved_by").references(() => users.id),
  overrideApprovedAt: timestamp("override_approved_at", { withTimezone: true }),
  overrideReason: text("override_reason"),
  receivingHospiceId: varchar("receiving_hospice_id", { length: 20 }),
  receivingHospiceName: text("receiving_hospice_name"),
  transferDate: date("transfer_date"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  submittedByUserId: uuid("submitted_by_user_id").references(() => users.id),
  responseCode: varchar("response_code", { length: 20 }),
  responseMessage: text("response_message"),
  attemptCount: integer("attempt_count").notNull().default(1),
  correctedFromId: uuid("corrected_from_id"), // self-reference — FK resolved at DB level
  priorPayloadSnapshot: jsonb("prior_payload_snapshot"),
  isClaimBlocking: boolean("is_claim_blocking").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type NoticesOfTerminationRevocationRow = typeof noticesOfTerminationRevocation.$inferSelect;
export type NoticesOfTerminationRevocationInsert =
  typeof noticesOfTerminationRevocation.$inferInsert;
