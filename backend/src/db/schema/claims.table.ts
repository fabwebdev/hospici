// db/schema/claims.table.ts
// T3-7a: Hospice Claim Lifecycle — claims, claim_revisions, claim_submissions,
//        claim_rejections, bill_holds

import {
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { benefitPeriods } from "./benefit-periods.table.js";
import { locations } from "./locations.table.js";
import { patients } from "./patients.table.js";
import { users } from "./users.table.js";

// ── Enums ──────────────────────────────────────────────────────────────────────

export const claimStateEnum = pgEnum("claim_state", [
  "DRAFT",
  "NOT_READY",
  "READY_FOR_AUDIT",
  "AUDIT_FAILED",
  "READY_TO_SUBMIT",
  "QUEUED",
  "SUBMITTED",
  "ACCEPTED",
  "REJECTED",
  "DENIED",
  "PAID",
  "VOIDED",
]);

export const claimBillTypeEnum = pgEnum("claim_bill_type", ["original", "replacement", "void"]);

export const billHoldReasonEnum = pgEnum("bill_hold_reason", [
  "MANUAL_REVIEW",
  "COMPLIANCE_BLOCK",
  "MISSING_DOCUMENTATION",
  "PAYER_INQUIRY",
  "INTERNAL_AUDIT",
  "SUPERVISOR_REVIEW",
]);

// ── claims ─────────────────────────────────────────────────────────────────────

export const claims = pgTable("claims", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id")
    .references(() => patients.id, { onDelete: "restrict" })
    .notNull(),
  locationId: uuid("location_id")
    .references(() => locations.id, { onDelete: "restrict" })
    .notNull(),
  payerId: text("payer_id").notNull(),
  benefitPeriodId: uuid("benefit_period_id").references(() => benefitPeriods.id, {
    onDelete: "restrict",
  }),
  billType: claimBillTypeEnum("bill_type").notNull().default("original"),
  statementFromDate: date("statement_from_date").notNull(),
  statementToDate: date("statement_to_date").notNull(),
  totalCharge: numeric("total_charge", { precision: 12, scale: 2 }).notNull().default("0"),
  state: claimStateEnum("state").notNull().default("DRAFT"),
  isOnHold: boolean("is_on_hold").notNull().default(false),
  correctedFromId: uuid("corrected_from_id"), // self-reference, no FK at column level
  claimLines: jsonb("claim_lines").notNull().default([]),
  payloadHash: text("payload_hash"),
  x12Hash: text("x12_hash"),
  clearinghouseIcn: text("clearinghouse_icn"),
  createdBy: uuid("created_by")
    .references(() => users.id)
    .notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ClaimRow = typeof claims.$inferSelect;
export type ClaimInsert = typeof claims.$inferInsert;

// ── claim_revisions ────────────────────────────────────────────────────────────

export const claimRevisions = pgTable("claim_revisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  claimId: uuid("claim_id")
    .references(() => claims.id, { onDelete: "cascade" })
    .notNull(),
  locationId: uuid("location_id")
    .references(() => locations.id)
    .notNull(),
  fromState: claimStateEnum("from_state").notNull(),
  toState: claimStateEnum("to_state").notNull(),
  reason: text("reason"),
  snapshot: jsonb("snapshot").notNull().default({}),
  transitionedBy: uuid("transitioned_by").references(() => users.id),
  transitionedAt: timestamp("transitioned_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ClaimRevisionRow = typeof claimRevisions.$inferSelect;
export type ClaimRevisionInsert = typeof claimRevisions.$inferInsert;

// ── claim_submissions ──────────────────────────────────────────────────────────

export const claimSubmissions = pgTable("claim_submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  claimId: uuid("claim_id")
    .references(() => claims.id, { onDelete: "cascade" })
    .notNull(),
  locationId: uuid("location_id")
    .references(() => locations.id)
    .notNull(),
  batchId: text("batch_id"),
  responseCode: text("response_code"),
  responseMessage: text("response_message"),
  submittedAt: timestamp("submitted_at", { withTimezone: true }).defaultNow().notNull(),
  responseReceivedAt: timestamp("response_received_at", { withTimezone: true }),
  jobId: text("job_id"),
  attemptNumber: integer("attempt_number").notNull().default(1),
});

export type ClaimSubmissionRow = typeof claimSubmissions.$inferSelect;
export type ClaimSubmissionInsert = typeof claimSubmissions.$inferInsert;

// ── claim_rejections ───────────────────────────────────────────────────────────

export const claimRejections = pgTable("claim_rejections", {
  id: uuid("id").primaryKey().defaultRandom(),
  claimId: uuid("claim_id")
    .references(() => claims.id, { onDelete: "cascade" })
    .notNull(),
  claimSubmissionId: uuid("claim_submission_id").references(() => claimSubmissions.id, {
    onDelete: "cascade",
  }),
  locationId: uuid("location_id")
    .references(() => locations.id)
    .notNull(),
  loopId: text("loop_id"),
  segmentId: text("segment_id"),
  errorCode: text("error_code").notNull(),
  errorDescription: text("error_description").notNull(),
  fieldPosition: text("field_position"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type ClaimRejectionRow = typeof claimRejections.$inferSelect;
export type ClaimRejectionInsert = typeof claimRejections.$inferInsert;

// ── bill_holds ─────────────────────────────────────────────────────────────────

export const billHolds = pgTable("bill_holds", {
  id: uuid("id").primaryKey().defaultRandom(),
  claimId: uuid("claim_id")
    .references(() => claims.id, { onDelete: "cascade" })
    .notNull(),
  locationId: uuid("location_id")
    .references(() => locations.id)
    .notNull(),
  reason: billHoldReasonEnum("reason").notNull(),
  holdNote: text("hold_note"),
  placedBy: uuid("placed_by")
    .references(() => users.id)
    .notNull(),
  placedAt: timestamp("placed_at", { withTimezone: true }).defaultNow().notNull(),
  releasedBy: uuid("released_by").references(() => users.id),
  releasedAt: timestamp("released_at", { withTimezone: true }),
});

export type BillHoldRow = typeof billHolds.$inferSelect;
export type BillHoldInsert = typeof billHolds.$inferInsert;
