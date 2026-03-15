/**
 * Better Auth supporting tables.
 * These are auth-system tables (no PHI, no location_id).
 * RLS is user-scoped: a user may only see their own rows.
 * The server-side process (set_config 'app.current_user_id') drives the policies.
 */

import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
// Note: uuid import still needed for userId foreign key columns
import { users } from "./users.table.js";

// ── Sessions ─────────────────────────────────────────────────────────────────
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [index("sessions_user_id_idx").on(t.userId)],
);

// ── Accounts ─────────────────────────────────────────────────────────────────
// Stores credentials (email+password hash) and OAuth tokens per provider.
export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("accounts_user_id_idx").on(t.userId)],
);

// ── Verifications ────────────────────────────────────────────────────────────
// Short-lived tokens for email verification, password reset, etc.
export const verifications = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

// ── Two-Factor (TOTP) ─────────────────────────────────────────────────────────
// Stores encrypted TOTP secrets and encrypted backup codes per user.
// HIPAA §164.312(d): TOTP is mandatory; backupCodes stored encrypted.
export const twoFactors = pgTable(
  "two_factors",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [index("two_factors_user_id_idx").on(t.userId)],
);
