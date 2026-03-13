// middleware/rls.middleware.ts
// RLS context middleware — adds trace headers for backend requests

import { createMiddleware } from "@tanstack/react-start";
import { authMiddleware } from "./auth.middleware";

/**
 * RLS middleware — adds per-request trace headers.
 * Must be used after authMiddleware.
 *
 * The backend derives userId/locationId/role from the verified session cookie
 * directly via Better Auth. This middleware no longer injects those values as
 * headers to prevent client-forgery attacks (T1-3).
 */
export const rlsMiddleware = createMiddleware()
  .middleware([authMiddleware])
  .server(async ({ next, context }) => {
    return next({
      context: {
        ...(context ?? {}),
        backendHeaders: {
          "X-Request-ID": crypto.randomUUID(),
        },
      },
    });
  });
