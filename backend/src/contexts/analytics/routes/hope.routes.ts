/**
 * HOPE Routes — Hospice Outcomes and Patient Evaluation (T3-1a)
 *
 * Full implementation of assessment CRUD, validation, approval,
 * iQIES lifecycle management, and quality benchmarks.
 *
 * Base prefix: /api/v1/hope (registered in server.ts)
 * Additional prefix: /api/v1/analytics (quality-benchmarks)
 *
 * Routes:
 *   POST   /hope/assessments                          — Create assessment (window check)
 *   GET    /hope/assessments                          — List with filters
 *   GET    /hope/assessments/:id                      — Detail
 *   PATCH  /hope/assessments/:id                      — Update data/clinician
 *   POST   /hope/assessments/:id/validate             — Run two-tier validation engine
 *   POST   /hope/assessments/:id/approve              — Supervisor: approve for submission
 *   POST   /hope/submissions/:id/reprocess            — Re-enqueue rejected submission (N+1)
 *   POST   /hope/submissions/:id/revert-to-review     — Supervisor: revert to review
 *   GET    /analytics/quality-benchmarks              — NQF measures + national averages
 */

import { Validators } from "@/config/typebox-compiler.js";
import { db } from "@/db/client.js";
import { hopeSubmissionQueue } from "@/jobs/queue.js";
import {
  HOPEAssessmentListQuerySchema,
  HOPEAssessmentListResponseSchema,
  HOPEAssessmentResponseSchema,
  HOPEQualityBenchmarkSchema,
  HOPESubmissionRowSchema,
  HOPEValidationResultSchema,
  CreateHOPEAssessmentBodySchema,
  PatchHOPEAssessmentBodySchema,
} from "@/contexts/analytics/schemas/hopeAssessmentCrud.schema.js";
import {
  HOPEApprovalError,
  HOPEService,
  HOPEWindowViolationError,
} from "@/contexts/analytics/services/hope.service.js";
import { AuditService } from "@/contexts/identity/services/audit.service.js";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";

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

const UuidParamsSchema = Type.Object({ id: Type.String({ format: "uuid" }) });

export default async function hopeRoutes(fastify: FastifyInstance): Promise<void> {
  const svc = new HOPEService({
    db,
    valkey: fastify.valkey,
    log: fastify.log,
    auditService: AuditService,
    hopeSubmissionQueue,
  });

  // ── POST /hope/assessments ────────────────────────────────────────────────

  fastify.post(
    "/assessments",
    {
      schema: {
        tags: ["HOPE"],
        summary: "Create HOPE assessment (HOPE-A, HOPE-UV, or HOPE-D)",
        description:
          "Creates a HOPE assessment. HOPE-A and HOPE-D validate the 7-day CMS window. Throws HOPEWindowViolationError if outside window.",
        body: CreateHOPEAssessmentBodySchema,
        response: {
          201: HOPEAssessmentResponseSchema,
          400: ErrorResponseSchema,
          422: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.CreateHOPEAssessmentBody.Check(request.body)) {
          const errors = [...Validators.CreateHOPEAssessmentBody.Errors(request.body)];
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "HOPE assessment body validation failed",
              details: errors.map((e) => ({ path: e.path, message: e.message })),
            },
          });
        }
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      try {
        const assessment = await svc.createAssessment(
          request.body as import("@/contexts/analytics/schemas/hopeAssessmentCrud.schema.js").CreateHOPEAssessmentBody,
          userId,
        );
        return reply.code(201).send(assessment);
      } catch (err) {
        if (err instanceof HOPEWindowViolationError) {
          return reply.code(422).send({
            success: false,
            error: {
              code: "HOPE_WINDOW_VIOLATION",
              message: err.message,
            },
          });
        }
        throw err;
      }
    },
  );

  // ── GET /hope/assessments ─────────────────────────────────────────────────

  fastify.get(
    "/assessments",
    {
      schema: {
        tags: ["HOPE"],
        summary: "List HOPE assessments for current location",
        querystring: HOPEAssessmentListQuerySchema,
        response: {
          200: HOPEAssessmentListResponseSchema,
          400: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.HOPEAssessmentListQuery.Check(request.query)) {
          const errors = [...Validators.HOPEAssessmentListQuery.Errors(request.query)];
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid list query parameters",
              details: errors.map((e) => ({ path: e.path, message: e.message })),
            },
          });
        }
      },
    },
    async (request, reply) => {
      const locationId = request.user!.locationId;
      const result = await svc.listAssessments(
        request.query as import("@/contexts/analytics/schemas/hopeAssessmentCrud.schema.js").HOPEAssessmentListQuery,
        locationId,
      );
      return reply.code(200).send(result);
    },
  );

  // ── GET /hope/assessments/:id ─────────────────────────────────────────────

  fastify.get(
    "/assessments/:id",
    {
      schema: {
        tags: ["HOPE"],
        summary: "Get single HOPE assessment",
        params: UuidParamsSchema,
        response: {
          200: HOPEAssessmentResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const locationId = request.user!.locationId;
      const { id } = request.params as { id: string };
      try {
        const assessment = await svc.getAssessment(id, locationId);
        return reply.code(200).send(assessment);
      } catch {
        return reply.code(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: `HOPE assessment ${id} not found` },
        });
      }
    },
  );

  // ── PATCH /hope/assessments/:id ───────────────────────────────────────────

  fastify.patch(
    "/assessments/:id",
    {
      schema: {
        tags: ["HOPE"],
        summary: "Update HOPE assessment data or clinician assignment",
        params: UuidParamsSchema,
        body: PatchHOPEAssessmentBodySchema,
        response: {
          200: HOPEAssessmentResponseSchema,
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.PatchHOPEAssessmentBody.Check(request.body)) {
          const errors = [...Validators.PatchHOPEAssessmentBody.Errors(request.body)];
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Patch body validation failed",
              details: errors.map((e) => ({ path: e.path, message: e.message })),
            },
          });
        }
      },
    },
    async (request, reply) => {
      const userId = request.user!.id;
      const locationId = request.user!.locationId;
      const { id } = request.params as { id: string };
      const assessment = await svc.patchAssessment(
        id,
        request.body as import("@/contexts/analytics/schemas/hopeAssessmentCrud.schema.js").PatchHOPEAssessmentBody,
        userId,
        locationId,
      );
      return reply.code(200).send(assessment);
    },
  );

  // ── POST /hope/assessments/:id/validate ───────────────────────────────────

  fastify.post(
    "/assessments/:id/validate",
    {
      schema: {
        tags: ["HOPE"],
        summary: "Run two-tier HOPE validation engine",
        description:
          "Validates the assessment payload. Returns blockingErrors (prevent submission) and warnings. Updates cached completenessScore, fatalErrorCount, warningCount on the assessment row.",
        params: UuidParamsSchema,
        response: {
          200: HOPEValidationResultSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const locationId = request.user!.locationId;
      const { id } = request.params as { id: string };
      try {
        const result = await svc.validateAssessment(id, locationId);
        return reply.code(200).send(result);
      } catch {
        return reply.code(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: `HOPE assessment ${id} not found` },
        });
      }
    },
  );

  // ── POST /hope/assessments/:id/approve ────────────────────────────────────

  fastify.post(
    "/assessments/:id/approve",
    {
      schema: {
        tags: ["HOPE"],
        summary: "Approve assessment for iQIES submission (supervisor/admin only)",
        description:
          "Transitions ready_for_review → approved_for_submission and enqueues the BullMQ hope-submission job. Requires supervisor or admin role. Blocked if blockingErrors > 0.",
        params: UuidParamsSchema,
        response: {
          200: HOPEAssessmentResponseSchema,
          403: ErrorResponseSchema,
          422: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id: userId, role, locationId } = request.user!;
      const { id } = request.params as { id: string };
      try {
        const assessment = await svc.approveAssessment(id, userId, role, locationId);
        return reply.code(200).send(assessment);
      } catch (err) {
        if (err instanceof HOPEApprovalError) {
          const code = err.message.includes("Only supervisors") ? 403 : 422;
          return reply.code(code).send({
            success: false,
            error: { code: "HOPE_APPROVAL_ERROR", message: err.message },
          });
        }
        throw err;
      }
    },
  );

  // ── POST /hope/submissions/:id/reprocess ──────────────────────────────────

  fastify.post(
    "/submissions/:id/reprocess",
    {
      schema: {
        tags: ["HOPE"],
        summary: "Reprocess a rejected iQIES submission (attempt N+1)",
        description: "Creates a new submission attempt for a rejected submission. Increments attemptNumber.",
        params: UuidParamsSchema,
        response: {
          200: HOPESubmissionRowSchema,
          400: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id: userId, locationId } = request.user!;
      const { id } = request.params as { id: string };
      try {
        const submission = await svc.reprocessSubmission(id, locationId, userId);
        return reply.code(200).send(submission);
      } catch (err) {
        if (err instanceof Error && err.message.includes("not found")) {
          return reply.code(404).send({
            success: false,
            error: { code: "NOT_FOUND", message: err.message },
          });
        }
        if (err instanceof Error && err.message.includes("Cannot reprocess")) {
          return reply.code(400).send({
            success: false,
            error: { code: "INVALID_STATE", message: err.message },
          });
        }
        throw err;
      }
    },
  );

  // ── POST /hope/submissions/:id/revert-to-review ───────────────────────────

  fastify.post(
    "/submissions/:id/revert-to-review",
    {
      schema: {
        tags: ["HOPE"],
        summary: "Revert assessment back to ready_for_review (supervisor only)",
        description:
          "Moves the linked assessment from approved_for_submission back to ready_for_review. Requires supervisor or admin role.",
        params: UuidParamsSchema,
        response: {
          200: HOPEAssessmentResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const { id: userId, role, locationId } = request.user!;
      const { id } = request.params as { id: string };
      try {
        const assessment = await svc.revertToReview(id, locationId, userId, role);
        return reply.code(200).send(assessment);
      } catch (err) {
        if (err instanceof HOPEApprovalError) {
          return reply.code(403).send({
            success: false,
            error: { code: "FORBIDDEN", message: err.message },
          });
        }
        if (err instanceof Error && err.message.includes("not found")) {
          return reply.code(404).send({
            success: false,
            error: { code: "NOT_FOUND", message: err.message },
          });
        }
        throw err;
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Analytics routes (registered under /api/v1/analytics prefix in server.ts)
// ---------------------------------------------------------------------------

export async function analyticsRoutes(fastify: FastifyInstance): Promise<void> {
  const svc = new HOPEService({
    db,
    valkey: fastify.valkey,
    log: fastify.log,
    auditService: AuditService,
    hopeSubmissionQueue,
  });

  // ── GET /analytics/quality-benchmarks ─────────────────────────────────────

  fastify.get(
    "/quality-benchmarks",
    {
      schema: {
        tags: ["Analytics"],
        summary: "NQF quality measure rates vs CMS national averages",
        description:
          "Returns NQF #3235, #3633, #3634 (A+B), and HCI rates for the current reporting period. Includes location vs national benchmark comparison and HQRP penalty risk flag.",
        response: {
          200: HOPEQualityBenchmarkSchema,
        },
      },
    },
    async (request, reply) => {
      const { locationId } = request.user!;
      const benchmarks = await svc.getQualityBenchmarks(locationId);
      return reply.code(200).send(benchmarks);
    },
  );
}
