// db/schema/claim-audit-snapshots.table.ts
// T3-12: Claim Audit Rules Engine — immutable audit snapshot per engine run.

import { boolean, integer, jsonb, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { claimRevisions, claims } from "./claims.table.js";
import { locations } from "./locations.table.js";
import { users } from "./users.table.js";

export const claimAuditSnapshots = pgTable("claim_audit_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  claimId: uuid("claim_id")
    .references(() => claims.id, { onDelete: "cascade" })
    .notNull(),
  claimRevisionId: uuid("claim_revision_id").references(() => claimRevisions.id, {
    onDelete: "set null",
  }),
  locationId: uuid("location_id")
    .references(() => locations.id, { onDelete: "restrict" })
    .notNull(),
  auditedAt: timestamp("audited_at", { withTimezone: true }).defaultNow().notNull(),
  passed: boolean("passed").notNull(),
  blockCount: integer("block_count").notNull().default(0),
  warnCount: integer("warn_count").notNull().default(0),
  /** Array of AuditFailure objects */
  failures: jsonb("failures").notNull().default([]),
  /** Array of supervisor override records */
  overrideTrail: jsonb("override_trail").notNull().default([]),
  auditedBy: uuid("audited_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ClaimAuditSnapshotRow = typeof claimAuditSnapshots.$inferSelect;
export type ClaimAuditSnapshotInsert = typeof claimAuditSnapshots.$inferInsert;
