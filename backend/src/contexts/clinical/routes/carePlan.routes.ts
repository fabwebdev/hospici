/**
 * Care Plan Routes — Unified Interdisciplinary Care Plan (T2-5)
 *
 * Registered in server.ts under prefix /api/v1/patients:
 *   POST   /:patientId/care-plan                     — create (or return existing)
 *   GET    /:patientId/care-plan                     — retrieve
 *   PATCH  /:patientId/care-plan/:discipline         — role-gated section update
 *
 * Hook order (CLAUDE.md §2.4):
 *   preValidation → TypeBox AOT (POST/PATCH only)
 *   preHandler    → RLS context (via registerRLSMiddleware)
 *   handler       → CarePlanService
 *
 * Role gate: only users whose role maps to the target discipline may PATCH that
 * section. Admin/supervisor may patch any discipline. Enforced in the service layer.
 *
 * Encounter embedding: when encounters are implemented (T2-7/T2-9), the encounter
 * GET handler will call CarePlanService.get() and include the result inline.
 */

import { Validators } from "@/config/typebox-compiler.js";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  CarePlanResponseSchema,
  CreateCarePlanBodySchema,
  DisciplineTypeSchema,
  PatchCarePlanBodySchema,
  PhysicianReviewBodySchema,
} from "../schemas/carePlan.schema.js";
import { CarePlanService } from "../services/carePlan.service.js";

const PatientParamsSchema = {
  type: "object",
  properties: { patientId: { type: "string", format: "uuid" } },
  required: ["patientId"],
} as const;

const DisciplineParamsSchema = {
  type: "object",
  properties: {
    patientId: { type: "string", format: "uuid" },
    discipline: {
      type: "string",
      enum: ["RN", "SW", "CHAPLAIN", "THERAPY", "AIDE", "VOLUNTEER", "BEREAVEMENT"],
    },
  },
  required: ["patientId", "discipline"],
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

export default async function carePlanRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /:patientId/care-plan ─────────────────────────────────────────────
  fastify.post(
    "/:patientId/care-plan",
    {
      schema: {
        tags: ["Care Plan"],
        summary: "Create a care plan for a patient (idempotent — returns existing if present)",
        params: PatientParamsSchema,
        body: CreateCarePlanBodySchema,
        response: {
          201: CarePlanResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.CreateCarePlanBody.Check(request.body)) {
          const errors = [...Validators.CreateCarePlanBody.Errors(request.body)];
          reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Care plan validation failed",
              details: errors.map((e) => ({ path: e.path, message: e.message })),
            },
          });
        }
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({
          success: false,
          error: { code: "UNAUTHORIZED", message: "Unauthorized" },
        });
      }
      const { patientId } = request.params as { patientId: string };
      const carePlan = await CarePlanService.create(
        patientId,
        request.body as Parameters<typeof CarePlanService.create>[1],
        request.user,
      );
      reply.code(201).send(carePlan);
    },
  );

  // ── GET /:patientId/care-plan ──────────────────────────────────────────────
  fastify.get(
    "/:patientId/care-plan",
    {
      schema: {
        tags: ["Care Plan"],
        summary: "Retrieve the care plan for a patient",
        params: PatientParamsSchema,
        response: {
          200: CarePlanResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({
          success: false,
          error: { code: "UNAUTHORIZED", message: "Unauthorized" },
        });
      }
      const { patientId } = request.params as { patientId: string };
      const carePlan = await CarePlanService.get(patientId, request.user);
      if (!carePlan) {
        return reply.code(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: "No care plan found for this patient" },
        });
      }
      reply.code(200).send(carePlan);
    },
  );

  // ── PATCH /:patientId/care-plan/:discipline ────────────────────────────────
  fastify.patch(
    "/:patientId/care-plan/:discipline",
    {
      schema: {
        tags: ["Care Plan"],
        summary: "Update one discipline section (role-gated; does not touch other sections)",
        params: DisciplineParamsSchema,
        body: PatchCarePlanBodySchema,
        response: {
          200: CarePlanResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.PatchCarePlanBody.Check(request.body)) {
          const errors = [...Validators.PatchCarePlanBody.Errors(request.body)];
          reply.code(400).send({
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
      if (!request.user) {
        return reply.code(401).send({
          success: false,
          error: { code: "UNAUTHORIZED", message: "Unauthorized" },
        });
      }

      const { patientId, discipline } = request.params as {
        patientId: string;
        discipline: string;
      };

      // Validate discipline param against the enum
      if (!Validators.DisciplineType.Check(discipline)) {
        return reply.code(400).send({
          success: false,
          error: {
            code: "INVALID_DISCIPLINE",
            message: "discipline must be one of: RN, SW, CHAPLAIN, THERAPY, AIDE",
          },
        });
      }

      try {
        const updated = await CarePlanService.patchDiscipline(
          patientId,
          discipline as Parameters<typeof CarePlanService.patchDiscipline>[1],
          request.body as Parameters<typeof CarePlanService.patchDiscipline>[2],
          request.user,
        );
        reply.code(200).send(updated);
      } catch (err) {
        const coded = err as Error & { code?: string };
        if (coded.code === "DISCIPLINE_ROLE_MISMATCH") {
          return reply.code(403).send({
            success: false,
            error: { code: "DISCIPLINE_ROLE_MISMATCH", message: coded.message },
          });
        }
        if (coded.code === "CARE_PLAN_NOT_FOUND") {
          return reply.code(404).send({
            success: false,
            error: { code: "NOT_FOUND", message: coded.message },
          });
        }
        throw err;
      }
    },
  );

  // ── POST /:patientId/care-plan/physician-review ────────────────────────────
  // 42 CFR §418.56(b): attending physician + medical director/designee must sign
  // the initial plan within 2 calendar days, then every 14 days thereafter.
  fastify.post(
    "/:patientId/care-plan/physician-review",
    {
      schema: {
        tags: ["Care Plan"],
        summary: "Physician/medical director sign-off on care plan (42 CFR §418.56(b))",
        description:
          "Records a formal physician review. type='initial' must be used within 2 calendar days of admission. type='ongoing' is required at least every 14 calendar days.",
        params: PatientParamsSchema,
        body: PhysicianReviewBodySchema,
        response: {
          200: CarePlanResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
          409: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.PhysicianReviewBody.Check(request.body)) {
          const errors = [...Validators.PhysicianReviewBody.Errors(request.body)];
          reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Physician review body validation failed",
              details: errors.map((e) => ({ path: e.path, message: e.message })),
            },
          });
        }
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({
          success: false,
          error: { code: "UNAUTHORIZED", message: "Unauthorized" },
        });
      }
      const { patientId } = request.params as { patientId: string };
      try {
        const updated = await CarePlanService.signPhysicianReview(
          patientId,
          request.body as Parameters<typeof CarePlanService.signPhysicianReview>[1],
          request.user,
        );
        reply.code(200).send(updated);
      } catch (err) {
        const coded = err as Error & { code?: string };
        if (coded.code === "PHYSICIAN_ROLE_REQUIRED") {
          return reply.code(403).send({
            success: false,
            error: { code: "PHYSICIAN_ROLE_REQUIRED", message: coded.message },
          });
        }
        if (coded.code === "CARE_PLAN_NOT_FOUND") {
          return reply.code(404).send({
            success: false,
            error: { code: "NOT_FOUND", message: coded.message },
          });
        }
        if (coded.code === "INITIAL_REVIEW_ALREADY_DONE") {
          return reply.code(409).send({
            success: false,
            error: { code: "INITIAL_REVIEW_ALREADY_DONE", message: coded.message },
          });
        }
        throw err;
      }
    },
  );
}
