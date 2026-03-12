/**
 * Alert Routes — compliance alert dashboard + billing alert stub.
 *
 * Base prefix: /api/v1/alerts  (registered in server.ts)
 *
 * Endpoints:
 *   GET   /alerts/compliance          — operational alerts (NOE, IDG, AIDE, HOPE, etc.)
 *   GET   /alerts/billing             — billing alerts (returns [] until T3-7)
 *   PATCH /alerts/:id/status          — acknowledge / assign / snooze / resolve
 *
 * Hook order (CLAUDE.md §2.4):
 *   preValidation → TypeBox AOT
 *   preHandler    → RLS context (registerRLSMiddleware runs globally)
 *   handler       → AlertService
 *
 * Socket.IO: emits compliance:alert:updated after PATCH /status.
 */

import { Validators } from "@/config/typebox-compiler.js";
import {
	AlertListResponseSchema,
	AlertStatusPatchBodySchema,
	type AlertListQueryType,
	type AlertStatusPatchBodyType,
} from "@/contexts/compliance/schemas/alert.schema.js";
import { AlertService, AlertNotFoundError, AlertSnoozeError } from "@/contexts/compliance/services/alert.service.js";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";

const AlertIdParamsSchema = {
	type: "object",
	properties: { id: { type: "string", format: "uuid" } },
	required: ["id"],
} as const;

const AlertListQueryStringSchema = {
	type: "object",
	properties: {
		status: { type: "string", enum: ["new", "acknowledged", "assigned", "resolved"] },
		type: {
			type: "string",
			enum: [
				"NOE_DEADLINE",
				"NOTR_DEADLINE",
				"IDG_OVERDUE",
				"AIDE_SUPERVISION_OVERDUE",
				"AIDE_SUPERVISION_UPCOMING",
				"HOPE_WINDOW_CLOSING",
				"F2F_REQUIRED",
				"CAP_THRESHOLD",
				"BENEFIT_PERIOD_EXPIRING",
				"RECERTIFICATION_DUE",
				"NOTE_REVIEW_REQUIRED",
				"NOTE_INCOMPLETE",
				"NOTE_OVERDUE_REVIEW",
			],
		},
		assignedTo: { type: "string", format: "uuid" },
		severity: { type: "string", enum: ["critical", "warning", "info"] },
	},
	additionalProperties: false,
} as const;

export default async function alertRoutes(fastify: FastifyInstance): Promise<void> {
	const alertService = new AlertService(fastify.valkey);

	// ── GET /alerts/compliance ─────────────────────────────────────────────────

	fastify.get(
		"/compliance",
		{
			schema: {
				tags: ["Compliance Alerts"],
				summary: "List operational compliance alerts for the calling user's location",
				querystring: AlertListQueryStringSchema,
				response: { 200: AlertListResponseSchema },
			},
		},
		async (request, reply) => {
			const user = request.user!;
			const query = request.query as AlertListQueryType;
			const response = await alertService.listAlerts(user, {
				...(query.status ? { status: query.status } : {}),
				...(query.type ? { type: query.type } : {}),
				...(query.assignedTo ? { assignedTo: query.assignedTo } : {}),
				...(query.severity ? { severity: query.severity } : {}),
			});

			return reply.send(response);
		},
	);

	// ── GET /alerts/billing ────────────────────────────────────────────────────
	// Stub — billing alert types are implemented in T3-12.

	fastify.get(
		"/billing",
		{
			schema: {
				tags: ["Compliance Alerts"],
				summary: "List billing alerts (implemented in T3-12)",
				response: {
					200: Type.Object({
						data: Type.Array(Type.Object({})),
						total: Type.Integer(),
					}),
				},
			},
		},
		async (_request, reply) => {
			return reply.send({ data: [], total: 0 });
		},
	);

	// ── PATCH /alerts/:id/status ───────────────────────────────────────────────

	fastify.patch(
		"/:id/status",
		{
			schema: {
				tags: ["Compliance Alerts"],
				summary: "Update alert status (acknowledge / assign / snooze / resolve)",
				params: AlertIdParamsSchema,
				body: AlertStatusPatchBodySchema,
			},
			preValidation: [
				async (request, reply) => {
					if (!Validators.AlertStatusPatchBody.Check(request.body)) {
						return reply.code(400).send({
							error: {
								message: "Invalid alert status patch body",
								errors: [...Validators.AlertStatusPatchBody.Errors(request.body)].map(
									(e) => ({ path: e.path, message: e.message }),
								),
							},
						});
					}
				},
			],
		},
		async (request, reply) => {
			const user = request.user!;
			const { id } = request.params as { id: string };
			const body = request.body as AlertStatusPatchBodyType;

			try {
				let alert;

				if (body.status === "resolved") {
					alert = await alertService.resolveAlert(id, user);
				} else if (body.status === "assigned" && body.assignedTo) {
					alert = await alertService.assignAlert(id, body.assignedTo, user);
				} else if (body.snoozedUntil) {
					alert = await alertService.snoozeAlert(id, body.snoozedUntil, user);
				} else if (body.status === "acknowledged") {
					alert = await alertService.acknowledgeAlert(id, user);
				} else {
					alert = await alertService.acknowledgeAlert(id, user);
				}

				// Emit Socket.IO event to the location room
				fastify.io.to(`location:${user.locationId}`).emit("compliance:alert:updated", {
					alertId: alert.id,
					type: alert.type,
					status: alert.status,
					patientId: alert.patientId,
					updatedBy: user.id,
				});

				return reply.send(alert);
			} catch (err) {
				if (err instanceof AlertSnoozeError) {
					return reply.code(422).send({ error: { message: err.message, code: "HARD_BLOCK_NO_SNOOZE" } });
				}
				if (err instanceof AlertNotFoundError) {
					return reply.code(404).send({ error: { message: err.message } });
				}
				throw err;
			}
		},
	);
}
