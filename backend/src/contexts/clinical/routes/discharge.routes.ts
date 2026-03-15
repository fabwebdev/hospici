/**
 * Discharge Routes — Patient Discharge Workflow
 *
 * Registered in server.ts under prefix /api/v1/patients:
 *   POST /:patientId/discharge — process a patient discharge (4 types)
 *
 * Hook order (CLAUDE.md §2.4):
 *   preValidation → TypeBox AOT (DischargeBody)
 *   preHandler    → RLS context (via registerRLSMiddleware)
 *   handler       → DischargeService
 *
 * Error code → HTTP status mapping:
 *   DISCHARGE_DATE_FUTURE       → 400
 *   REVOCATION_REASON_TOO_SHORT → 400
 *   RECEIVING_NPI_REQUIRED      → 400
 *   NOE_NOT_FOUND               → 404
 *   PATIENT_NOT_FOUND           → 404
 *   401 if no authenticated user
 *   201 on success
 */

import { Validators } from "@/config/typebox-compiler.js";
import { AlertService } from "@/contexts/compliance/services/alert.service.js";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import { DischargeBodySchema, DischargeResponseSchema } from "../schemas/discharge.schema.js";
import { DischargeService } from "../services/discharge.service.js";

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

export default async function dischargeRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /:patientId/discharge ─────────────────────────────────────────────
  fastify.post(
    "/:patientId/discharge",
    {
      schema: {
        tags: ["Discharge"],
        summary: "Process a patient discharge (expected_death, revocation, transfer, live_discharge)",
        description:
          "CMS rules enforced: discharge date cannot be future; revocation reason ≥ 20 chars; transfer requires NPI. Creates NOTR for revocation/transfer (deadline = revocationDate + 5 business days). Computes HOPE-D window for expected_death (dischargeDate + 7 calendar days).",
        params: PatientParamsSchema,
        body: DischargeBodySchema,
        response: {
          201: DischargeResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.DischargeBody.Check(request.body)) {
          const errors = [...Validators.DischargeBody.Errors(request.body)];
          reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Discharge body validation failed",
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

      const service = new DischargeService(
        fastify.log,
        new AlertService(fastify.valkey),
      );

      try {
        const result = await service.discharge(
          patientId,
          request.body as Parameters<typeof service.discharge>[1],
          request.user,
        );
        return reply.code(201).send(result);
      } catch (err) {
        const coded = err as Error & { code?: string };

        if (
          coded.code === "DISCHARGE_DATE_FUTURE" ||
          coded.code === "REVOCATION_REASON_TOO_SHORT" ||
          coded.code === "RECEIVING_NPI_REQUIRED"
        ) {
          return reply.code(400).send({
            success: false,
            error: { code: coded.code, message: coded.message },
          });
        }

        if (coded.code === "PATIENT_NOT_FOUND" || coded.code === "NOE_NOT_FOUND") {
          return reply.code(404).send({
            success: false,
            error: { code: coded.code, message: coded.message },
          });
        }

        throw err;
      }
    },
  );
}
