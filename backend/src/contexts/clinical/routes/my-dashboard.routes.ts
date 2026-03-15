/**
 * My Dashboard Routes — User-scoped dashboard data
 *
 * Base prefix: /api/v1/my  (registered in server.ts)
 *
 * Endpoints:
 *   GET /my/dashboard — today's schedule + last signed note for current user
 */

import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { MyDashboardResponseSchema } from "../schemas/my-dashboard.schema.js";
import { getMyDashboard } from "../services/my-dashboard.service.js";

const ErrorResponseSchema = Type.Object({
  success: Type.Boolean(),
  error: Type.Object({
    code: Type.String(),
    message: Type.String(),
  }),
});

export default async function myDashboardRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    "/dashboard",
    {
      schema: {
        tags: ["Dashboard"],
        summary: "Today's schedule and last signed note for the current user",
        response: {
          200: MyDashboardResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        const err = new Error("Unauthorized") as Error & { statusCode: number };
        err.statusCode = 401;
        throw err;
      }
      const result = await getMyDashboard(request.user);
      reply.code(200).send(result);
    },
  );
}
