/**
 * Visit schedule routes — T2-10.
 *
 * GET  /api/v1/patients/:patientId/scheduled-visits
 * POST /api/v1/patients/:patientId/scheduled-visits
 * PATCH /api/v1/scheduled-visits/:visitId/status
 *
 * Registered in server.ts under /api/v1/patients (first two) and
 * /api/v1/scheduled-visits (third).
 */

import { AlertService } from "@/contexts/compliance/services/alert.service.js";
import {
  CreateScheduledVisitBodySchema,
  PatchScheduledVisitStatusBodySchema,
  ScheduledVisitListResponseSchema,
  ScheduledVisitResponseSchema,
} from "@/contexts/scheduling/schemas/visitSchedule.schema.js";
import { VisitScheduleService } from "@/contexts/scheduling/services/visitSchedule.service.js";
import type { FastifyInstance } from "fastify";

export default async function visitSchedulePatientRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new VisitScheduleService(fastify.valkey, new AlertService(fastify.valkey));

  /**
   * GET /api/v1/patients/:patientId/scheduled-visits
   * List all scheduled visits for a patient.
   */
  fastify.get(
    "/:patientId/scheduled-visits",
    {
      schema: {
        tags: ["Visit Scheduling"],
        summary: "List scheduled visits for a patient",
        params: {
          type: "object",
          properties: { patientId: { type: "string", format: "uuid" } },
          required: ["patientId"],
        },
        response: { 200: ScheduledVisitListResponseSchema },
      },
    },
    async (request, reply) => {
      const { patientId } = request.params as { patientId: string };
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const user = request.user;
      const result = await service.listVisits(patientId, user);
      reply.send(result);
    },
  );

  /**
   * POST /api/v1/patients/:patientId/scheduled-visits
   * Schedule a new visit for a patient.
   */
  fastify.post(
    "/:patientId/scheduled-visits",
    {
      schema: {
        tags: ["Visit Scheduling"],
        summary: "Schedule a new visit for a patient",
        params: {
          type: "object",
          properties: { patientId: { type: "string", format: "uuid" } },
          required: ["patientId"],
        },
        body: CreateScheduledVisitBodySchema,
        response: { 201: ScheduledVisitResponseSchema },
      },
    },
    async (request, reply) => {
      const { patientId } = request.params as { patientId: string };
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const user = request.user;
      const result = await service.createVisit(
        patientId,
        request.body as Parameters<typeof service.createVisit>[1],
        user,
      );
      reply.code(201).send(result);
    },
  );
}

export async function visitScheduleStandaloneRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new VisitScheduleService(fastify.valkey, new AlertService(fastify.valkey));

  /**
   * PATCH /api/v1/scheduled-visits/:visitId/status
   * Update the status of a scheduled visit (completed / missed / cancelled / reschedule).
   */
  fastify.patch(
    "/:visitId/status",
    {
      schema: {
        tags: ["Visit Scheduling"],
        summary: "Update visit status",
        params: {
          type: "object",
          properties: { visitId: { type: "string", format: "uuid" } },
          required: ["visitId"],
        },
        body: PatchScheduledVisitStatusBodySchema,
        response: {
          200: ScheduledVisitResponseSchema,
          404: { type: "object" },
          422: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      const { visitId } = request.params as { visitId: string };
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const user = request.user;

      try {
        const result = await service.patchStatus(
          visitId,
          request.body as Parameters<typeof service.patchStatus>[1],
          user,
        );
        reply.send(result);
      } catch (err) {
        if (err instanceof Error) {
          if (err.name === "ScheduledVisitNotFoundError") {
            reply.code(404).send({ error: { code: "NOT_FOUND", message: err.message } });
            return;
          }
          if (err.name === "InvalidVisitStatusTransitionError") {
            reply.code(422).send({ error: { code: "INVALID_TRANSITION", message: err.message } });
            return;
          }
        }
        throw err;
      }
    },
  );
}
