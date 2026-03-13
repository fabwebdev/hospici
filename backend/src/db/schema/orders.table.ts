import { boolean, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { patients } from "./patients.table.js";
import { signatureRequests } from "./signature-requests.table.js";
import { users } from "./users.table.js";

export const orderStatusEnum = pgEnum("order_status_enum", [
  "DRAFT",
  "PENDING_SIGNATURE",
  "VIEWED",
  "SIGNED",
  "REJECTED",
  "EXPIRED",
  "VOIDED",
  "NO_SIGNATURE_REQUIRED",
  "COMPLETED_RETURNED",
]);

export const orderTypeEnum = pgEnum("order_type_enum", [
  "VERBAL",
  "DME",
  "FREQUENCY_CHANGE",
  "MEDICATION",
  "F2F_DOCUMENTATION",
]);

export const deliveryMethodEnum = pgEnum("delivery_method_enum", [
  "PORTAL",
  "FAX",
  "MAIL",
  "COURIER",
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
  // T3-9: Physician Order Inbox + Paperless Order Routing
  verbalReadBackFlag: boolean("verbal_read_back_flag").notNull().default(false),
  verbalReadBackAt: timestamp("verbal_read_back_at", { withTimezone: true }),
  deliveryMethod: deliveryMethodEnum("delivery_method"),
  urgencyReason: text("urgency_reason"),
  linkedSignatureRequestId: uuid("linked_signature_request_id").references(
    () => signatureRequests.id,
  ),
  groupBundleId: uuid("group_bundle_id"),
  noSignatureReason: text("no_signature_reason"),
  voidedAt: timestamp("voided_at", { withTimezone: true }),
  voidedByUserId: uuid("voided_by_user_id").references(() => users.id),
  completedReturnedAt: timestamp("completed_returned_at", { withTimezone: true }),
  reminderCount: integer("reminder_count").notNull().default(0),
  lastReminderAt: timestamp("last_reminder_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
