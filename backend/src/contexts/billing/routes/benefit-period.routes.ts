/**
 * Benefit Period Routes — T3-4
 *
 * All routes registered at /api/v1:
 *   GET  /benefit-periods                                       → listPeriods
 *   GET  /patients/:patientId/benefit-periods                   → getPatientTimeline
 *   GET  /benefit-periods/:id                                   → getPeriod
 *   PATCH /benefit-periods/:id/reporting                        → setReportingPeriod
 *   POST /benefit-periods/:id/recalculate-from-here/preview     → recalculateFromPeriod
 *   POST /benefit-periods/:id/recalculate-from-here             → commitRecalculation
 *   POST /benefit-periods/:id/recertify                         → completeRecertification
 *   POST /benefit-periods/:id/correct                           → commitCorrection
 */

import {
  BenefitPeriodDetailResponseSchema,
  BenefitPeriodListQuerySchema,
  BenefitPeriodListResponseSchema,
  BenefitPeriodTimelineResponseSchema,
  CommitRecalculationBodySchema,
  CorrectPeriodBodySchema,
  RecalculationPreviewResponseSchema,
  RecertifyBodySchema,
  SetReportingPeriodBodySchema,
} from "@/contexts/billing/schemas/benefitPeriod.schema.js";
import {
  BenefitPeriodAuthorizationError,
  BenefitPeriodNotFoundError,
  BenefitPeriodService,
  InvalidPreviewTokenError,
} from "@/contexts/billing/services/benefit-period.service.js";
import type { FastifyInstance, FastifyReply } from "fastify";

// ── Param schemas ─────────────────────────────────────────────────────────────

const idParams = {
  type: "object",
  properties: { id: { type: "string", format: "uuid" } },
  required: ["id"],
} as const;

const patientIdParams = {
  type: "object",
  properties: { patientId: { type: "string", format: "uuid" } },
  required: ["patientId"],
} as const;

// ── Error reply helper ────────────────────────────────────────────────────────

function handleError(err: unknown, reply: FastifyReply): void {
  if (err instanceof BenefitPeriodNotFoundError) {
    reply.code(404).send({
      success: false,
      error: { code: "NOT_FOUND", message: err.message },
    });
    return;
  }
  if (err instanceof InvalidPreviewTokenError) {
    reply.code(409).send({
      success: false,
      error: { code: "INVALID_PREVIEW_TOKEN", message: err.message },
    });
    return;
  }
  if (err instanceof BenefitPeriodAuthorizationError) {
    reply.code(403).send({
      success: false,
      error: { code: "FORBIDDEN", message: err.message },
    });
    return;
  }
  throw err;
}

// ── Route plugin ──────────────────────────────────────────────────────────────

export default async function benefitPeriodRoutes(fastify: FastifyInstance): Promise<void> {
  const svc = new BenefitPeriodService(fastify.valkey, fastify.log);

  /**
   * GET /benefit-periods
   * List benefit periods for the caller's location with optional filters.
   */
  fastify.get(
    "/benefit-periods",
    {
      schema: {
        tags: ["Benefit Periods"],
        summary: "List benefit periods",
        querystring: BenefitPeriodListQuerySchema,
        response: {
          200: BenefitPeriodListResponseSchema,
          401: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const user = request.user;
      const query = request.query as Parameters<typeof svc.listPeriods>[0];
      const result = await svc.listPeriods(query, {
        id: user.id,
        locationId: user.locationId,
        role: user.role,
      });
      reply.send(result);
    },
  );

  /**
   * GET /patients/:patientId/benefit-periods
   * Get the full benefit period timeline for a patient.
   */
  fastify.get(
    "/patients/:patientId/benefit-periods",
    {
      schema: {
        tags: ["Benefit Periods"],
        summary: "Get patient benefit period timeline",
        params: patientIdParams,
        response: {
          200: BenefitPeriodTimelineResponseSchema,
          401: { type: "object" },
          404: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { patientId } = request.params as { patientId: string };
      const user = request.user;
      try {
        const result = await svc.getPatientTimeline(patientId, {
          id: user.id,
          locationId: user.locationId,
          role: user.role,
        });
        reply.send(result);
      } catch (err) {
        handleError(err, reply);
      }
    },
  );

  /**
   * GET /benefit-periods/:id
   * Get a single benefit period with patient and NOE data.
   */
  fastify.get(
    "/benefit-periods/:id",
    {
      schema: {
        tags: ["Benefit Periods"],
        summary: "Get a benefit period",
        params: idParams,
        response: {
          200: BenefitPeriodDetailResponseSchema,
          401: { type: "object" },
          404: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { id } = request.params as { id: string };
      const user = request.user;
      try {
        const result = await svc.getPeriod(id, {
          id: user.id,
          locationId: user.locationId,
          role: user.role,
        });
        reply.send(result);
      } catch (err) {
        handleError(err, reply);
      }
    },
  );

  /**
   * PATCH /benefit-periods/:id/reporting
   * Mark a period as the patient's reporting period.
   * Role: billing_coordinator or admin.
   */
  fastify.patch(
    "/benefit-periods/:id/reporting",
    {
      schema: {
        tags: ["Benefit Periods"],
        summary: "Set the reporting period for a patient",
        params: idParams,
        body: SetReportingPeriodBodySchema,
        response: {
          200: BenefitPeriodDetailResponseSchema,
          401: { type: "object" },
          403: { type: "object" },
          404: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const user = request.user;
      if (!["billing_coordinator", "admin", "super_admin"].includes(user.role)) {
        reply.code(403).send({
          success: false,
          error: { code: "FORBIDDEN", message: "Only billing coordinators and admins may set the reporting period" },
        });
        return;
      }
      const { id } = request.params as { id: string };
      const body = request.body as Parameters<typeof svc.setReportingPeriod>[1];
      try {
        const result = await svc.setReportingPeriod(id, body, {
          id: user.id,
          locationId: user.locationId,
          role: user.role,
        });
        reply.send(result);
      } catch (err) {
        handleError(err, reply);
      }
    },
  );

  /**
   * POST /benefit-periods/:id/recalculate-from-here/preview
   * Preview a cascade recalculation from this period onward.
   */
  fastify.post(
    "/benefit-periods/:id/recalculate-from-here/preview",
    {
      schema: {
        tags: ["Benefit Periods"],
        summary: "Preview a cascade recalculation",
        params: idParams,
        response: {
          200: RecalculationPreviewResponseSchema,
          401: { type: "object" },
          404: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { id } = request.params as { id: string };
      const user = request.user;
      try {
        const result = await svc.recalculateFromPeriod(id, {
          id: user.id,
          locationId: user.locationId,
          role: user.role,
        });
        reply.send(result);
      } catch (err) {
        handleError(err, reply);
      }
    },
  );

  /**
   * POST /benefit-periods/:id/recalculate-from-here
   * Commit a previously previewed cascade recalculation.
   */
  fastify.post(
    "/benefit-periods/:id/recalculate-from-here",
    {
      schema: {
        tags: ["Benefit Periods"],
        summary: "Commit a cascade recalculation",
        params: idParams,
        body: CommitRecalculationBodySchema,
        response: {
          200: BenefitPeriodDetailResponseSchema,
          401: { type: "object" },
          404: { type: "object" },
          409: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { id } = request.params as { id: string };
      const body = request.body as Parameters<typeof svc.commitRecalculation>[1];
      const user = request.user;
      try {
        const result = await svc.commitRecalculation(id, body, {
          id: user.id,
          locationId: user.locationId,
          role: user.role,
        });
        reply.send(result);
      } catch (err) {
        handleError(err, reply);
      }
    },
  );

  /**
   * POST /benefit-periods/:id/recertify
   * Record that a recertification has been completed.
   */
  fastify.post(
    "/benefit-periods/:id/recertify",
    {
      schema: {
        tags: ["Benefit Periods"],
        summary: "Record a completed recertification",
        params: idParams,
        body: RecertifyBodySchema,
        response: {
          200: BenefitPeriodDetailResponseSchema,
          401: { type: "object" },
          404: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { id } = request.params as { id: string };
      const body = request.body as Parameters<typeof svc.completeRecertification>[1];
      const user = request.user;
      try {
        const result = await svc.completeRecertification(id, body, {
          id: user.id,
          locationId: user.locationId,
          role: user.role,
        });
        reply.send(result);
      } catch (err) {
        handleError(err, reply);
      }
    },
  );

  /**
   * POST /benefit-periods/:id/correct
   * Apply a field correction to a benefit period.
   * Date fields (startDate, endDate) cascade via preview flow.
   * Non-date fields auto-commit.
   */
  fastify.post(
    "/benefit-periods/:id/correct",
    {
      schema: {
        tags: ["Benefit Periods"],
        summary: "Correct a field on a benefit period",
        params: idParams,
        body: CorrectPeriodBodySchema,
        response: {
          200: BenefitPeriodDetailResponseSchema,
          401: { type: "object" },
          404: { type: "object" },
        },
      },
    },
    async (request, reply) => {
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { id } = request.params as { id: string };
      const body = request.body as Parameters<typeof svc.commitCorrection>[1];
      const user = request.user;
      try {
        const result = await svc.commitCorrection(id, body, {
          id: user.id,
          locationId: user.locationId,
          role: user.role,
        });
        reply.send(result);
      } catch (err) {
        handleError(err, reply);
      }
    },
  );
}
