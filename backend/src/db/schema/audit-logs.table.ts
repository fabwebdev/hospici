import { customType, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { locations } from "./locations.table.js";
import { users } from "./users.table.js";

/**
 * Custom inet type — PostgreSQL inet for IP addresses.
 * Drizzle does not expose inet natively; we declare it here.
 */
const inet = customType<{ data: string }>({
  dataType() {
    return "inet";
  },
});

/**
 * audit_logs is a partitioned table (PARTITION BY RANGE timestamp).
 * Drizzle manages schema typing only; partitioning is handled in migrations.
 * NEVER add UPDATE or DELETE RLS policies to this table.
 */
export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id),
  userRole: varchar("user_role", { length: 50 }).notNull(),
  locationId: uuid("location_id")
    .references(() => locations.id)
    .notNull(),
  action: varchar("action", { length: 50 }).notNull(),
  resourceType: varchar("resource_type", { length: 100 }).notNull(),
  resourceId: uuid("resource_id").notNull(),
  ipAddress: inet("ip_address"),
  userAgent: text("user_agent"),
  timestamp: timestamp("timestamp", { withTimezone: true }).defaultNow(),
  details: jsonb("details"),
});
