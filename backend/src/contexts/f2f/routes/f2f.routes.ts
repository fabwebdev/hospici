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

import { Validators } from "@/config/typebox-compiler.js";
import { AlertService } from "@/contexts/compliance/services/alert.service.js";
import { db } from "@/db/client.js";
import { benefitPeriods } from "@/db/schema/benefit-periods.table.js";
import { faceToFaceEncounters } from "@/db/schema/face-to-face-encounters.table.js";
import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { CreateF2FBody, PatchF2FBody } from "../schemas/f2f.schema.js";
import { F2FTaskService } from "../services/f2fTask.service.js";
import { F2FNotFoundError, F2FValidityService } from "../services/f2fValidity.service.js";

export async function f2fPatientRoutes(fastify: FastifyInstance): Promise<void> {
  const alertService = new AlertService(fastify.valkey);
  const validityService = new F2FValidityService(fastify.log, alertService);
  const taskService = new F2FTaskService(fastify.log, fastify.valkey);

  // POST /patients/:patientId/f2f — create F2F encounter
  fastify.post(
    "/:patientId/f2f",
    {
      preValidation: [
        async (req, reply) => {
          if (!Validators.CreateF2FBody.Check(req.body)) {
            reply.code(400).send({ error: "Invalid F2F encounter body" });
          }
        },
      ],
    },
    async (request, reply) => {
      const { patientId } = request.params as { patientId: string };
      const body = request.body as CreateF2FBody;
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const user = request.user;

      await db.execute(sql`SELECT set_config('app.current_user_id', ${user.id}, true)`);
      await db.execute(sql`SELECT set_config('app.current_location_id', ${user.locationId}, true)`);

      // Verify period exists and belongs to this patient
      const [period] = await db
        .select()
        .from(benefitPeriods)
        .where(
          and(eq(benefitPeriods.id, body.benefitPeriodId), eq(benefitPeriods.patientId, patientId)),
        );

      if (!period) {
        return reply.code(404).send({ error: "Benefit period not found for this patient" });
      }

      const [encounter] = await db
        .insert(faceToFaceEncounters)
        .values({
          patientId,
          locationId: user.locationId,
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
        return reply.code(500).send({ error: "Failed to insert F2F encounter" });
      }

      // Auto-run validity engine
      const validity = await validityService.validate(encounter.id, user.id, user.locationId);

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
          await taskService.markTaskSigned(physicianTaskId, user.id, user.locationId);
        }
      }

      return reply.code(201).send({
        ...encounter,
        validity,
        periodNumber: period.periodNumber,
        admissionType: period.admissionType,
      });
    },
  );

  // GET /patients/:patientId/f2f — list all F2F encounters for patient
  fastify.get("/:patientId/f2f", async (request, reply) => {
    const { patientId } = request.params as { patientId: string };
    if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
    const user = request.user;

    await db.execute(sql`SELECT set_config('app.current_user_id', ${user.id}, true)`);
    await db.execute(sql`SELECT set_config('app.current_location_id', ${user.locationId}, true)`);

    const encounters = await db
      .select({
        encounter: faceToFaceEncounters,
        periodNumber: benefitPeriods.periodNumber,
        admissionType: benefitPeriods.admissionType,
      })
      .from(faceToFaceEncounters)
      .innerJoin(benefitPeriods, eq(faceToFaceEncounters.benefitPeriodId, benefitPeriods.id))
      .where(eq(faceToFaceEncounters.patientId, patientId))
      .orderBy(desc(faceToFaceEncounters.f2fDate));

    return reply.send({
      encounters: encounters.map(({ encounter, periodNumber, admissionType }) => ({
        ...encounter,
        periodNumber,
        admissionType,
      })),
      total: encounters.length,
    });
  });
}

export async function f2fStandaloneRoutes(fastify: FastifyInstance): Promise<void> {
  const alertService = new AlertService(fastify.valkey);
  const validityService = new F2FValidityService(fastify.log, alertService);

  // PATCH /f2f/:id — update F2F encounter; re-runs validity engine
  fastify.patch(
    "/f2f/:id",
    {
      preValidation: [
        async (req, reply) => {
          if (!Validators.PatchF2FBody.Check(req.body)) {
            reply.code(400).send({ error: "Invalid patch body" });
          }
        },
      ],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = request.body as PatchF2FBody;
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const user = request.user;

      await db.execute(sql`SELECT set_config('app.current_user_id', ${user.id}, true)`);
      await db.execute(sql`SELECT set_config('app.current_location_id', ${user.locationId}, true)`);

      const [existing] = await db
        .select()
        .from(faceToFaceEncounters)
        .where(eq(faceToFaceEncounters.id, id));

      if (!existing) {
        return reply.code(404).send({ error: "F2F encounter not found" });
      }

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

      const validity = await validityService.validate(id, user.id, user.locationId);

      const [updated] = await db
        .select()
        .from(faceToFaceEncounters)
        .where(eq(faceToFaceEncounters.id, id));
      return reply.send({ ...updated, validity });
    },
  );

  // POST /f2f/:id/validate — explicit re-validation
  fastify.post("/f2f/:id/validate", async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
    const user = request.user;

    try {
      const result = await validityService.validate(id, user.id, user.locationId);
      return reply.send(result);
    } catch (err) {
      if (err instanceof F2FNotFoundError) {
        return reply.code(404).send({ error: err.message });
      }
      throw err;
    }
  });

  // GET /f2f/queue — supervisor/admin queue
  fastify.get("/f2f/queue", async (request, reply) => {
    if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
    const user = request.user;
    const allowedRoles = ["supervisor", "admin", "super_admin", "compliance_officer"];

    if (!allowedRoles.includes(user.role)) {
      return reply.code(403).send({ error: "Insufficient role for F2F queue" });
    }

    await db.execute(sql`SELECT set_config('app.current_user_id', ${user.id}, true)`);
    await db.execute(sql`SELECT set_config('app.current_location_id', ${user.locationId}, true)`);

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
          notInArray(benefitPeriods.status, ["closed", "revoked", "discharged", "transferred_out"]),
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
        admissionType: period.admissionType,
        startDate: period.startDate,
        endDate: period.endDate,
        recertDate: period.endDate,
        daysUntilRecert,
        f2fStatus,
        lastF2FDate: encounter?.f2fDate ?? undefined,
        assignedPhysicianId: period.f2fProviderId ?? undefined,
      };
    });

    return reply.send({ items, total: items.length });
  });
}
