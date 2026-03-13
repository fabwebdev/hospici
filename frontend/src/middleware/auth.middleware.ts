// middleware/auth.middleware.ts
// Authentication middleware for TanStack Start — reads Better Auth session cookie

import type { HospiciSession } from "@/lib/auth.server.js";
import { authClient, parseHospiciSession } from "@/lib/auth.server.js";
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

/**
 * Auth middleware — validates the session cookie via the Better Auth backend.
 *
 * Sets context.session to the HospiciSession when authenticated, or null when not.
 * The route-level guard in _authed.tsx redirects unauthenticated users to /login.
 *
 * Usage: .middleware([authMiddleware])
 */
export const authMiddleware = createMiddleware().server(async ({ next }) => {
  const cookieHeader = getRequestHeader("cookie") ?? "";

  const { data: baSession } = await authClient.getSession({
    fetchOptions: { headers: { cookie: cookieHeader } },
  });

  // Single next() call with consistent union type avoids TS inference issues
  const session: HospiciSession | null = baSession ? parseHospiciSession(baSession) : null;

  return next({ context: { session } });
});
