/**
 * Team Communication Routes — per-patient team messaging
 *
 * Base prefix: /api/v1/patients  (registered in server.ts)
 *
 * Endpoints:
 *   GET    /patients/:patientId/team-comm/threads                         — list threads
 *   POST   /patients/:patientId/team-comm/threads                         — create thread
 *   GET    /patients/:patientId/team-comm/threads/:threadId/messages      — list messages
 *   POST   /patients/:patientId/team-comm/threads/:threadId/messages      — send message
 *
 * Socket.IO: emits comm:message to location:{locationId} room after message insert.
 *
 * Hook order (per CLAUDE.md §2.4):
 *   preValidation → TypeBox AOT
 *   preHandler    → RLS context (registerRLSMiddleware, runs first)
 *   handler       → TeamCommService
 */

import { Validators } from "@/config/typebox-compiler.js";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  CommMessageListResponseSchema,
  CommMessageResponseSchema,
  CommThreadListResponseSchema,
  CommThreadResponseSchema,
  CreateCommThreadBodySchema,
  SendCommMessageBodySchema,
} from "../schemas/teamComm.schema.js";
import { TeamCommService } from "../services/teamComm.service.js";

const PatientParamsSchema = {
  type: "object",
  properties: { patientId: { type: "string", format: "uuid" } },
  required: ["patientId"],
} as const;

const ThreadParamsSchema = {
  type: "object",
  properties: {
    patientId: { type: "string", format: "uuid" },
    threadId: { type: "string", format: "uuid" },
  },
  required: ["patientId", "threadId"],
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

export default async function teamCommRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /:patientId/team-comm/threads ─────────────────────────────────────────
  fastify.get(
    "/:patientId/team-comm/threads",
    {
      schema: {
        tags: ["Team Communications"],
        summary: "List communication threads for a patient",
        params: PatientParamsSchema,
        response: { 200: CommThreadListResponseSchema, 401: ErrorResponseSchema },
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
      const result = await TeamCommService.listThreads(patientId, request.user);
      reply.code(200).send(result);
    },
  );

  // ── POST /:patientId/team-comm/threads ────────────────────────────────────────
  fastify.post(
    "/:patientId/team-comm/threads",
    {
      schema: {
        tags: ["Team Communications"],
        summary: "Create a new communication thread for a patient",
        params: PatientParamsSchema,
        body: CreateCommThreadBodySchema,
        response: {
          201: CommThreadResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.CreateCommThreadBody.Check(request.body)) {
          const errors = [...Validators.CreateCommThreadBody.Errors(request.body)];
          reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Thread validation failed",
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
      const thread = await TeamCommService.createThread(
        patientId,
        request.body as Parameters<typeof TeamCommService.createThread>[1],
        request.user,
      );
      reply.code(201).send(thread);
    },
  );

  // ── GET /:patientId/team-comm/threads/:threadId/messages ──────────────────────
  fastify.get(
    "/:patientId/team-comm/threads/:threadId/messages",
    {
      schema: {
        tags: ["Team Communications"],
        summary: "List messages in a thread",
        params: ThreadParamsSchema,
        response: { 200: CommMessageListResponseSchema, 401: ErrorResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.user) {
        return reply.code(401).send({
          success: false,
          error: { code: "UNAUTHORIZED", message: "Unauthorized" },
        });
      }
      const { patientId, threadId } = request.params as {
        patientId: string;
        threadId: string;
      };
      const result = await TeamCommService.listMessages(patientId, threadId, request.user);
      reply.code(200).send(result);
    },
  );

  // ── POST /:patientId/team-comm/threads/:threadId/messages ─────────────────────
  fastify.post(
    "/:patientId/team-comm/threads/:threadId/messages",
    {
      schema: {
        tags: ["Team Communications"],
        summary: "Send a message in a thread. Emits comm:message Socket.IO event.",
        params: ThreadParamsSchema,
        body: SendCommMessageBodySchema,
        response: {
          201: CommMessageResponseSchema,
          400: ErrorResponseSchema,
          401: ErrorResponseSchema,
        },
      },
      preValidation: async (request, reply) => {
        if (!Validators.SendCommMessageBody.Check(request.body)) {
          const errors = [...Validators.SendCommMessageBody.Errors(request.body)];
          reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Message validation failed",
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
      const { patientId, threadId } = request.params as {
        patientId: string;
        threadId: string;
      };
      const message = await TeamCommService.sendMessage(
        patientId,
        threadId,
        request.body as Parameters<typeof TeamCommService.sendMessage>[2],
        request.user,
      );

      // Socket.IO — notify all location room subscribers of the new message.
      // "comm:message" will be added to ServerToClientEvents in shared-types.
      const io = fastify.io;
      if (io) {
        // biome-ignore lint/suspicious/noExplicitAny: comm:message is a new event pending shared-types update
        (io.to(`location:${request.user.locationId}`) as any).emit("comm:message", {
          threadId,
          patientId,
          messageId: message.id,
          authorUserId: request.user.id,
          sentAt: message.sentAt,
        });
      }

      reply.code(201).send(message);
    },
  );
}
