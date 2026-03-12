/**
 * Medication Routes — Full medication management module
 *
 * Base prefix: /api/v1/patients  (registered in server.ts)
 *
 * Endpoints:
 *   GET    /patients/:patientId/medications                           — active med list
 *   POST   /patients/:patientId/medications                           — add medication + OpenFDA check
 *   PATCH  /patients/:patientId/medications/:medId                   — update / discontinue / reconcile
 *   GET    /patients/:patientId/medications/:medId/administrations   — MAR history
 *   POST   /patients/:patientId/medications/:medId/administer        — record MAR entry
 *   GET    /patients/:patientId/allergies                             — allergy list
 *   POST   /patients/:patientId/allergies                             — add allergy
 *   PATCH  /patients/:patientId/allergies/:allergyId                 — update / inactivate allergy
 *
 * Socket.IO: emits medication:administered after each MAR insert.
 *
 * Hook order (per CLAUDE.md §2.4):
 *   preValidation → TypeBox AOT
 *   preHandler    → RLS context (registerRLSMiddleware, runs first)
 *   handler       → MedicationService
 */

import { Validators } from "@/config/typebox-compiler.js";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  AdministrationListResponseSchema,
  AllergyListResponseSchema,
  CreateAllergyBodySchema,
  CreateMedicationBodySchema,
  MedicationAdministrationSchema,
  MedicationListResponseSchema,
  MedicationResponseSchema,
  PatchAllergyBodySchema,
  PatchMedicationBodySchema,
  PatientAllergySchema,
  RecordAdministrationBodySchema,
} from "../schemas/medication.schema.js";
import { MedicationService } from "../services/medication.service.js";

const PatientParamsSchema = {
  type: "object",
  properties: { patientId: { type: "string", format: "uuid" } },
  required: ["patientId"],
} as const;

const MedParamsSchema = {
  type: "object",
  properties: {
    patientId: { type: "string", format: "uuid" },
    medId: { type: "string", format: "uuid" },
  },
  required: ["patientId", "medId"],
} as const;

const AllergyParamsSchema = {
  type: "object",
  properties: {
    patientId: { type: "string", format: "uuid" },
    allergyId: { type: "string", format: "uuid" },
  },
  required: ["patientId", "allergyId"],
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

export default async function medicationRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /:patientId/medications ──────────────────────────────────────────────
  fastify.get(
    "/:patientId/medications",
    {
      schema: {
        tags: ["Medications"],
        summary: "List all medications for a patient",
        params: PatientParamsSchema,
        response: { 200: MedicationListResponseSchema, 401: ErrorResponseSchema },
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
      const result = await MedicationService.listMedications(patientId, request.user);
      reply.code(200).send(result);
    },
  );

  // ── POST /:patientId/medications ─────────────────────────────────────────────
  fastify.post(
    "/:patientId/medications",
    {
      schema: {
        tags: ["Medications"],
        summary:
          "Add a medication to the patient's active list (includes OpenFDA interaction check)",
        params: PatientParamsSchema,
        body: CreateMedicationBodySchema,
        response: {
          201: MedicationResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.CreateMedicationBody.Check(request.body)) {
          const errors = [...Validators.CreateMedicationBody.Errors(request.body)];
          reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Medication validation failed",
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
      const med = await MedicationService.createMedication(
        patientId,
        request.body as Parameters<typeof MedicationService.createMedication>[1],
        request.user,
      );
      reply.code(201).send(med);
    },
  );

  // ── PATCH /:patientId/medications/:medId ─────────────────────────────────────
  fastify.patch(
    "/:patientId/medications/:medId",
    {
      schema: {
        tags: ["Medications"],
        summary: "Update medication (status, discontinue, reconcile, teaching, pharmacy)",
        params: MedParamsSchema,
        body: PatchMedicationBodySchema,
        response: {
          200: MedicationResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.PatchMedicationBody.Check(request.body)) {
          const errors = [...Validators.PatchMedicationBody.Errors(request.body)];
          reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Medication patch validation failed",
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
      const { patientId, medId } = request.params as { patientId: string; medId: string };
      try {
        const med = await MedicationService.patchMedication(
          patientId,
          medId,
          request.body as Parameters<typeof MedicationService.patchMedication>[2],
          request.user,
        );
        reply.code(200).send(med);
      } catch (err) {
        const e = err as { statusCode?: number; message: string };
        if (e.statusCode === 404) {
          return reply.code(404).send({
            success: false,
            error: { code: "NOT_FOUND", message: "Medication not found" },
          });
        }
        throw err;
      }
    },
  );

  // ── GET /:patientId/medications/:medId/administrations ───────────────────────
  fastify.get(
    "/:patientId/medications/:medId/administrations",
    {
      schema: {
        tags: ["Medications"],
        summary: "List MAR (medication administration) history",
        params: MedParamsSchema,
        response: { 200: AdministrationListResponseSchema, 401: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({
          success: false,
          error: { code: "UNAUTHORIZED", message: "Unauthorized" },
        });
      }
      const { patientId, medId } = request.params as { patientId: string; medId: string };
      const result = await MedicationService.listAdministrations(patientId, medId, request.user);
      reply.code(200).send(result);
    },
  );

  // ── POST /:patientId/medications/:medId/administer ───────────────────────────
  fastify.post(
    "/:patientId/medications/:medId/administer",
    {
      schema: {
        tags: ["Medications"],
        summary:
          "Record a medication administration (MAR entry). Fires medication:administered Socket.IO event.",
        params: MedParamsSchema,
        body: RecordAdministrationBodySchema,
        response: {
          201: MedicationAdministrationSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.RecordAdministrationBody.Check(request.body)) {
          const errors = [...Validators.RecordAdministrationBody.Errors(request.body)];
          reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Administration record validation failed",
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
      const { patientId, medId } = request.params as { patientId: string; medId: string };
      const admin = await MedicationService.recordAdministration(
        patientId,
        medId,
        request.body as Parameters<typeof MedicationService.recordAdministration>[2],
        request.user,
      );

      // Socket.IO — notify location room of administration event
      const io = fastify.io;
      if (io) {
        io.to(`location:${request.user.locationId}`).emit("medication:administered", {
          patientId,
          medicationName: (request.body as { name?: string }).name ?? medId,
          administeredBy: request.user.id,
          timestamp: admin.administeredAt,
        });
      }

      reply.code(201).send(admin);
    },
  );

  // ── GET /:patientId/allergies ────────────────────────────────────────────────
  fastify.get(
    "/:patientId/allergies",
    {
      schema: {
        tags: ["Allergies"],
        summary: "List all allergies for a patient",
        params: PatientParamsSchema,
        response: { 200: AllergyListResponseSchema, 401: ErrorResponseSchema },
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
      const result = await MedicationService.listAllergies(patientId, request.user);
      reply.code(200).send(result);
    },
  );

  // ── POST /:patientId/allergies ───────────────────────────────────────────────
  fastify.post(
    "/:patientId/allergies",
    {
      schema: {
        tags: ["Allergies"],
        summary: "Add an allergy for a patient",
        params: PatientParamsSchema,
        body: CreateAllergyBodySchema,
        response: { 201: PatientAllergySchema, 400: ErrorResponseSchema, 401: ErrorResponseSchema },
      },
      preValidation: async (request, reply) => {
        if (!Validators.CreateAllergyBody.Check(request.body)) {
          const errors = [...Validators.CreateAllergyBody.Errors(request.body)];
          reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Allergy validation failed",
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
      const allergy = await MedicationService.createAllergy(
        patientId,
        request.body as Parameters<typeof MedicationService.createAllergy>[1],
        request.user,
      );
      reply.code(201).send(allergy);
    },
  );

  // ── PATCH /:patientId/allergies/:allergyId ───────────────────────────────────
  fastify.patch(
    "/:patientId/allergies/:allergyId",
    {
      schema: {
        tags: ["Allergies"],
        summary: "Update or inactivate an allergy",
        params: AllergyParamsSchema,
        body: PatchAllergyBodySchema,
        response: {
          200: PatientAllergySchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.PatchAllergyBody.Check(request.body)) {
          const errors = [...Validators.PatchAllergyBody.Errors(request.body)];
          reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Allergy patch validation failed",
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
      const { patientId, allergyId } = request.params as {
        patientId: string;
        allergyId: string;
      };
      try {
        const allergy = await MedicationService.patchAllergy(
          patientId,
          allergyId,
          request.body as Parameters<typeof MedicationService.patchAllergy>[2],
          request.user,
        );
        reply.code(200).send(allergy);
      } catch (err) {
        const e = err as { statusCode?: number; message: string };
        if (e.statusCode === 404) {
          return reply.code(404).send({
            success: false,
            error: { code: "NOT_FOUND", message: "Allergy not found" },
          });
        }
        throw err;
      }
    },
  );
}
