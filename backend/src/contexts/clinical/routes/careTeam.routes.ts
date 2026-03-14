/**
 * Care Team Routes — patient care team member management
 *
 * Base prefix: /api/v1/patients  (registered in server.ts)
 *
 * Endpoints:
 *   GET    /patients/:patientId/care-team                        — list active members
 *   POST   /patients/:patientId/care-team                        — assign a member
 *   DELETE /patients/:patientId/care-team/:memberId              — unassign (soft delete)
 *
 * Hook order (per CLAUDE.md §2.4):
 *   preValidation → TypeBox AOT
 *   preHandler    → RLS context (registerRLSMiddleware, runs first)
 *   handler       → CareTeamService
 */

import { Validators } from "@/config/typebox-compiler.js";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  AssignCareTeamMemberBodySchema,
  CareTeamListResponseSchema,
  CareTeamMemberResponseSchema,
} from "../schemas/careTeam.schema.js";
import { CareTeamService } from "../services/careTeam.service.js";

const PatientParamsSchema = {
  type: "object",
  properties: { patientId: { type: "string", format: "uuid" } },
  required: ["patientId"],
} as const;

const MemberParamsSchema = {
  type: "object",
  properties: {
    patientId: { type: "string", format: "uuid" },
    memberId: { type: "string", format: "uuid" },
  },
  required: ["patientId", "memberId"],
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

export default async function careTeamRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /:patientId/care-team ─────────────────────────────────────────────────
  fastify.get(
    "/:patientId/care-team",
    {
      schema: {
        tags: ["Care Team"],
        summary: "List active care team members for a patient",
        params: PatientParamsSchema,
        response: { 200: CareTeamListResponseSchema, 401: ErrorResponseSchema },
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
      const result = await CareTeamService.listCareTeam(patientId, request.user);
      reply.code(200).send(result);
    },
  );

  // ── POST /:patientId/care-team ────────────────────────────────────────────────
  fastify.post(
    "/:patientId/care-team",
    {
      schema: {
        tags: ["Care Team"],
        summary: "Assign a clinician or external provider to the patient care team",
        params: PatientParamsSchema,
        body: AssignCareTeamMemberBodySchema,
        response: {
          201: CareTeamMemberResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.AssignCareTeamMemberBody.Check(request.body)) {
          const errors = [...Validators.AssignCareTeamMemberBody.Errors(request.body)];
          reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Care team member validation failed",
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
      const member = await CareTeamService.assignMember(
        patientId,
        request.body as Parameters<typeof CareTeamService.assignMember>[1],
        request.user,
      );
      reply.code(201).send(member);
    },
  );

  // ── DELETE /:patientId/care-team/:memberId ────────────────────────────────────
  fastify.delete(
    "/:patientId/care-team/:memberId",
    {
      schema: {
        tags: ["Care Team"],
        summary: "Unassign a care team member (soft delete via unassigned_at)",
        params: MemberParamsSchema,
        response: {
          204: { type: "null" },
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
      const { patientId, memberId } = request.params as {
        patientId: string;
        memberId: string;
      };
      try {
        await CareTeamService.unassignMember(patientId, memberId, request.user);
        reply.code(204).send();
      } catch (err) {
        const e = err as { statusCode?: number; message: string };
        if (e.statusCode === 404) {
          return reply.code(404).send({
            success: false,
            error: { code: "NOT_FOUND", message: "Care team member not found" },
          });
        }
        throw err;
      }
    },
  );
}
