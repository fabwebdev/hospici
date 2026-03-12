import { boolean, jsonb, pgTable, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Better Auth required fields
  name: varchar("name", { length: 255 }).notNull().default(""),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: varchar("image", { length: 500 }),
  // Hospici ABAC fields
  abacAttributes: jsonb("abac_attributes")
    .notNull()
    .default({ locationIds: [], role: "clinician", permissions: [] }),
  isActive: boolean("is_active").notNull().default(true),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  // Two-factor auth (managed by twoFactor plugin — added here so RLS/queries work)
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
