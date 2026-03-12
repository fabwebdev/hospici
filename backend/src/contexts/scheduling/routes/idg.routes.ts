/**
 * IDG Routes — IDG Meeting Recording + CMS 15-day Enforcement
 *
 * Registered in server.ts under two prefixes:
 *   idgMeetingsRoutes → /api/v1/idg-meetings
 *     POST   /                → create IDG meeting
 *     PATCH  /:id/complete    → complete meeting (validates RN+MD+SW, assembles note)
 *
 *   patientIdgRoutes  → /api/v1/patients
 *     GET    /:patientId/idg-meetings   → list IDG meetings for patient
 *     GET    /:patientId/idg-compliance → IDG compliance status (frontend hard-block trigger)
 *
 * Hook order (CLAUDE.md §2.4):
 *   preValidation → TypeBox AOT (POST/PATCH only)
 *   preHandler    → RLS context (via registerRLSMiddleware, runs first)
 *   handler       → IDGService
 */

import { Validators } from "@/config/typebox-compiler.js";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  CompleteIDGMeetingBodySchema,
  CreateIDGMeetingBodySchema,
  IDGComplianceStatusSchema,
  IDGMeetingListResponseSchema,
  IDGMeetingResponseSchema,
} from "../schemas/idgMeeting.schema.js";
import { IDGAttendeeValidationError, IDGService } from "../services/idg.service.js";

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

const IDGOverdueErrorSchema = Type.Object({
  success: Type.Boolean(),
  error: Type.Object({
    code: Type.Literal("IDG_MISSING_REQUIRED_DISCIPLINES"),
    message: Type.String(),
  }),
});

// ── POST + PATCH routes (prefix: /api/v1/idg-meetings) ───────────────────────

export async function idgMeetingsRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /api/v1/idg-meetings — create a new IDG meeting
  fastify.post(
    "/",
    {
      schema: {
        tags: ["IDG"],
        summary: "Schedule a new IDG meeting for a patient",
        body: CreateIDGMeetingBodySchema,
        response: {
          201: IDGMeetingResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.CreateIDGMeetingBody.Check(request.body)) {
          const errors = [...Validators.CreateIDGMeetingBody.Errors(request.body)];
          reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "IDG meeting validation failed",
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
      const meeting = await IDGService.create(
        request.body as Parameters<typeof IDGService.create>[0],
        request.user,
      );
      reply.code(201).send(meeting);
    },
  );

  // PATCH /api/v1/idg-meetings/:id/complete — complete with attendee notes + assembled note
  fastify.patch(
    "/:id/complete",
    {
      schema: {
        tags: ["IDG"],
        summary: "Complete an IDG meeting — validates RN+MD+SW, assembles IDG note",
        params: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" } },
          required: ["id"],
        },
        body: CompleteIDGMeetingBodySchema,
        response: {
          200: IDGMeetingResponseSchema,
          400: IDGOverdueErrorSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.CompleteIDGMeetingBody.Check(request.body)) {
          const errors = [...Validators.CompleteIDGMeetingBody.Errors(request.body)];
          reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "IDG completion validation failed",
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
      try {
        const meeting = await IDGService.complete(
          id,
          request.body as Parameters<typeof IDGService.complete>[1],
          request.user,
        );
        reply.code(200).send(meeting);
      } catch (err) {
        if (err instanceof IDGAttendeeValidationError) {
          return reply.code(400).send({
            success: false,
            error: { code: err.code, message: err.message },
          });
        }
        if (err instanceof Error && err.message === "IDG meeting not found") {
          return reply.code(404).send({
            success: false,
            error: { code: "NOT_FOUND", message: "IDG meeting not found" },
          });
        }
        throw err;
      }
    },
  );
}

// ── GET routes (prefix: /api/v1/patients) ────────────────────────────────────

export async function patientIdgRoutes(fastify: FastifyInstance): Promise<void> {
  const PatientParamsSchema = {
    type: "object",
    properties: { patientId: { type: "string", format: "uuid" } },
    required: ["patientId"],
  } as const;

  // GET /api/v1/patients/:patientId/idg-meetings
  fastify.get(
    "/:patientId/idg-meetings",
    {
      schema: {
        tags: ["IDG"],
        summary: "List all IDG meetings for a patient (reverse-chronological)",
        params: PatientParamsSchema,
        response: {
          200: IDGMeetingListResponseSchema,
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
      const result = await IDGService.list(patientId, request.user);
      reply.code(200).send(result);
    },
  );

  // GET /api/v1/patients/:patientId/idg-compliance
  // Returns compliance status — frontend uses this to trigger the hard-block modal
  fastify.get(
    "/:patientId/idg-compliance",
    {
      schema: {
        tags: ["IDG"],
        summary:
          "IDG 15-day compliance status for a patient. Non-compliant triggers hard-block modal.",
        params: PatientParamsSchema,
        response: {
          200: IDGComplianceStatusSchema,
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
      const status = await IDGService.compliance(patientId, request.user);
      reply.code(200).send(status);
    },
  );
}
