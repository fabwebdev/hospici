/**
 * Better Auth configuration — Hospici EHR
 *
 * HIPAA compliance:
 *   §164.312(d)  — TOTP MFA enforced (not optional)
 *   §164.312(a)(2)(iii) — Automatic session expiry after 30 min idle
 *   §164.312(e)(1) — Transmission security: httpOnly cookie, SameSite=Strict
 */

import { randomUUID } from "node:crypto";
import { env } from "@/config/env.js";
import { db } from "@/db/client.js";
import { accounts, sessions, twoFactors, users, verifications } from "@/db/schema/index.js";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { twoFactor } from "better-auth/plugins";

export const auth = betterAuth({
  baseURL: env.betterAuthUrl,
  basePath: "/api/v1/auth",
  secret: env.betterAuthSecret,
  trustedOrigins: ["http://localhost:5173", "http://localhost:3000"],

  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      // Map Better Auth internal model names → our Drizzle table objects
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
      twoFactor: twoFactors,
    },
  }),

  // ── Email + Password ──────────────────────────────────────────────────────
  emailAndPassword: {
    enabled: true,
    // Email verification not enforced in initial setup; enable for production
    requireEmailVerification: false,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },

  // ── Session ──────────────────────────────────────────────────────────────
  // HIPAA §164.312(a)(2)(iii): idle session auto-logoff at 30 minutes
  // Session is refreshed (expiresAt = now + 1800s) on each request when the
  // session is older than `updateAge` seconds, implementing idle-timeout semantics.
  session: {
    expiresIn: 1800, // 30 minutes in seconds
    updateAge: 60, // Refresh session if last update > 60s ago
    cookieCache: {
      enabled: true,
      maxAge: 60, // 1-minute client-side cookie cache
    },
  },

  // ── Cookie security ───────────────────────────────────────────────────────
  // HIPAA §164.312(e)(1): prevent JS access to session cookie
  advanced: {
    useSecureCookies: env.isProd,
    cookiePrefix: "hospici",
    generateId: () => randomUUID(),
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "strict",
      secure: env.isProd,
    },
  },

  // ── Plugins ───────────────────────────────────────────────────────────────
  plugins: [
    // TOTP-based 2FA — HIPAA §164.312(d): unique user identification
    // Enforcement (block access if not enrolled) is applied via a Fastify
    // preHandler in server.ts after the session is verified (T1-3).
    twoFactor({
      issuer: "Hospici EHR",
      // Backup codes are provided in case the device is lost.
      // They are stored encrypted (pbkdf2) by Better Auth.
      backupCodes: {
        enabled: true,
        amount: 10,
        length: 10,
      },
    }),
  ],

  // ── Additional user fields ────────────────────────────────────────────────
  // Hospici-specific fields stored alongside Better Auth's standard user columns.
  user: {
    additionalFields: {
      abacAttributes: {
        type: "string",
        required: false,
        defaultValue: JSON.stringify({ locationIds: [], role: "clinician", permissions: [] }),
        // Stored as JSONB in the DB; Better Auth treats it as string
        input: false,
      },
      isActive: {
        type: "boolean",
        required: false,
        defaultValue: true,
        input: false,
      },
      twoFactorEnabled: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
});

// Export the derived session/user types for use in preHandler checks
export type AuthSession = typeof auth.$Infer.Session;
export type AuthUser = typeof auth.$Infer.Session.user;
