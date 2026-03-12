/**
 * Identity / Auth Routes — Better Auth handler
 *
 * All /api/v1/auth/* paths are forwarded to Better Auth.
 * This includes:
 *   POST /api/v1/auth/sign-in/email
 *   POST /api/v1/auth/sign-up/email
 *   POST /api/v1/auth/sign-out
 *   GET  /api/v1/auth/get-session
 *   POST /api/v1/auth/two-factor/enable
 *   POST /api/v1/auth/two-factor/verify-totp
 *   POST /api/v1/auth/two-factor/disable
 *   POST /api/v1/auth/two-factor/generate-backup-codes
 *   ... (all endpoints provided by the twoFactor plugin)
 */

import { auth } from "@/config/auth.config.js";
import type { FastifyInstance } from "fastify";

export default async function authRoutes(fastify: FastifyInstance): Promise<void> {
  // Delegate all auth routes to Better Auth.
  // We build a Web API Request from Fastify's parsed request and pass it
  // directly to auth.handler, then forward the Web API Response back.
  // This pattern avoids raw stream consumption conflicts with Fastify's body parser.
  fastify.route({
    method: ["DELETE", "GET", "OPTIONS", "PATCH", "POST", "PUT"],
    url: "/*",
    // Disable Fastify's default JSON schema validation — Better Auth owns the schemas here
    schema: { hide: true },
    async handler(request, reply) {
      const protocol =
        (request.headers["x-forwarded-proto"] as string) || (env_isProd() ? "https" : "http");
      const host = request.headers.host ?? "localhost";
      const url = new URL(request.url, `${protocol}://${host}`);

      // Build Web API headers
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
          for (const v of value) headers.append(key, v);
        } else {
          headers.set(key, value);
        }
      }

      // Build Web API Request body (only for non-idempotent methods)
      const hasBody = request.method !== "GET" && request.method !== "HEAD";
      let body: string | undefined;
      if (hasBody && request.body != null) {
        body = typeof request.body === "string" ? request.body : JSON.stringify(request.body);
      }

      const webRequest = new Request(url, {
        method: request.method,
        headers,
        ...(body != null ? { body } : {}),
      });

      // Invoke Better Auth
      const response = await auth.handler(webRequest);

      // Forward status + headers
      reply.status(response.status);
      response.headers.forEach((value, key) => {
        // Skip content-encoding — Fastify manages its own compression
        if (key.toLowerCase() !== "content-encoding") {
          reply.header(key, value);
        }
      });

      // Forward body
      if (response.body != null) {
        const buffer = Buffer.from(await response.arrayBuffer());
        reply.send(buffer);
      } else {
        reply.send(null);
      }
    },
  });
}

// Avoids importing the env module at the top level (circular-import safety)
function env_isProd(): boolean {
  return process.env.NODE_ENV === "production";
}
