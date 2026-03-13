// db/schema/audit-record-exports.table.ts
// T3-10: ADR / TPE / Survey Record Packet Export

import { boolean, date, jsonb, pgEnum, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { patients } from "./patients.table.js";
import { users } from "./users.table.js";

export const exportPurposeEnum = pgEnum("export_purpose_enum", [
  "ADR",
  "TPE",
  "SURVEY",
  "LEGAL",
  "PAYER_REQUEST",
]);

export const exportStatusEnum = pgEnum("export_status_enum", [
  "REQUESTED",
  "GENERATING",
  "READY",
  "EXPORTED",
  "FAILED",
]);

export const auditRecordExports = pgTable("audit_record_exports", {
  id: uuid("id").primaryKey().defaultRandom(),
  patientId: uuid("patient_id")
    .references(() => patients.id, { onDelete: "restrict" })
    .notNull(),
  locationId: uuid("location_id")
    .references(() => locations.id, { onDelete: "restrict" })
    .notNull(),
  requestedByUserId: uuid("requested_by_user_id")
    .references(() => users.id, { onDelete: "restrict" })
    .notNull(),
  purpose: exportPurposeEnum("purpose").notNull(),
  status: exportStatusEnum("status").notNull().default("REQUESTED"),
  dateRangeFrom: date("date_range_from").notNull(),
  dateRangeTo: date("date_range_to").notNull(),
  selectedSections: text("selected_sections").array().notNull().default([]),
  includeAuditLog: boolean("include_audit_log").notNull().default(false),
  includeCompletenessSummary: boolean("include_completeness_summary").notNull().default(false),
  exportHash: varchar("export_hash", { length: 64 }),
  manifestJson: jsonb("manifest_json"),
  pdfStorageKey: varchar("pdf_storage_key", { length: 500 }),
  zipStorageKey: varchar("zip_storage_key", { length: 500 }),
  generationStartedAt: timestamp("generation_started_at", { withTimezone: true }),
  generationCompletedAt: timestamp("generation_completed_at", { withTimezone: true }),
  exportedAt: timestamp("exported_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
