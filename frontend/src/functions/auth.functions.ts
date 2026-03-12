// functions/auth.functions.ts
// Authentication server functions

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { redirect } from "@tanstack/react-router";

/**
 * Login server function
 * Validates credentials and establishes session
 */
// TODO (Tier 1): Replace all stubs below with real Better Auth calls.
// Better Auth client is configured in the backend; server functions here
// should call the backend auth endpoints via the internal API.
// Guard: stubs throw in non-dev environments to prevent silent auth bypass.

export const loginFn = createServerFn({ method: "POST" })
	.validator((data: { email: string; password: string }) => data)
	.handler(async ({ data }) => {
		if (process.env.NODE_ENV !== "development") {
			throw new Error(
				"AUTH_NOT_IMPLEMENTED: loginFn must be wired to Better Auth before " +
					"running outside development. See Tier 1 tasks.",
			);
		}

		// ⚠️  DEV ONLY — mock login. Never reaches production (guard above).
		if (data.email && data.password) {
			return {
				success: true,
				user: {
					id: "mock-user-id",
					email: data.email,
					role: "clinician",
					locationIds: ["mock-location-id"],
					currentLocationId: "mock-location-id",
					permissions: ["patient.read", "patient.write"],
				},
			};
		}

		return { success: false, error: "Invalid credentials" };
	});

/**
 * Logout server function
 */
export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
	// In production, this would call Better Auth signOut
	throw redirect({ to: "/login" });
});

/**
 * Get current session server function
 */
export const getCurrentSessionFn = createServerFn({ method: "GET" }).handler(
	async () => {
		if (process.env.NODE_ENV !== "development") {
			throw new Error(
				"AUTH_NOT_IMPLEMENTED: getCurrentSessionFn must be wired to Better Auth " +
					"before running outside development. See Tier 1 tasks.",
			);
		}
		// ⚠️  DEV ONLY — returns null (unauthenticated). Never reaches production (guard above).
		return null;
	},
);

/**
 * Break-glass access request
 */
export const breakGlassFn = createServerFn({ method: "POST" })
	.validator(
		(data: { patientId: string; reason: string }) => {
			if (data.reason.length < 20) {
				throw new Error("Reason must be at least 20 characters");
			}
			return data;
		},
	)
	.handler(async ({ data }) => {
		if (process.env.NODE_ENV !== "development") {
			throw new Error(
				"AUTH_NOT_IMPLEMENTED: breakGlassFn must be wired to the backend " +
					"break-glass endpoint before running outside development. See Tier 1 tasks.",
			);
		}
		// ⚠️  DEV ONLY — mock break-glass. Never reaches production (guard above).
		return {
			success: true,
			accessExpiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // 4 hours
		};
	});
