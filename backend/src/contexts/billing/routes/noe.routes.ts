/**
 * NOE/NOTR Filing Workbench Routes — T3-2a
 *
 * noePatientRoutes (registered at /api/v1/patients):
 *   POST /patients/:patientId/noe
 *   GET  /patients/:patientId/noe
 *   POST /patients/:patientId/notr
 *   GET  /patients/:patientId/notr
 *
 * noeStandaloneRoutes (registered at /api/v1):
 *   POST /noe/:id/submit
 *   POST /noe/:id/cms-response
 *   POST /noe/:id/correct
 *   POST /noe/:id/late-override
 *   GET  /noe/:id/readiness
 *   GET  /noe/:id/history
 *   POST /notr/:id/submit
 *   POST /notr/:id/cms-response
 *   POST /notr/:id/correct
 *   POST /notr/:id/late-override
 *   GET  /notr/:id/readiness
 *   GET  /notr/:id/history
 *   GET  /filings/queue
 */

import {
  CMSResponseBodySchema,
  CorrectNOEBodySchema,
  CreateNOEBodySchema,
  CreateNOTRBodySchema,
  FilingHistoryResponseSchema,
  FilingQueueQuerySchema,
  FilingQueueResponseSchema,
  LateOverrideBodySchema,
  NOEResponseSchema,
  NOEWithHistoryResponseSchema,
  NOTRResponseSchema,
  ReadinessResponseSchema,
} from "@/contexts/billing/schemas/noe.schema.js";
import {
  FilingAuthorizationError,
  InvalidFilingTransitionError,
  NOENotFoundError,
  NOEService,
  NOTRNotFoundError,
} from "@/contexts/billing/services/noe.service.js";
import { AlertService } from "@/contexts/compliance/services/alert.service.js";
import type { FastifyInstance, FastifyReply } from "fastify";

// ── UUID params schema ────────────────────────────────────────────────────────

const patientIdParams = {
  type: "object",
  properties: { patientId: { type: "string", format: "uuid" } },
  required: ["patientId"],
} as const;

const idParams = {
  type: "object",
  properties: { id: { type: "string", format: "uuid" } },
  required: ["id"],
} as const;

// ── Error reply helpers ───────────────────────────────────────────────────────

function handleFilingError(err: unknown, reply: FastifyReply): void {
  if (err instanceof NOENotFoundError || err instanceof NOTRNotFoundError) {
    reply.code(404).send({
      success: false,
      error: { code: "NOT_FOUND", message: err.message },
    });
    return;
  }
  if (err instanceof InvalidFilingTransitionError) {
    reply.code(409).send({
      success: false,
      error: { code: "INVALID_TRANSITION", message: err.message },
    });
    return;
  }
  if (err instanceof FilingAuthorizationError) {
    reply.code(403).send({
      success: false,
      error: { code: "FORBIDDEN", message: err.message },
    });
    return;
  }
  throw err;
}

// ── Patient-scoped routes ─────────────────────────────────────────────────────

export default async function noePatientRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new NOEService(fastify.valkey, fastify.log, new AlertService(fastify.valkey));

  /**
   * POST /api/v1/patients/:patientId/noe
   * Create a new Notice of Election for a patient.
   */
  fastify.post(
    "/:patientId/noe",
    {
      schema: {
        tags: ["NOE/NOTR Filing"],
        summary: "Create a Notice of Election for a patient",
        params: patientIdParams,
        body: CreateNOEBodySchema,
        response: {
          201: NOEResponseSchema,
          400: { type: "object" },
          409: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      const { patientId } = request.params as { patientId: string };
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const user = request.user;

      try {
        const result = await service.createNOE(
          patientId,
          user.locationId,
          user.id,
          request.body as Parameters<typeof service.createNOE>[3],
        );
        reply.code(201).send(result);
      } catch (err) {
        handleFilingError(err, reply);
      }
    },
  );

  /**
   * GET /api/v1/patients/:patientId/noe
   * Get the active NOE for a patient (with history).
   */
  fastify.get(
    "/:patientId/noe",
    {
      schema: {
        tags: ["NOE/NOTR Filing"],
        summary: "Get the active NOE for a patient",
        params: patientIdParams,
        response: {
          200: NOEWithHistoryResponseSchema,
          404: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      const { patientId } = request.params as { patientId: string };
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const user = request.user;

      try {
        const result = await service.getNOE(patientId, user.locationId, user.id);
        reply.send(result);
      } catch (err) {
        handleFilingError(err, reply);
      }
    },
  );

  /**
   * POST /api/v1/patients/:patientId/notr
   * Create a Notice of Termination or Revocation for a patient.
   * Requires the active NOE id in the body.
   */
  fastify.post(
    "/:patientId/notr",
    {
      schema: {
        tags: ["NOE/NOTR Filing"],
        summary: "Create a NOTR for a patient",
        params: patientIdParams,
        body: {
          ...CreateNOTRBodySchema,
          properties: {
            ...CreateNOTRBodySchema.properties,
            noeId: { type: "string", format: "uuid" },
          },
          required: [...(CreateNOTRBodySchema.required ?? []), "noeId"],
        },
        response: {
          201: NOTRResponseSchema,
          400: { type: "object" },
          404: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      const { patientId } = request.params as { patientId: string };
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const user = request.user;
      const body = request.body as Parameters<typeof service.createNOTR>[4] & { noeId: string };

      try {
        const result = await service.createNOTR(
          patientId,
          body.noeId,
          user.locationId,
          user.id,
          body,
        );
        reply.code(201).send(result);
      } catch (err) {
        handleFilingError(err, reply);
      }
    },
  );

  /**
   * GET /api/v1/patients/:patientId/notr
   * Get the active NOTR for a patient.
   */
  fastify.get(
    "/:patientId/notr",
    {
      schema: {
        tags: ["NOE/NOTR Filing"],
        summary: "Get the active NOTR for a patient",
        params: patientIdParams,
        response: {
          200: {
            type: "object",
            properties: {
              notr: NOTRResponseSchema,
              history: { type: "array" },
            },
          },
          404: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      const { patientId } = request.params as { patientId: string };
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const user = request.user;

      try {
        const result = await service.getNOTR(patientId, user.locationId, user.id);
        reply.send(result);
      } catch (err) {
        handleFilingError(err, reply);
      }
    },
  );
}

// ── Standalone routes ─────────────────────────────────────────────────────────

export async function noeStandaloneRoutes(fastify: FastifyInstance): Promise<void> {
  const service = new NOEService(fastify.valkey, fastify.log, new AlertService(fastify.valkey));

  // ── NOE standalone ───────────────────────────────────────────────────────────

  /**
   * POST /api/v1/noe/:id/submit
   */
  fastify.post(
    "/noe/:id/submit",
    {
      schema: {
        tags: ["NOE/NOTR Filing"],
        summary: "Submit a NOE to CMS",
        params: idParams,
        response: {
          200: NOEResponseSchema,
          404: { type: "object" },
          409: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const user = request.user;

      try {
        const result = await service.submitNOE(id, user.id, user.locationId);
        reply.send(result);
      } catch (err) {
        handleFilingError(err, reply);
      }
    },
  );

  /**
   * POST /api/v1/noe/:id/cms-response
   */
  fastify.post(
    "/noe/:id/cms-response",
    {
      schema: {
        tags: ["NOE/NOTR Filing"],
        summary: "Record CMS response for a NOE",
        params: idParams,
        body: CMSResponseBodySchema,
        response: {
          200: NOEResponseSchema,
          404: { type: "object" },
          409: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const user = request.user;

      try {
        const result = await service.recordCMSResponse(
          id,
          request.body as Parameters<typeof service.recordCMSResponse>[1],
          user.locationId,
        );
        reply.send(result);
      } catch (err) {
        handleFilingError(err, reply);
      }
    },
  );

  /**
   * POST /api/v1/noe/:id/correct
   */
  fastify.post(
    "/noe/:id/correct",
    {
      schema: {
        tags: ["NOE/NOTR Filing"],
        summary: "Correct a rejected or needs-correction NOE",
        params: idParams,
        body: CorrectNOEBodySchema,
        response: {
          201: NOEResponseSchema,
          404: { type: "object" },
          409: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const user = request.user;

      try {
        const result = await service.correctNOE(
          id,
          user.id,
          request.body as Parameters<typeof service.correctNOE>[2],
          user.locationId,
        );
        reply.code(201).send(result);
      } catch (err) {
        handleFilingError(err, reply);
      }
    },
  );

  /**
   * POST /api/v1/noe/:id/late-override
   * Supervisor/admin only.
   */
  fastify.post(
    "/noe/:id/late-override",
    {
      schema: {
        tags: ["NOE/NOTR Filing"],
        summary: "Approve a late NOE override (supervisor/admin only)",
        params: idParams,
        body: LateOverrideBodySchema,
        response: {
          200: NOEResponseSchema,
          403: { type: "object" },
          404: { type: "object" },
          409: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const user = request.user;

      try {
        const result = await service.lateOverride(
          id,
          user.id,
          user.role,
          request.body as Parameters<typeof service.lateOverride>[3],
          user.locationId,
        );
        reply.send(result);
      } catch (err) {
        handleFilingError(err, reply);
      }
    },
  );

  /**
   * GET /api/v1/noe/:id/readiness
   */
  fastify.get(
    "/noe/:id/readiness",
    {
      schema: {
        tags: ["NOE/NOTR Filing"],
        summary: "Check NOE readiness for submission",
        params: idParams,
        response: {
          200: ReadinessResponseSchema,
          404: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const user = request.user;

      try {
        const result = await service.checkNOEReadiness(id, user.locationId, user.id);
        reply.send(result);
      } catch (err) {
        handleFilingError(err, reply);
      }
    },
  );

  /**
   * GET /api/v1/noe/:id/history
   */
  fastify.get(
    "/noe/:id/history",
    {
      schema: {
        tags: ["NOE/NOTR Filing"],
        summary: "Get filing history for a NOE",
        params: idParams,
        response: {
          200: FilingHistoryResponseSchema,
          404: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const user = request.user;

      try {
        const result = await service.getNOEHistory(id, user.locationId, user.id);
        reply.send(result);
      } catch (err) {
        handleFilingError(err, reply);
      }
    },
  );

  // ── NOTR standalone ──────────────────────────────────────────────────────────

  /**
   * POST /api/v1/notr/:id/submit
   */
  fastify.post(
    "/notr/:id/submit",
    {
      schema: {
        tags: ["NOE/NOTR Filing"],
        summary: "Submit a NOTR to CMS",
        params: idParams,
        response: {
          200: NOTRResponseSchema,
          404: { type: "object" },
          409: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const user = request.user;

      try {
        const result = await service.submitNOTR(id, user.id, user.locationId);
        reply.send(result);
      } catch (err) {
        handleFilingError(err, reply);
      }
    },
  );

  /**
   * POST /api/v1/notr/:id/cms-response
   */
  fastify.post(
    "/notr/:id/cms-response",
    {
      schema: {
        tags: ["NOE/NOTR Filing"],
        summary: "Record CMS response for a NOTR",
        params: idParams,
        body: CMSResponseBodySchema,
        response: {
          200: NOTRResponseSchema,
          404: { type: "object" },
          409: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const user = request.user;

      try {
        const result = await service.recordNOTRCMSResponse(
          id,
          request.body as Parameters<typeof service.recordNOTRCMSResponse>[1],
          user.locationId,
        );
        reply.send(result);
      } catch (err) {
        handleFilingError(err, reply);
      }
    },
  );

  /**
   * POST /api/v1/notr/:id/correct
   */
  fastify.post(
    "/notr/:id/correct",
    {
      schema: {
        tags: ["NOE/NOTR Filing"],
        summary: "Correct a rejected or needs-correction NOTR",
        params: idParams,
        body: CreateNOTRBodySchema,
        response: {
          201: NOTRResponseSchema,
          404: { type: "object" },
          409: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const user = request.user;

      try {
        const result = await service.correctNOTR(
          id,
          user.id,
          request.body as Parameters<typeof service.correctNOTR>[2],
          user.locationId,
        );
        reply.code(201).send(result);
      } catch (err) {
        handleFilingError(err, reply);
      }
    },
  );

  /**
   * POST /api/v1/notr/:id/late-override
   */
  fastify.post(
    "/notr/:id/late-override",
    {
      schema: {
        tags: ["NOE/NOTR Filing"],
        summary: "Approve a late NOTR override (supervisor/admin only)",
        params: idParams,
        body: LateOverrideBodySchema,
        response: {
          200: NOTRResponseSchema,
          403: { type: "object" },
          404: { type: "object" },
          409: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const user = request.user;

      try {
        const result = await service.lateOverrideNOTR(
          id,
          user.id,
          user.role,
          request.body as Parameters<typeof service.lateOverrideNOTR>[3],
          user.locationId,
        );
        reply.send(result);
      } catch (err) {
        handleFilingError(err, reply);
      }
    },
  );

  /**
   * GET /api/v1/notr/:id/readiness
   */
  fastify.get(
    "/notr/:id/readiness",
    {
      schema: {
        tags: ["NOE/NOTR Filing"],
        summary: "Check NOTR readiness for submission",
        params: idParams,
        response: {
          200: ReadinessResponseSchema,
          404: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const user = request.user;

      try {
        const result = await service.checkNOTRReadiness(id, user.locationId, user.id);
        reply.send(result);
      } catch (err) {
        handleFilingError(err, reply);
      }
    },
  );

  /**
   * GET /api/v1/notr/:id/history
   */
  fastify.get(
    "/notr/:id/history",
    {
      schema: {
        tags: ["NOE/NOTR Filing"],
        summary: "Get filing history for a NOTR",
        params: idParams,
        response: {
          200: FilingHistoryResponseSchema,
          404: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const user = request.user;

      try {
        const result = await service.getNOTRHistory(id, user.locationId, user.id);
        reply.send(result);
      } catch (err) {
        handleFilingError(err, reply);
      }
    },
  );

  /**
   * GET /api/v1/filings/queue
   */
  fastify.get(
    "/filings/queue",
    {
      schema: {
        tags: ["NOE/NOTR Filing"],
        summary: "Get the unified NOE/NOTR filing queue for the location",
        querystring: FilingQueueQuerySchema,
        response: {
          200: FilingQueueResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const user = request.user;
      const query = request.query as Parameters<typeof service.getFilingQueue>[2];

      const result = await service.getFilingQueue(user.locationId, user.id, query);
      reply.send(result);
    },
  );
}
