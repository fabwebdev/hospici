// middleware/rls.middleware.ts
// Row-Level Security (RLS) context injection
// CRITICAL: Uses parameterized set_config - NEVER use string interpolation

import type { FastifyInstance, FastifyRequest } from "fastify";
import { sql } from "drizzle-orm";
import { db } from "@/db/client.js";

// Extend Fastify request type to include user context
declare module "fastify" {
	interface FastifyRequest {
		user?: {
			id: string;
			role: string;
			locationId: string;
			locationIds: string[];
		};
		locationId?: string;
	}
}

/**
 * Register RLS middleware on Fastify instance
 * Injects user context into PostgreSQL session for RLS policies
 */
export function registerRLSMiddleware(fastify: FastifyInstance) {
	// Hook runs before handlers to set RLS context
	fastify.addHook("preHandler", async (request: FastifyRequest) => {
		// Skip RLS for public routes
		if (request.url.startsWith("/health") || request.url.startsWith("/docs")) {
			return;
		}

		// TODO (Tier 1): Extract userId/locationId/role from the verified
		// Better Auth JWT/session — never from client-controlled headers.
		// Until Better Auth is wired, this is limited to development only.
		if (process.env.NODE_ENV !== "development") {
			// Prevent header-forgery attack in non-dev environments.
			// This path must not be reachable until JWT extraction is implemented.
			throw new Error(
				"RLS_NOT_IMPLEMENTED: RLS context must be extracted from a verified " +
					"JWT/session before running outside development. See Tier 1 tasks.",
			);
		}

		// ⚠️  DEV ONLY — header-based RLS context. Never reaches production (guard above).
		const userId = request.headers["x-user-id"] as string;
		const locationId = request.headers["x-location-id"] as string;
		const role = request.headers["x-user-role"] as string;

		if (!userId || !locationId) {
			// No RLS context for unauthenticated requests
			// Authentication middleware will reject these
			return;
		}

		// Store in request for later use
		request.user = {
			id: userId,
			role: role || "unknown",
			locationId,
			locationIds: [locationId], // Simplified - would come from session
		};
		request.locationId = locationId;

		// ✅ CORRECT: Parameterized set_config via sql template tag
		// This is SAFE from SQL injection
		await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
		await db.execute(
			sql`SELECT set_config('app.current_location_id', ${locationId}, true)`,
		);
		await db.execute(sql`SELECT set_config('app.current_role', ${role || "unknown"}, true)`);
	});

	// Cleanup hook (optional, for logging/audit)
	fastify.addHook("onResponse", async (request) => {
		// Could log RLS context usage here for audit purposes
		request.log.debug(
			{ userId: request.user?.id, locationId: request.locationId },
			"RLS context used for request",
		);
	});
}

/**
 * Middleware to require specific roles for a route
 */
export function requireRoles(...allowedRoles: string[]) {
	return async (request: FastifyRequest) => {
		if (!request.user) {
			throw new Error("Unauthorized");
		}
		if (!allowedRoles.includes(request.user.role)) {
			throw new Error("Forbidden: Insufficient permissions");
		}
	};
}
