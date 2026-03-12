/**
 * Patient Routes — Clinical Patient CRUD
 *
 * Base prefix: /api/v1/patients  (registered in server.ts)
 *
 * Endpoints:
 *   GET    /patients           — paginated list (location-scoped via RLS)
 *   POST   /patients           — create new patient
 *   GET    /patients/:id       — get single patient (decrypted)
 *   PATCH  /patients/:id       — partial update
 *
 * Hook order (per CLAUDE.md §2.4):
 *   preValidation → TypeBox validation
 *   preHandler    → RLS context (via registerRLSMiddleware, runs first)
 *   handler       → business logic via PatientService
 *
 * PHI: all PHI fields encrypted at rest. Audit log on every read/write.
 */

import { Validators } from "@/config/typebox-compiler.js";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  CreatePatientBodySchema,
  PatchPatientBodySchema,
  PatientListQuerySchema,
  PatientListResponseSchema,
  PatientResponseSchema,
} from "../schemas/patient.schema.js";
import { PatientService } from "../services/patient.service.js";

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

export default async function patientRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /patients ──────────────────────────────────────────────────────────
  fastify.get(
    "/",
    {
      schema: {
        tags: ["Patients"],
        summary: "List patients for the caller's location",
        querystring: PatientListQuerySchema,
        response: {
          200: PatientListResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.PatientListQuery.Check(request.query)) {
          const errors = [...Validators.PatientListQuery.Errors(request.query)];
          reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid query parameters",
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
      const query = request.query as {
        page?: number;
        limit?: number;
        careModel?: "HOSPICE" | "PALLIATIVE" | "CCM";
      };
      const result = await PatientService.list(request.user, query);
      reply.code(200).send(result);
    },
  );

  // ── POST /patients ─────────────────────────────────────────────────────────
  fastify.post(
    "/",
    {
      schema: {
        tags: ["Patients"],
        summary: "Create a new patient",
        body: CreatePatientBodySchema,
        response: {
          201: PatientResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.CreatePatientBody.Check(request.body)) {
          const errors = [...Validators.CreatePatientBody.Errors(request.body)];
          reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Patient validation failed",
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
      const patient = await PatientService.create(
        request.body as Parameters<typeof PatientService.create>[0],
        request.user,
      );
      reply.code(201).send(patient);
    },
  );

  // ── GET /patients/:id ──────────────────────────────────────────────────────
  fastify.get(
    "/:id",
    {
      schema: {
        tags: ["Patients"],
        summary: "Get a single patient by ID",
        params: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" } },
          required: ["id"],
        },
        response: {
          200: PatientResponseSchema,
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
      const { id } = request.params as { id: string };
      const patient = await PatientService.getById(id, request.user);
      if (!patient) {
        return reply.code(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: "Patient not found" },
        });
      }
      reply.code(200).send(patient);
    },
  );

  // ── PATCH /patients/:id ────────────────────────────────────────────────────
  fastify.patch(
    "/:id",
    {
      schema: {
        tags: ["Patients"],
        summary: "Partially update a patient",
        params: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" } },
          required: ["id"],
        },
        body: PatchPatientBodySchema,
        response: {
          200: PatientResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.PatchPatientBody.Check(request.body)) {
          const errors = [...Validators.PatchPatientBody.Errors(request.body)];
          reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Patient patch validation failed",
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
      const { id } = request.params as { id: string };
      const patient = await PatientService.patch(
        id,
        request.body as Parameters<typeof PatientService.patch>[1],
        request.user,
      );
      if (!patient) {
        return reply.code(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: "Patient not found" },
        });
      }
      reply.code(200).send(patient);
    },
  );
}
