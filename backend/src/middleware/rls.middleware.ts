// middleware/rls.middleware.ts
// Row-Level Security (RLS) context injection
// CRITICAL: Uses parameterized set_config — NEVER use string interpolation

import { auth } from "@/config/auth.config.js";
import { db } from "@/db/client.js";
import { sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

// Extend Fastify request type to include verified user context
declare module "fastify" {
  interface FastifyRequest {
    user?: {
      id: string;
      role: string;
      locationId: string;
      locationIds: string[];
      permissions: string[];
      breakGlass: boolean;
    };
  }
}

/** Routes that bypass session verification and RLS entirely */
const PUBLIC_PREFIXES = ["/health", "/docs", "/api/v1/auth"];

type AbacAttributes = {
  locationIds: string[];
  role: string;
  permissions: string[];
};

function parseAbacAttributes(raw: unknown): AbacAttributes {
  const fallback: AbacAttributes = { locationIds: [], role: "clinician", permissions: [] };
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as AbacAttributes;
    } catch {
      return fallback;
    }
  }
  if (raw !== null && typeof raw === "object") {
    return raw as AbacAttributes;
  }
  return fallback;
}

/**
 * Register RLS middleware on Fastify instance.
 * Verifies the Better Auth session cookie and injects user context
 * into both the Fastify request and the PostgreSQL session (for RLS policies).
 */
export function registerRLSMiddleware(fastify: FastifyInstance) {
  fastify.addHook("preHandler", async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip session check for public routes
    if (PUBLIC_PREFIXES.some((prefix) => request.url.startsWith(prefix))) {
      return;
    }

    // Convert Node IncomingHttpHeaders → Web API Headers for Better Auth
    const headers = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const v of value) headers.append(key, v);
      } else {
        headers.set(key, value);
      }
    }

    // Verify the session cookie — direct DB call, no HTTP round-trip
    const sessionData = await auth.api.getSession({ headers });

    if (!sessionData) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }

    const { user } = sessionData;

    // HIPAA §164.312(d): TOTP must be enrolled before accessing protected resources.
    // All 2FA setup endpoints are under /api/v1/auth/* and are already bypassed above.
    if (!user.twoFactorEnabled) {
      reply.code(403).send({ error: "TOTP_ENROLLMENT_REQUIRED" });
      return;
    }

    // Extract ABAC attributes (stored as JSON string by Better Auth additional fields)
    const abac = parseAbacAttributes(user.abacAttributes);
    const userId = user.id;
    const locationId = abac.locationIds[0] ?? "";
    const role = abac.role;

    // Store verified context on the request for use by route handlers
    request.user = {
      id: userId,
      role,
      locationId,
      locationIds: abac.locationIds,
      permissions: abac.permissions,
      breakGlass: false, // Set separately via the break-glass endpoint (T1-4+)
    };

    // ✅ CORRECT: Parameterized set_config via sql template tag — safe from SQL injection
    await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    await db.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);
    await db.execute(sql`SELECT set_config('app.current_role', ${role}, true)`);
  });

  fastify.addHook("onResponse", async (request) => {
    request.log.debug(
      { userId: request.user?.id, locationId: request.user?.locationId },
      "RLS context used for request",
    );
  });
}

/**
 * Prehandler hook that enforces role-based access on a route.
 * Must be used after registerRLSMiddleware (which populates request.user).
 */
export function requireRoles(...allowedRoles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      reply.code(401).send({ error: "Unauthorized" });
      return;
    }
    if (!allowedRoles.includes(request.user.role)) {
      reply.code(403).send({ error: "Forbidden: Insufficient permissions" });
      return;
    }
  };
}
