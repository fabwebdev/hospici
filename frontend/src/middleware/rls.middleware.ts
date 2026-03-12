// middleware/rls.middleware.ts
// RLS context middleware - adds location/user headers for backend

import { createMiddleware } from "@tanstack/react-start";
import { authMiddleware } from "./auth.middleware";

/**
 * RLS middleware - adds backend headers for Row-Level Security
 * Must be used after authMiddleware
 * Usage: .middleware([authMiddleware, rlsMiddleware])
 */
export const rlsMiddleware = createMiddleware({ type: "function" })
	.middleware([authMiddleware])
	.server(async ({ next, context }) => {
		// Add headers that the backend uses for RLS context injection
		const backendHeaders = {
			"X-User-ID": context.session.userId,
			"X-User-Role": context.session.role,
			"X-Location-ID": context.session.locationId,
			"X-Request-ID": crypto.randomUUID(),
		};

		return next({
			context: {
				...context,
				backendHeaders,
			},
		});
	});
