// db/schema/remittances.table.ts
// T3-7b: ERA 835 + Remittance Reconciliation — three tables + two enums

import {
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { claims } from "./claims.table.js";
import { locations } from "./locations.table.js";
import { users } from "./users.table.js";

// ── Enums ──────────────────────────────────────────────────────────────────────

export const remittanceStatusEnum = pgEnum("remittance_status", [
  "RECEIVED",    // file received, not yet parsed
  "PARSED",      // parsed, matching in progress
  "POSTED",      // all CLP loops matched and posted
  "PARTIAL",     // some matched, some unmatched
  "FAILED",      // parsing failed
  "RECONCILED",  // daily scan confirmed no outstanding items
]);

export const postingStateEnum = pgEnum("posting_state", [
  "PENDING",   // created, not yet applied to claim
  "APPLIED",   // claim state updated
  "REVERSED",  // manual reversal
]);

// ── remittances_835 ────────────────────────────────────────────────────────────

export const remittances835 = pgTable("remittances_835", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id")
    .references(() => locations.id, { onDelete: "restrict" })
    .notNull(),
  payerName: text("payer_name").notNull(),
  payerId: text("payer_id"),
  checkNumber: text("check_number"),
  eftNumber: text("eft_number"),
  paymentDate: text("payment_date"),   // ISO date extracted from BPR/DTM
  totalPaymentAmount: numeric("total_payment_amount", { precision: 14, scale: 2 }),
  rawFileHash: text("raw_file_hash").notNull(),  // SHA-256 of raw 835 bytes
  status: remittanceStatusEnum("status").notNull().default("RECEIVED"),
  ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow().notNull(),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
});

export type Remittance835Row = typeof remittances835.$inferSelect;
export type Remittance835Insert = typeof remittances835.$inferInsert;

// ── remittance_postings ────────────────────────────────────────────────────────
// One row per matched CLP/SVC loop.

export const remittancePostings = pgTable("remittance_postings", {
  id: uuid("id").primaryKey().defaultRandom(),
  remittanceId: uuid("remittance_id")
    .references(() => remittances835.id, { onDelete: "cascade" })
    .notNull(),
  claimId: uuid("claim_id")
    .references(() => claims.id, { onDelete: "restrict" })
    .notNull(),
  locationId: uuid("location_id")
    .references(() => locations.id, { onDelete: "restrict" })
    .notNull(),
  claimIcn: text("claim_icn"),                           // ICN used for match
  payerClaimNumber: text("payer_claim_number"),           // CLP07
  patientControlNumber: text("patient_control_number"),  // CLP01
  paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  contractualAdjustment: numeric("contractual_adjustment", { precision: 14, scale: 2 }).notNull().default("0"),
  patientResponsibility: numeric("patient_responsibility", { precision: 14, scale: 2 }).notNull().default("0"),
  otherAdjustment: numeric("other_adjustment", { precision: 14, scale: 2 }).notNull().default("0"),
  adjustmentReasonCodes: jsonb("adjustment_reason_codes").notNull().default([]),  // CAS segments
  svcLoops: jsonb("svc_loops").notNull().default([]),                              // raw SVC data
  postingState: postingStateEnum("posting_state").notNull().default("PENDING"),
  postedAt: timestamp("posted_at", { withTimezone: true }),
  reversedAt: timestamp("reversed_at", { withTimezone: true }),
  reversedBy: uuid("reversed_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type RemittancePostingRow = typeof remittancePostings.$inferSelect;
export type RemittancePostingInsert = typeof remittancePostings.$inferInsert;

// ── unmatched_remittances ──────────────────────────────────────────────────────
// Exception queue — one row per unmatched CLP loop pending manual resolution.

export const unmatchedRemittances = pgTable("unmatched_remittances", {
  id: uuid("id").primaryKey().defaultRandom(),
  remittanceId: uuid("remittance_id")
    .references(() => remittances835.id, { onDelete: "cascade" })
    .notNull(),
  locationId: uuid("location_id")
    .references(() => locations.id, { onDelete: "restrict" })
    .notNull(),
  rawClpData: jsonb("raw_clp_data").notNull().default({}),             // raw CLP loop data
  matchAttemptDetails: jsonb("match_attempt_details").notNull().default({}),  // why match failed
  patientControlNumber: text("patient_control_number"),  // CLP01 — for manual lookup
  payerClaimNumber: text("payer_claim_number"),          // CLP07
  paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }),
  assignedTo: uuid("assigned_to").references(() => users.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  matchedClaimId: uuid("matched_claim_id").references(() => claims.id),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type UnmatchedRemittanceRow = typeof unmatchedRemittances.$inferSelect;
export type UnmatchedRemittanceInsert = typeof unmatchedRemittances.$inferInsert;
