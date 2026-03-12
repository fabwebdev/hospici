/**
 * Identity Routes — Authentication & User Management
 * Base prefix: /api/v1/auth  (registered in server.ts)
 * TODO (T1-1): Implement Better Auth routes.
 */

import type { FastifyInstance } from "fastify";

export default async function identityRoutes(fastify: FastifyInstance): Promise<void> {
	fastify.get(
		"/",
		{
			schema: {
				tags: ["Identity"],
				summary: "Identity routes health check",
				response: { 501: { type: "object" } },
			},
		},
		async (_request, reply) => {
			reply.code(501).send({
				success: false,
				error: { code: "NOT_IMPLEMENTED", message: "Identity routes not yet implemented (T1-1)" },
			});
		},
	);
}
