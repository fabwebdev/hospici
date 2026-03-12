/**
 * Assessment Routes — Pain/Symptom Assessments + Decline Trajectory
 *
 * Base prefix: /api/v1/patients  (registered alongside patient routes in server.ts)
 *
 * Endpoints:
 *   POST   /patients/:patientId/assessments  — record a new assessment
 *   GET    /patients/:patientId/assessments  — list assessments (chronological)
 *   GET    /patients/:patientId/trajectory   — decline trajectory time-series
 *
 * Hook order (per CLAUDE.md §2.4):
 *   preValidation → TypeBox validation (POST only)
 *   preHandler    → RLS context (via registerRLSMiddleware, runs first)
 *   handler       → business logic via AssessmentService
 *
 * PHI: assessed_by (userId) is recorded but patient name never returned.
 * Audit log emitted on every read/write.
 */

import { Validators } from "@/config/typebox-compiler.js";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  AssessmentListResponseSchema,
  AssessmentResponseSchema,
  CreateAssessmentBodySchema,
  TrajectoryResponseSchema,
} from "../schemas/assessment.schema.js";
import { AssessmentService } from "../services/assessment.service.js";

const PatientParamsSchema = {
  type: "object",
  properties: { patientId: { type: "string", format: "uuid" } },
  required: ["patientId"],
} as const;

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

export default async function assessmentRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /:patientId/assessments ───────────────────────────────────────────
  fastify.post(
    "/:patientId/assessments",
    {
      schema: {
        tags: ["Assessments"],
        summary: "Record a pain/symptom assessment for a patient",
        params: PatientParamsSchema,
        body: CreateAssessmentBodySchema,
        response: {
          201: AssessmentResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.CreateAssessmentBody.Check(request.body)) {
          const errors = [...Validators.CreateAssessmentBody.Errors(request.body)];
          reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Assessment validation failed",
              details: errors.map((e) => ({ path: e.path, message: e.message })),
            },
          });
        }
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply
          .code(401)
          .send({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }
      const { patientId } = request.params as { patientId: string };
      const assessment = await AssessmentService.create(
        patientId,
        request.body as Parameters<typeof AssessmentService.create>[1],
        request.user,
      );
      reply.code(201).send(assessment);
    },
  );

  // ── GET /:patientId/assessments ────────────────────────────────────────────
  fastify.get(
    "/:patientId/assessments",
    {
      schema: {
        tags: ["Assessments"],
        summary: "List all assessments for a patient (chronological)",
        params: PatientParamsSchema,
        response: {
          200: AssessmentListResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply
          .code(401)
          .send({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }
      const { patientId } = request.params as { patientId: string };
      const result = await AssessmentService.list(patientId, request.user);
      reply.code(200).send(result);
    },
  );

  // ── GET /:patientId/trajectory ─────────────────────────────────────────────
  fastify.get(
    "/:patientId/trajectory",
    {
      schema: {
        tags: ["Assessments"],
        summary: "Get decline trajectory time-series (pain, dyspnea, nausea) for sparklines",
        params: PatientParamsSchema,
        response: {
          200: TrajectoryResponseSchema,
          401: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply
          .code(401)
          .send({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }
      const { patientId } = request.params as { patientId: string };
      const trajectory = await AssessmentService.trajectory(patientId, request.user);
      reply.code(200).send(trajectory);
    },
  );
}
