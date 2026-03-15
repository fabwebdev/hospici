/**
 * Patient Insurance Routes — coverage records per patient
 *
 * Base prefix: /api/v1/patients  (registered in server.ts)
 *
 * Endpoints:
 *   GET    /:patientId/insurance           — list active insurance records
 *   POST   /:patientId/insurance           — add insurance record
 *   GET    /:patientId/insurance/:id       — get single record
 *   PATCH  /:patientId/insurance/:id       — partial update
 *   DELETE /:patientId/insurance/:id       — soft deactivate
 *
 * Hook order (per CLAUDE.md §2.4):
 *   preValidation → TypeBox AOT
 *   preHandler    → RLS context (registerRLSMiddleware, runs first)
 *   handler       → PatientInsuranceService
 */

import { Validators } from "@/config/typebox-compiler.js";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  CreateInsuranceBodySchema,
  InsuranceListResponseSchema,
  PatchInsuranceBodySchema,
  PatientInsuranceResponseSchema,
} from "../schemas/patient-insurance.schema.js";
import { PatientInsuranceService } from "../services/patient-insurance.service.js";

const PatientParamsSchema = {
  type: "object",
  properties: { patientId: { type: "string", format: "uuid" } },
  required: ["patientId"],
} as const;

const InsuranceParamsSchema = {
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

export default async function patientInsuranceRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /:patientId/insurance ─────────────────────────────────────────────────
  fastify.get(
    "/:patientId/insurance",
    {
      schema: {
        tags: ["Insurance"],
        summary: "List active insurance records for a patient",
        params: PatientParamsSchema,
        response: { 200: InsuranceListResponseSchema, 401: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply
          .code(401)
          .send({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
      }
      const { patientId } = request.params as { patientId: string };
      const result = await PatientInsuranceService.list(patientId, request.user);
      reply.code(200).send(result);
    },
  );

  // ── POST /:patientId/insurance ────────────────────────────────────────────────
  fastify.post(
    "/:patientId/insurance",
    {
      schema: {
        tags: ["Insurance"],
        summary: "Add an insurance/coverage record for a patient",
        params: PatientParamsSchema,
        body: CreateInsuranceBodySchema,
        response: {
          201: PatientInsuranceResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.CreateInsuranceBody.Check(request.body)) {
          const errors = [...Validators.CreateInsuranceBody.Errors(request.body)];
          reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Insurance validation failed",
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
      const record = await PatientInsuranceService.create(
        patientId,
        request.body as Parameters<typeof PatientInsuranceService.create>[1],
        request.user,
      );
      reply.code(201).send(record);
    },
  );

  // ── GET /:patientId/insurance/:id ─────────────────────────────────────────────
  fastify.get(
    "/:patientId/insurance/:id",
    {
      schema: {
        tags: ["Insurance"],
        summary: "Get a single insurance record by ID",
        params: InsuranceParamsSchema,
        response: {
          200: PatientInsuranceResponseSchema,
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
      const record = await PatientInsuranceService.getById(patientId, id, request.user);
      if (!record) {
        return reply.code(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: "Insurance record not found" },
        });
      }
      reply.code(200).send(record);
    },
  );

  // ── PATCH /:patientId/insurance/:id ───────────────────────────────────────────
  fastify.patch(
    "/:patientId/insurance/:id",
    {
      schema: {
        tags: ["Insurance"],
        summary: "Partially update an insurance record",
        params: InsuranceParamsSchema,
        body: PatchInsuranceBodySchema,
        response: {
          200: PatientInsuranceResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.PatchInsuranceBody.Check(request.body)) {
          const errors = [...Validators.PatchInsuranceBody.Errors(request.body)];
          reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Insurance patch validation failed",
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
      const record = await PatientInsuranceService.patch(
        patientId,
        id,
        request.body as Parameters<typeof PatientInsuranceService.patch>[2],
        request.user,
      );
      if (!record) {
        return reply.code(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: "Insurance record not found" },
        });
      }
      reply.code(200).send(record);
    },
  );

  // ── DELETE /:patientId/insurance/:id ──────────────────────────────────────────
  fastify.delete(
    "/:patientId/insurance/:id",
    {
      schema: {
        tags: ["Insurance"],
        summary: "Soft-deactivate an insurance record (sets isActive = false)",
        params: InsuranceParamsSchema,
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
        await PatientInsuranceService.deactivate(patientId, id, request.user);
        reply.code(204).send();
      } catch (err) {
        const e = err as { statusCode?: number; message: string };
        if (e.statusCode === 404) {
          return reply.code(404).send({
            success: false,
            error: { code: "NOT_FOUND", message: "Insurance record not found" },
          });
        }
        throw err;
      }
    },
  );
}
