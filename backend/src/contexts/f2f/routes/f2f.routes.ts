/**
 * F2F Routes — T3-2b
 *
 * Patient-scoped (registered at /api/v1/patients):
 *   POST /patients/:patientId/f2f          — create F2F encounter
 *   GET  /patients/:patientId/f2f          — list F2F encounters for patient
 *
 * Standalone (registered at /api/v1):
 *   PATCH /f2f/:id                         — update F2F encounter
 *   POST  /f2f/:id/validate                — explicit re-validation
 *   GET   /f2f/queue                       — supervisor/admin queue
 */

import { AlertService } from "@/contexts/compliance/services/alert.service.js";
import { F2FNotFoundError, F2FValidityService } from "../services/f2fValidity.service.js";
import { F2FTaskService } from "../services/f2fTask.service.js";
import { Validators } from "@/config/typebox-compiler.js";
import { db } from "@/db/client.js";
import { faceToFaceEncounters } from "@/db/schema/face-to-face-encounters.table.js";
import { benefitPeriods } from "@/db/schema/benefit-periods.table.js";
import { and, desc, eq, sql } from "drizzle-orm";
import type Valkey from "iovalkey";
import type { FastifyInstance } from "fastify";
import type { CreateF2FBody, PatchF2FBody } from "../schemas/f2f.schema.js";

export async function f2fPatientRoutes(
	fastify: FastifyInstance,
	opts: { valkey: Valkey },
): Promise<void> {
	const alertService = new AlertService(opts.valkey);
	const validityService = new F2FValidityService(fastify.log, alertService);
	const taskService = new F2FTaskService(fastify.log, opts.valkey);

	// POST /patients/:patientId/f2f — create F2F encounter
	fastify.post<{ Params: { patientId: string } }>(
		"/:patientId/f2f",
		{
			preValidation: [
				async (req) => {
					if (!Validators.CreateF2FBody.Check(req.body)) {
						throw fastify.httpErrors.badRequest("Invalid F2F encounter body");
					}
				},
			],
		},
		async (req, reply) => {
			const { patientId } = req.params;
			const body = req.body as CreateF2FBody;
			const session = req.session as { userId: string; locationId: string };

			await db.execute(sql`SELECT set_config('app.current_user_id', ${session.userId}, true)`);
			await db.execute(
				sql`SELECT set_config('app.current_location_id', ${session.locationId}, true)`,
			);

			// Verify period exists and belongs to this patient
			const [period] = await db
				.select()
				.from(benefitPeriods)
				.where(
					and(
						eq(benefitPeriods.id, body.benefitPeriodId),
						eq(benefitPeriods.patientId, patientId),
					),
				);

			if (!period) {
				throw fastify.httpErrors.notFound("Benefit period not found for this patient");
			}

			const [encounter] = await db
				.insert(faceToFaceEncounters)
				.values({
					patientId,
					locationId: session.locationId,
					benefitPeriodId: body.benefitPeriodId,
					f2fDate: body.f2fDate,
					f2fProviderId: body.f2fProviderId,
					f2fProviderNpi: body.f2fProviderNpi,
					f2fProviderRole: body.f2fProviderRole,
					encounterSetting: body.encounterSetting,
					clinicalFindings: body.clinicalFindings,
				})
				.returning();

			if (!encounter) {
				throw fastify.httpErrors.internalServerError("Failed to insert F2F encounter");
			}

			// Auto-run validity engine
			const validity = await validityService.validate(
				encounter.id,
				session.userId,
				session.locationId,
			);

			// If a physician task exists for this period, mark it signed
			if (validity.isValid) {
				const taskRows = await db
					.select({ physicianTaskId: faceToFaceEncounters.physicianTaskId })
					.from(faceToFaceEncounters)
					.where(
						and(
							eq(faceToFaceEncounters.benefitPeriodId, body.benefitPeriodId),
							eq(faceToFaceEncounters.patientId, patientId),
						),
					)
					.limit(1);

				const physicianTaskId = taskRows[0]?.physicianTaskId;
				if (physicianTaskId) {
					await taskService.markTaskSigned(
						physicianTaskId,
						session.userId,
						session.locationId,
					);
				}
			}

			return reply.code(201).send({
				...encounter,
				validity,
				periodNumber: period.periodNumber,
				periodType: period.periodType,
			});
		},
	);

	// GET /patients/:patientId/f2f — list all F2F encounters for patient
	fastify.get<{ Params: { patientId: string } }>(
		"/:patientId/f2f",
		async (req, reply) => {
			const { patientId } = req.params;
			const session = req.session as { userId: string; locationId: string };

			await db.execute(sql`SELECT set_config('app.current_user_id', ${session.userId}, true)`);
			await db.execute(
				sql`SELECT set_config('app.current_location_id', ${session.locationId}, true)`,
			);

			const encounters = await db
				.select({
					encounter: faceToFaceEncounters,
					periodNumber: benefitPeriods.periodNumber,
					periodType: benefitPeriods.periodType,
				})
				.from(faceToFaceEncounters)
				.innerJoin(
					benefitPeriods,
					eq(faceToFaceEncounters.benefitPeriodId, benefitPeriods.id),
				)
				.where(eq(faceToFaceEncounters.patientId, patientId))
				.orderBy(desc(faceToFaceEncounters.f2fDate));

			return reply.send({
				encounters: encounters.map(({ encounter, periodNumber, periodType }) => ({
					...encounter,
					periodNumber,
					periodType,
				})),
				total: encounters.length,
			});
		},
	);
}

export async function f2fStandaloneRoutes(
	fastify: FastifyInstance,
	opts: { valkey: Valkey },
): Promise<void> {
	const alertService = new AlertService(opts.valkey);
	const validityService = new F2FValidityService(fastify.log, alertService);

	// PATCH /f2f/:id — update F2F encounter; re-runs validity engine
	fastify.patch<{ Params: { id: string } }>(
		"/f2f/:id",
		{
			preValidation: [
				async (req) => {
					if (!Validators.PatchF2FBody.Check(req.body)) {
						throw fastify.httpErrors.badRequest("Invalid patch body");
					}
				},
			],
		},
		async (req, reply) => {
			const { id } = req.params;
			const body = req.body as PatchF2FBody;
			const session = req.session as { userId: string; locationId: string };

			await db.execute(sql`SELECT set_config('app.current_user_id', ${session.userId}, true)`);
			await db.execute(
				sql`SELECT set_config('app.current_location_id', ${session.locationId}, true)`,
			);

			const [existing] = await db
				.select()
				.from(faceToFaceEncounters)
				.where(eq(faceToFaceEncounters.id, id));

			if (!existing) throw fastify.httpErrors.notFound("F2F encounter not found");

			const updates: Partial<typeof faceToFaceEncounters.$inferInsert> = {};
			if (body.f2fDate !== undefined) updates.f2fDate = body.f2fDate;
			if (body.f2fProviderId !== undefined) updates.f2fProviderId = body.f2fProviderId;
			if (body.f2fProviderNpi !== undefined) updates.f2fProviderNpi = body.f2fProviderNpi;
			if (body.f2fProviderRole !== undefined) updates.f2fProviderRole = body.f2fProviderRole;
			if (body.encounterSetting !== undefined) updates.encounterSetting = body.encounterSetting;
			if (body.clinicalFindings !== undefined) updates.clinicalFindings = body.clinicalFindings;

			await db
				.update(faceToFaceEncounters)
				.set({ ...updates, updatedAt: new Date() })
				.where(eq(faceToFaceEncounters.id, id));

			const validity = await validityService.validate(id, session.userId, session.locationId);

			const [updated] = await db
				.select()
				.from(faceToFaceEncounters)
				.where(eq(faceToFaceEncounters.id, id));
			return reply.send({ ...updated, validity });
		},
	);

	// POST /f2f/:id/validate — explicit re-validation
	fastify.post<{ Params: { id: string } }>("/f2f/:id/validate", async (req, reply) => {
		const { id } = req.params;
		const session = req.session as { userId: string; locationId: string };

		try {
			const result = await validityService.validate(id, session.userId, session.locationId);
			return reply.send(result);
		} catch (err) {
			if (err instanceof F2FNotFoundError) throw fastify.httpErrors.notFound(err.message);
			throw err;
		}
	});

	// GET /f2f/queue — supervisor/admin queue
	fastify.get("/f2f/queue", async (req, reply) => {
		const session = req.session as {
			userId: string;
			locationId: string;
			role: string;
		};
		const allowedRoles = ["supervisor", "admin", "super_admin", "compliance_officer"];

		if (!allowedRoles.includes(session.role)) {
			throw fastify.httpErrors.forbidden("Insufficient role for F2F queue");
		}

		await db.execute(sql`SELECT set_config('app.current_user_id', ${session.userId}, true)`);
		await db.execute(
			sql`SELECT set_config('app.current_location_id', ${session.locationId}, true)`,
		);

		// Get all active periods with period_number >= 3 in this location
		const periods = await db
			.select({
				period: benefitPeriods,
				encounter: faceToFaceEncounters,
			})
			.from(benefitPeriods)
			.leftJoin(
				faceToFaceEncounters,
				and(
					eq(faceToFaceEncounters.benefitPeriodId, benefitPeriods.id),
					eq(faceToFaceEncounters.isValidForRecert, true),
				),
			)
			.where(
				and(
					eq(benefitPeriods.isActive, true),
					sql`${benefitPeriods.periodNumber} >= 3`,
				),
			);

		// Group by period and keep the valid encounter if present
		const periodMap = new Map<string, (typeof periods)[0]>();
		for (const row of periods) {
			const existing = periodMap.get(row.period.id);
			if (!existing || (row.encounter && !existing.encounter)) {
				periodMap.set(row.period.id, row);
			}
		}

		const now = new Date();
		const items = Array.from(periodMap.values()).map(({ period, encounter }) => {
			const recertDate = new Date(period.endDate);
			const daysUntilRecert = Math.ceil(
				(recertDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
			);

			const f2fStatus: "valid" | "invalid" | "missing" = encounter ? "valid" : "missing";

			return {
				patientId: period.patientId,
				patientName: "[PHI]",
				periodNumber: period.periodNumber,
				periodType: period.periodType,
				startDate: period.startDate,
				endDate: period.endDate,
				recertDate: period.endDate,
				daysUntilRecert,
				f2fStatus,
				lastF2FDate: encounter?.f2fDate ?? undefined,
				assignedPhysicianId: period.f2fPhysicianId ?? undefined,
			};
		});

		return reply.send({ items, total: items.length });
	});
}
