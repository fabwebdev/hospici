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
	// NOTE (T1-3): Header-based RLS injection will be removed once JWT claims are wired.
	// Guards here handle unauthenticated routes where session may be null.
	.server(async ({ next, context }) => {
		const session = context?.session ?? null;
		const backendHeaders: Record<string, string> = {
			"X-Request-ID": crypto.randomUUID(),
			...(session
				? {
						"X-User-ID": session.userId,
						"X-User-Role": session.role,
						"X-Location-ID": session.locationId,
					}
				: {}),
		};

		return next({
			context: {
				...(context ?? {}),
				backendHeaders,
			},
		});
	});
