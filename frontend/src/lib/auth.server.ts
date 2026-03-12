/**
 * Better Auth client — server-side only.
 *
 * Used in server functions and auth middleware to communicate with the
 * backend Better Auth handler at /api/v1/auth/*.
 *
 * Never import this file from client components.
 */

import { createAuthClient } from "better-auth/client";
import { twoFactorClient } from "better-auth/client/plugins";
import { env } from "@/lib/env.server.js";

export const authClient = createAuthClient({
	baseURL: `${env.apiUrl}/api/v1/auth`,
	plugins: [twoFactorClient()],
});

/**
 * Hospici-specific session shape derived from Better Auth session + abacAttributes.
 * This is what authMiddleware and getCurrentSessionFn return.
 */
export type HospiciSession = {
	userId: string;
	role: string;
	/** Primary working location for this session */
	locationId: string;
	locationIds: string[];
	permissions: string[];
	breakGlass: boolean;
	twoFactorEnabled: boolean;
	expiresAt: number; // Unix timestamp (ms)
};

/**
 * Parse the raw Better Auth session into a HospiciSession.
 * abacAttributes is stored as a JSON string on the user object.
 */
export function parseHospiciSession(session: {
	session: { expiresAt: Date };
	user: {
		id: string;
		abacAttributes?: unknown;
		twoFactorEnabled?: unknown;
	};
}): HospiciSession {
	const raw = session.user.abacAttributes;
	const abac =
		typeof raw === "string"
			? (JSON.parse(raw) as {
					locationIds: string[];
					role: string;
					permissions: string[];
				})
			: { locationIds: [] as string[], role: "clinician", permissions: [] as string[] };

	return {
		userId: session.user.id,
		role: abac.role,
		locationId: abac.locationIds[0] ?? "",
		locationIds: abac.locationIds,
		permissions: abac.permissions,
		breakGlass: false,
		twoFactorEnabled: session.user.twoFactorEnabled === true,
		expiresAt: session.session.expiresAt.getTime(),
	};
}
