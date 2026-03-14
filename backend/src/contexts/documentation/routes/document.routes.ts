/**
 * Document Routes — patient document management
 *
 * Base prefix: /api/v1/patients  (registered in server.ts)
 *
 * Endpoints:
 *   GET    /patients/:patientId/documents              — list all documents
 *   POST   /patients/:patientId/documents              — upload document record (stub S3 key)
 *   PATCH  /patients/:patientId/documents/:docId       — update status / record signature
 *
 * Hook order (per CLAUDE.md §2.4):
 *   preValidation → TypeBox AOT
 *   preHandler    → RLS context (registerRLSMiddleware, runs first)
 *   handler       → DocumentService
 */

import { Validators } from "@/config/typebox-compiler.js";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  CreateDocumentBodySchema,
  DocumentListResponseSchema,
  DocumentResponseSchema,
  PatchDocumentBodySchema,
} from "../schemas/document.schema.js";
import { DocumentService } from "../services/document.service.js";

const PatientParamsSchema = {
  type: "object",
  properties: { patientId: { type: "string", format: "uuid" } },
  required: ["patientId"],
} as const;

const DocParamsSchema = {
  type: "object",
  properties: {
    patientId: { type: "string", format: "uuid" },
    docId: { type: "string", format: "uuid" },
  },
  required: ["patientId", "docId"],
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

export default async function documentRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /:patientId/documents ─────────────────────────────────────────────────
  fastify.get(
    "/:patientId/documents",
    {
      schema: {
        tags: ["Documents"],
        summary: "List all documents for a patient",
        params: PatientParamsSchema,
        response: { 200: DocumentListResponseSchema, 401: ErrorResponseSchema },
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
      const result = await DocumentService.listDocuments(patientId, request.user);
      reply.code(200).send(result);
    },
  );

  // ── POST /:patientId/documents ────────────────────────────────────────────────
  fastify.post(
    "/:patientId/documents",
    {
      schema: {
        tags: ["Documents"],
        summary: "Upload a document record for a patient (generates stub storage key)",
        params: PatientParamsSchema,
        body: CreateDocumentBodySchema,
        response: {
          201: DocumentResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.CreateDocumentBody.Check(request.body)) {
          const errors = [...Validators.CreateDocumentBody.Errors(request.body)];
          reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Document validation failed",
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
      const doc = await DocumentService.uploadDocument(
        patientId,
        request.body as Parameters<typeof DocumentService.uploadDocument>[1],
        request.user,
      );
      reply.code(201).send(doc);
    },
  );

  // ── PATCH /:patientId/documents/:docId ────────────────────────────────────────
  fastify.patch(
    "/:patientId/documents/:docId",
    {
      schema: {
        tags: ["Documents"],
        summary: "Update a document (status change or record signature)",
        params: DocParamsSchema,
        body: PatchDocumentBodySchema,
        response: {
          200: DocumentResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.PatchDocumentBody.Check(request.body)) {
          const errors = [...Validators.PatchDocumentBody.Errors(request.body)];
          reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Document patch validation failed",
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
      const { patientId, docId } = request.params as { patientId: string; docId: string };
      try {
        const doc = await DocumentService.patchDocument(
          patientId,
          docId,
          request.body as Parameters<typeof DocumentService.patchDocument>[2],
          request.user,
        );
        reply.code(200).send(doc);
      } catch (err) {
        const e = err as { statusCode?: number; message: string };
        if (e.statusCode === 404) {
          return reply.code(404).send({
            success: false,
            error: { code: "NOT_FOUND", message: "Document not found" },
          });
        }
        throw err;
      }
    },
  );
}
