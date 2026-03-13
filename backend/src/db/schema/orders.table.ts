import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { patients } from "./patients.table.js";
import { users } from "./users.table.js";

export const orderStatusEnum = pgEnum("order_status_enum", [
  "PENDING_SIGNATURE",
  "SIGNED",
  "REJECTED",
  "EXPIRED",
]);

export const orderTypeEnum = pgEnum("order_type_enum", [
  "VERBAL",
  "DME",
  "FREQUENCY_CHANGE",
  "MEDICATION",
  "F2F_DOCUMENTATION",
]);

export const orders = pgTable("orders", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id")
    .references(() => locations.id)
    .notNull(),
  patientId: uuid("patient_id")
    .references(() => patients.id)
    .notNull(),
  issuingClinicianId: uuid("issuing_clinician_id")
    .references(() => users.id)
    .notNull(),
  physicianId: uuid("physician_id").references(() => users.id),
  type: orderTypeEnum("type").notNull(),
  content: text("content").notNull(),
  status: orderStatusEnum("status").notNull().default("PENDING_SIGNATURE"),
  dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  rejectionReason: text("rejection_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
