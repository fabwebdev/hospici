/**
 * Patient Routes — Clinical Patient CRUD
 * Base prefix: /api/v1/patients  (registered in server.ts)
 * TODO (T2-1): Implement patient CRUD routes.
 */

import type { FastifyInstance } from "fastify";

export default async function patientRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    "/",
    {
      schema: {
        tags: ["Patients"],
        summary: "List patients",
        response: { 501: { type: "object" } },
      },
    },
    async (_request, reply) => {
      reply.code(501).send({
        success: false,
        error: { code: "NOT_IMPLEMENTED", message: "Patient routes not yet implemented (T2-1)" },
      });
    },
  );
}
