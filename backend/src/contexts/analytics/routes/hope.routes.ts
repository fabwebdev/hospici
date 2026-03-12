/**
 * HOPE Routes — Hospice Outcomes and Patient Evaluation
 *
 * REST endpoints for HOPE assessment CRUD and iQIES submission.
 * All routes require authenticated session + RLS context (preHandler).
 *
 * Base prefix: /api/v1/hope  (registered in server.ts)
 *
 * Endpoints:
 *   POST   /hope/admission              — Create HOPE-A assessment
 *   POST   /hope/update-visit           — Create HOPE-UV assessment
 *   POST   /hope/discharge              — Create HOPE-D assessment
 *   GET    /hope/assessments            — List assessments for location (paginated)
 *   GET    /hope/assessments/:id        — Get single assessment
 *   PATCH  /hope/assessments/:id/status — Update status (complete → submitted)
 *   POST   /hope/assessments/:id/submit — Queue for iQIES submission
 *   GET    /hope/reporting-periods      — List HQRP reporting periods
 *   GET    /hope/quality-measures       — Current period quality measure rates
 *
 * TODO (Phase 3): Implement handlers after DB tables and HOPEService are wired.
 */

import type { FastifyInstance } from "fastify";
import { Type } from "@sinclair/typebox";
import {
	HOPEAdmissionSchema,
	HOPEUpdateVisitSchema,
	HOPEDischargeAssessmentSchema,
} from "@/contexts/analytics/schemas";
import { Validators } from "@/config/typebox-compiler";

const ErrorResponseSchema = Type.Object({
	success: Type.Boolean(),
	error: Type.Object({
		code: Type.String(),
		message: Type.String(),
		details: Type.Optional(
			Type.Array(Type.Object({ path: Type.String(), message: Type.String() })),
		),
	}),
});

export default async function hopeRoutes(fastify: FastifyInstance): Promise<void> {
	// -------------------------------------------------------------------------
	// POST /hope/admission — Create HOPE-A assessment
	// -------------------------------------------------------------------------
	fastify.post(
		"/admission",
		{
			schema: {
				tags: ["HOPE"],
				summary: "Create HOPE-A (Admission) assessment",
				description:
					"Creates a HOPE-A assessment. Must be completed within 7 calendar days of hospice election. Effective 2025-10-01, replaces HIS-A.",
				body: HOPEAdmissionSchema,
				response: {
					201: HOPEAdmissionSchema,
					400: ErrorResponseSchema,
					501: ErrorResponseSchema,
				},
			},
			preValidation: async (request, reply) => {
				if (!Validators.HOPEAdmission.Check(request.body)) {
					const errors = [...Validators.HOPEAdmission.Errors(request.body)];
					reply.code(400).send({
						success: false,
						error: {
							code: "VALIDATION_ERROR",
							message: "HOPE-A assessment validation failed",
							details: errors.map((e) => ({ path: e.path, message: e.message })),
						},
					});
				}
			},
		},
		async (_request, reply) => {
			// TODO (Phase 3): call HOPEService.createAdmissionAssessment()
			reply.code(501).send({
				success: false,
				error: { code: "NOT_IMPLEMENTED", message: "HOPE-A route not yet implemented (Phase 3)" },
			});
		},
	);

	// -------------------------------------------------------------------------
	// POST /hope/update-visit — Create HOPE-UV assessment
	// -------------------------------------------------------------------------
	fastify.post(
		"/update-visit",
		{
			schema: {
				tags: ["HOPE"],
				summary: "Create HOPE-UV (Update Visit) assessment",
				body: HOPEUpdateVisitSchema,
				response: {
					201: HOPEUpdateVisitSchema,
					400: ErrorResponseSchema,
					501: ErrorResponseSchema,
				},
			},
			preValidation: async (request, reply) => {
				if (!Validators.HOPEUpdateVisit.Check(request.body)) {
					const errors = [...Validators.HOPEUpdateVisit.Errors(request.body)];
					reply.code(400).send({
						success: false,
						error: {
							code: "VALIDATION_ERROR",
							message: "HOPE-UV assessment validation failed",
							details: errors.map((e) => ({ path: e.path, message: e.message })),
						},
					});
				}
			},
		},
		async (_request, reply) => {
			reply.code(501).send({
				success: false,
				error: { code: "NOT_IMPLEMENTED", message: "HOPE-UV route not yet implemented (Phase 3)" },
			});
		},
	);

	// -------------------------------------------------------------------------
	// POST /hope/discharge — Create HOPE-D assessment
	// -------------------------------------------------------------------------
	fastify.post(
		"/discharge",
		{
			schema: {
				tags: ["HOPE"],
				summary: "Create HOPE-D (Discharge) assessment",
				description:
					"Creates a HOPE-D assessment. Must be completed within 7 calendar days of discharge or death.",
				body: HOPEDischargeAssessmentSchema,
				response: {
					201: HOPEDischargeAssessmentSchema,
					400: ErrorResponseSchema,
					501: ErrorResponseSchema,
				},
			},
			preValidation: async (request, reply) => {
				if (!Validators.HOPEDischarge.Check(request.body)) {
					const errors = [...Validators.HOPEDischarge.Errors(request.body)];
					reply.code(400).send({
						success: false,
						error: {
							code: "VALIDATION_ERROR",
							message: "HOPE-D assessment validation failed",
							details: errors.map((e) => ({ path: e.path, message: e.message })),
						},
					});
				}
			},
		},
		async (_request, reply) => {
			reply.code(501).send({
				success: false,
				error: { code: "NOT_IMPLEMENTED", message: "HOPE-D route not yet implemented (Phase 3)" },
			});
		},
	);

	// -------------------------------------------------------------------------
	// GET /hope/assessments — List assessments
	// -------------------------------------------------------------------------
	fastify.get(
		"/assessments",
		{
			schema: {
				tags: ["HOPE"],
				summary: "List HOPE assessments for current location",
				querystring: {
					type: "object",
					properties: {
						patientId: { type: "string", format: "uuid" },
						assessmentType: { type: "string", enum: ["01", "02", "03"] },
						status: { type: "string" },
						page: { type: "integer", minimum: 1, default: 1 },
						limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
					},
				},
			},
		},
		async (_request, reply) => {
			reply.code(501).send({
				success: false,
				error: { code: "NOT_IMPLEMENTED", message: "HOPE list route not yet implemented (Phase 3)" },
			});
		},
	);

	// -------------------------------------------------------------------------
	// POST /hope/assessments/:id/submit — Queue for iQIES submission
	// -------------------------------------------------------------------------
	fastify.post(
		"/assessments/:id/submit",
		{
			schema: {
				tags: ["HOPE"],
				summary: "Queue HOPE assessment for iQIES submission",
				description:
					"Enqueues the completed assessment to the hope-submission BullMQ queue for async iQIES submission.",
				params: {
					type: "object",
					properties: {
						id: { type: "string", format: "uuid" },
					},
					required: ["id"],
				},
			},
		},
		async (_request, reply) => {
			reply.code(501).send({
				success: false,
				error: { code: "NOT_IMPLEMENTED", message: "HOPE submission queue not yet implemented (Phase 3)" },
			});
		},
	);

	// -------------------------------------------------------------------------
	// GET /hope/quality-measures — Current quality measure rates
	// -------------------------------------------------------------------------
	fastify.get(
		"/quality-measures",
		{
			schema: {
				tags: ["HOPE"],
				summary: "Get HQRP quality measure rates for current reporting period",
				description:
					"Returns NQF #3235, #3633, #3634 rates and HCI composite score. Used for internal compliance dashboard.",
			},
		},
		async (_request, reply) => {
			reply.code(501).send({
				success: false,
				error: { code: "NOT_IMPLEMENTED", message: "HOPE quality measures not yet implemented (Phase 3)" },
			});
		},
	);
}
