/**
 * Billing Routes — NOE, Benefit Periods, Claims
 * Base prefix: /api/v1/billing  (registered in server.ts)
 * TODO (T3-2): Implement NOE/NOTR workflow.
 */

import type { FastifyInstance } from "fastify";

export default async function billingRoutes(fastify: FastifyInstance): Promise<void> {
	fastify.get(
		"/",
		{
			schema: {
				tags: ["Billing"],
				summary: "Billing routes health check",
				response: { 501: { type: "object" } },
			},
		},
		async (_request, reply) => {
			reply.code(501).send({
				success: false,
				error: { code: "NOT_IMPLEMENTED", message: "Billing routes not yet implemented (T3-2)" },
			});
		},
	);
}
