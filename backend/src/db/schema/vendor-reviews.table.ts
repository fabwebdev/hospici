// db/schema/vendor-reviews.table.ts
// T3-8: Vendor Governance — append-only review log

import { pgTable, uuid, text, date, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { locations } from "./locations.table.js";
import { users } from "./users.table.js";
import { vendors, baaStatusEnum } from "./vendors.table.js";

export const vendorReviews = pgTable(
  "vendor_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    vendorId: uuid("vendor_id")
      .notNull()
      .references(() => vendors.id, { onDelete: "cascade" }),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "restrict" }),
    reviewedByUserId: uuid("reviewed_by_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    reviewDate: date("review_date").notNull(),
    outcome: text("outcome").notNull(),
    baaStatusAtReview: baaStatusEnum("baa_status_at_review").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    outcomeCheck: check(
      "vendor_reviews_outcome_check",
      sql`${t.outcome} IN ('APPROVED', 'APPROVED_WITH_CONDITIONS', 'SUSPENDED', 'TERMINATED')`,
    ),
  }),
);

export type VendorReview = typeof vendorReviews.$inferSelect;
export type NewVendorReview = typeof vendorReviews.$inferInsert;
