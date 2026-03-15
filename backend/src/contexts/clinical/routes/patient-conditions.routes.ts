/**
 * Patient Conditions Routes — ICD-10 diagnoses per patient
 *
 * Base prefix: /api/v1/patients  (registered in server.ts)
 *
 * Endpoints:
 *   GET    /:patientId/conditions           — list active conditions
 *   POST   /:patientId/conditions           — add condition
 *   GET    /:patientId/conditions/:id       — get single condition
 *   PATCH  /:patientId/conditions/:id       — partial update
 *   DELETE /:patientId/conditions/:id       — soft deactivate
 *
 * Hook order (per CLAUDE.md §2.4):
 *   preValidation → TypeBox AOT
 *   preHandler    → RLS context (registerRLSMiddleware, runs first)
 *   handler       → PatientConditionsService
 */

import { Validators } from "@/config/typebox-compiler.js";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  ConditionListResponseSchema,
  CreateConditionBodySchema,
  PatchConditionBodySchema,
  PatientConditionResponseSchema,
} from "../schemas/patient-conditions.schema.js";
import { PatientConditionsService } from "../services/patient-conditions.service.js";

const PatientParamsSchema = {
  type: "object",
  properties: { patientId: { type: "string", format: "uuid" } },
  required: ["patientId"],
} as const;

const ConditionParamsSchema = {
  type: "object",
  properties: {
    patientId: { type: "string", format: "uuid" },
    id: { type: "string", format: "uuid" },
  },
  required: ["patientId", "id"],
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

export default async function patientConditionsRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /:patientId/conditions ────────────────────────────────────────────────
  fastify.get(
    "/:patientId/conditions",
    {
      schema: {
        tags: ["Conditions"],
        summary: "List active conditions (diagnoses) for a patient",
        params: PatientParamsSchema,
        response: { 200: ConditionListResponseSchema, 401: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply
          .code(401)
          .send({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }
      const { patientId } = request.params as { patientId: string };
      const result = await PatientConditionsService.list(patientId, request.user);
      reply.code(200).send(result);
    },
  );

  // ── POST /:patientId/conditions ───────────────────────────────────────────────
  fastify.post(
    "/:patientId/conditions",
    {
      schema: {
        tags: ["Conditions"],
        summary: "Add a diagnosis to a patient chart",
        params: PatientParamsSchema,
        body: CreateConditionBodySchema,
        response: {
          201: PatientConditionResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.CreateConditionBody.Check(request.body)) {
          const errors = [...Validators.CreateConditionBody.Errors(request.body)];
          reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Condition validation failed",
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
      const condition = await PatientConditionsService.create(
        patientId,
        request.body as Parameters<typeof PatientConditionsService.create>[1],
        request.user,
      );
      reply.code(201).send(condition);
    },
  );

  // ── GET /:patientId/conditions/:id ────────────────────────────────────────────
  fastify.get(
    "/:patientId/conditions/:id",
    {
      schema: {
        tags: ["Conditions"],
        summary: "Get a single condition by ID",
        params: ConditionParamsSchema,
        response: {
          200: PatientConditionResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply
          .code(401)
          .send({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }
      const { patientId, id } = request.params as { patientId: string; id: string };
      const condition = await PatientConditionsService.getById(patientId, id, request.user);
      if (!condition) {
        return reply
          .code(404)
          .send({ success: false, error: { code: "NOT_FOUND", message: "Condition not found" } });
      }
      reply.code(200).send(condition);
    },
  );

  // ── PATCH /:patientId/conditions/:id ──────────────────────────────────────────
  fastify.patch(
    "/:patientId/conditions/:id",
    {
      schema: {
        tags: ["Conditions"],
        summary: "Partially update a condition",
        params: ConditionParamsSchema,
        body: PatchConditionBodySchema,
        response: {
          200: PatientConditionResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.PatchConditionBody.Check(request.body)) {
          const errors = [...Validators.PatchConditionBody.Errors(request.body)];
          reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Condition patch validation failed",
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
      const { patientId, id } = request.params as { patientId: string; id: string };
      const condition = await PatientConditionsService.patch(
        patientId,
        id,
        request.body as Parameters<typeof PatientConditionsService.patch>[2],
        request.user,
      );
      if (!condition) {
        return reply
          .code(404)
          .send({ success: false, error: { code: "NOT_FOUND", message: "Condition not found" } });
      }
      reply.code(200).send(condition);
    },
  );

  // ── DELETE /:patientId/conditions/:id ─────────────────────────────────────────
  fastify.delete(
    "/:patientId/conditions/:id",
    {
      schema: {
        tags: ["Conditions"],
        summary: "Soft-deactivate a condition (sets isActive = false)",
        params: ConditionParamsSchema,
        response: {
          204: { type: "null" },
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply
          .code(401)
          .send({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }
      const { patientId, id } = request.params as { patientId: string; id: string };
      try {
        await PatientConditionsService.deactivate(patientId, id, request.user);
        reply.code(204).send();
      } catch (err) {
        const e = err as { statusCode?: number; message: string };
        if (e.statusCode === 404) {
          return reply
            .code(404)
            .send({ success: false, error: { code: "NOT_FOUND", message: "Condition not found" } });
        }
        throw err;
      }
    },
  );
}
