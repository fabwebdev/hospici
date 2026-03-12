// middleware/auth.middleware.ts
// Authentication middleware for TanStack Start

import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { redirect } from "@tanstack/react-router";

/**
 * Auth middleware - validates session and adds user context
 * Usage: .middleware([authMiddleware])
 *
 * TODO (Tier 1): Replace stub with real Better Auth session validation.
 * The session cookie is set by Better Auth on the backend; read it here
 * via the Better Auth client's `getSession()` server helper.
 */
export const authMiddleware = createMiddleware({ type: "function" }).server(
	async ({ next }) => {
		if (process.env.NODE_ENV !== "development") {
			// Better Auth session validation not yet implemented.
			// Block all non-dev traffic until Tier 1 auth is wired.
			throw new Error(
				"AUTH_NOT_IMPLEMENTED: Better Auth session validation must be " +
					"implemented before running outside development. See Tier 1 tasks.",
			);
		}

		// ⚠️  DEV ONLY — mock session. Never reaches production (guard above).
		const mockSession = {
			userId: "mock-user-id",
			role: "clinician",
			locationId: "mock-location-id",
			locationIds: ["mock-location-id"],
			permissions: ["patient.read", "patient.write"],
			breakGlass: false,
		};

		return next({
			context: {
				session: mockSession,
			},
		});
	},
);
