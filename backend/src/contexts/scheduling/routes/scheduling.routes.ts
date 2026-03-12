/**
 * Scheduling Routes — IDG Meetings, Aide Supervision
 * Base prefix: /api/v1/scheduling  (registered in server.ts)
 * TODO (T2-4): Implement IDG meeting recording.
 */

import type { FastifyInstance } from "fastify";

export default async function schedulingRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    "/",
    {
      schema: {
        tags: ["Scheduling"],
        summary: "Scheduling routes health check",
        response: { 501: { type: "object" } },
      },
    },
    async (_request, reply) => {
      reply.code(501).send({
        success: false,
        error: { code: "NOT_IMPLEMENTED", message: "Scheduling routes not yet implemented (T2-4)" },
      });
    },
  );
}
