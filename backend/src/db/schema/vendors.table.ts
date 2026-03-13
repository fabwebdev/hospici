// db/schema/vendors.table.ts
// T3-8: Vendor Governance + BAA Registry

import {
  boolean,
  date,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { users } from "./users.table.js";

export const baaStatusEnum = pgEnum("baa_status", [
  "SIGNED",
  "PENDING",
  "NOT_REQUIRED",
  "EXPIRED",
  "SUSPENDED",
]);

export const vendorServiceCategoryEnum = pgEnum("vendor_service_category", [
  "INFRASTRUCTURE",
  "CLINICAL",
  "BILLING",
  "COMMUNICATION",
  "AI_ML",
  "IDENTITY",
  "STORAGE",
  "MONITORING",
  "OTHER",
]);

export const phiExposureLevelEnum = pgEnum("phi_exposure_level", [
  "NONE",
  "INDIRECT",
  "DIRECT",
  "STORES_PHI",
]);

export const vendors = pgTable("vendors", {
  id: uuid("id").primaryKey().defaultRandom(),
  locationId: uuid("location_id")
    .notNull()
    .references(() => locations.id, { onDelete: "restrict" }),
  vendorName: text("vendor_name").notNull(),
  serviceCategory: vendorServiceCategoryEnum("service_category").notNull(),
  description: text("description").notNull().default(""),
  phiExposureLevel: phiExposureLevelEnum("phi_exposure_level").notNull().default("NONE"),
  transmitsPhi: boolean("transmits_phi").notNull().default(false),
  storesPhi: boolean("stores_phi").notNull().default(false),
  subprocessor: boolean("subprocessor").notNull().default(false),
  baaRequired: boolean("baa_required").notNull().default(false),
  baaStatus: baaStatusEnum("baa_status").notNull().default("PENDING"),
  baaEffectiveDate: date("baa_effective_date"),
  baaRenewalDate: date("baa_renewal_date"),
  contractOwnerUserId: uuid("contract_owner_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  securityOwnerUserId: uuid("security_owner_user_id").references(() => users.id, {
    onDelete: "set null",
  }),
  securityReviewDate: date("security_review_date"),
  securityReviewDueDate: date("security_review_due_date"),
  incidentContact: text("incident_contact"),
  dataResidency: text("data_residency"),
  exitPlan: text("exit_plan"),
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Vendor = typeof vendors.$inferSelect;
export type NewVendor = typeof vendors.$inferInsert;
