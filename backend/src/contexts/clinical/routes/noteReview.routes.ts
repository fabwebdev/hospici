/**
 * NoteReview Routes — supervisor note review workflow.
 *
 * Base prefix: /api/v1 (registered in server.ts)
 *
 * Endpoints:
 *   GET   /review-queue                           — filtered queue (supervisor)
 *   POST  /encounters/:id/review                  — transition status + revision requests
 *   PATCH /review-queue/:encounterId/assign       — assign reviewer
 *   POST  /encounters/:id/review/escalate         — escalate (always requires reason)
 *   GET   /encounters/:id/review/history          — full revision history
 *   POST  /review-queue/acknowledge               — bulk acknowledge (PENDING → IN_REVIEW)
 *
 * Socket.IO events emitted:
 *   encounter:revision-requested  → location room
 *   encounter:resubmitted         → location room
 *   review:assigned               → location room
 *   review:approved               → location room
 *   review:escalated              → location room (all supervisors)
 */

import { Validators } from "@/config/typebox-compiler.js";
import { AlertService } from "@/contexts/compliance/services/alert.service.js";
import type {
  AssignReviewBodyType,
  BulkAcknowledgeBodyType,
  EscalateReviewBodyType,
  ReviewQueueQueryType,
  SubmitReviewBodyType,
} from "../schemas/noteReview.schema.js";
import {
  AssignReviewBodySchema,
  BulkAcknowledgeBodySchema,
  EscalateReviewBodySchema,
  ReviewQueueResponseSchema,
  SubmitReviewBodySchema,
} from "../schemas/noteReview.schema.js";
import {
  NoteReviewApprovedError,
  NoteReviewEscalationReasonRequired,
  NoteReviewInvalidTransitionError,
  NoteReviewNotFoundError,
  NoteReviewService,
} from "../services/noteReview.service.js";
import type { FastifyInstance } from "fastify";

const EncounterIdParamsSchema = {
  type: "object",
  properties: { id: { type: "string", format: "uuid" } },
  required: ["id"],
} as const;

const EncounterIdInQueueParamsSchema = {
  type: "object",
  properties: { encounterId: { type: "string", format: "uuid" } },
  required: ["encounterId"],
} as const;

export default async function noteReviewRoutes(fastify: FastifyInstance): Promise<void> {
  const alertService = new AlertService(fastify.valkey);
  const noteReviewService = new NoteReviewService(fastify.valkey, alertService);

  // ── GET /review-queue ──────────────────────────────────────────────────────

  fastify.get(
    "/review-queue",
    {
      schema: {
        tags: ["Note Review"],
        summary: "List the supervisor note review queue with optional filters",
        querystring: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["PENDING", "IN_REVIEW", "REVISION_REQUESTED", "RESUBMITTED", "APPROVED", "LOCKED", "ESCALATED"],
            },
            priority: { type: "integer", minimum: 0, maximum: 2 },
            assignedReviewerId: { type: "string", format: "uuid" },
            billingImpact: { type: "boolean" },
            complianceImpact: { type: "boolean" },
            discipline: { type: "string" },
            patientId: { type: "string", format: "uuid" },
          },
          additionalProperties: false,
        },
        response: { 200: ReviewQueueResponseSchema },
      },
    },
    async (request, reply) => {
      const user = request.user!;
      const query = request.query as ReviewQueueQueryType;
      const response = await noteReviewService.listQueue(user, query);
      return reply.send(response);
    },
  );

  // ── POST /encounters/:id/review ────────────────────────────────────────────
  // No response schema — handler returns mixed 200/404/422/400

  fastify.post(
    "/encounters/:id/review",
    {
      schema: {
        tags: ["Note Review"],
        summary: "Transition review status — attach revision requests or approve",
        params: EncounterIdParamsSchema,
        body: SubmitReviewBodySchema,
      },
      preValidation: [
        async (request, reply) => {
          if (!Validators.SubmitReviewBody.Check(request.body)) {
            return reply.code(400).send({
              error: {
                message: "Invalid review submission body",
                errors: [...Validators.SubmitReviewBody.Errors(request.body)].map((e) => ({
                  path: e.path,
                  message: e.message,
                })),
              },
            });
          }
        },
      ],
    },
    async (request, reply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = request.body as SubmitReviewBodyType;

      try {
        const item = await noteReviewService.submitReview(id, body, user);

        // Emit targeted Socket.IO events
        if (body.status === "REVISION_REQUESTED") {
          fastify.io.to(`location:${user.locationId}`).emit("encounter:revision-requested", {
            encounterId: id,
            reviewerId: user.id,
            revisionRequests: body.revisionRequests ?? [],
          });
        } else if (body.status === "APPROVED") {
          fastify.io.to(`location:${user.locationId}`).emit("review:approved", {
            encounterId: id,
            reviewerId: user.id,
          });
        } else if (body.status === "ESCALATED") {
          fastify.io.to(`location:${user.locationId}`).emit("review:escalated", {
            encounterId: id,
            escalatedBy: user.id,
            escalationReason: body.escalationReason,
          });
        } else if (body.status === "IN_REVIEW" && item.revisionCount > 0) {
          fastify.io.to(`location:${user.locationId}`).emit("encounter:resubmitted", {
            encounterId: id,
            assignedReviewerId: item.assignedReviewerId,
          });
        }

        return reply.send(item);
      } catch (err) {
        if (err instanceof NoteReviewNotFoundError) {
          return reply.code(404).send({ error: { message: err.message } });
        }
        if (err instanceof NoteReviewApprovedError) {
          return reply.code(422).send({ error: { message: err.message, code: "NOTE_LOCKED" } });
        }
        if (err instanceof NoteReviewInvalidTransitionError) {
          return reply.code(422).send({ error: { message: err.message, code: "INVALID_TRANSITION" } });
        }
        if (err instanceof NoteReviewEscalationReasonRequired) {
          return reply.code(400).send({ error: { message: err.message, code: "ESCALATION_REASON_REQUIRED" } });
        }
        throw err;
      }
    },
  );

  // ── PATCH /review-queue/:encounterId/assign ────────────────────────────────
  // No response schema — handler returns mixed status codes

  fastify.patch(
    "/review-queue/:encounterId/assign",
    {
      schema: {
        tags: ["Note Review"],
        summary: "Assign a reviewer to an encounter — optionally set priority and dueBy",
        params: EncounterIdInQueueParamsSchema,
        body: AssignReviewBodySchema,
      },
      preValidation: [
        async (request, reply) => {
          if (!Validators.AssignReviewBody.Check(request.body)) {
            return reply.code(400).send({
              error: {
                message: "Invalid assign review body",
                errors: [...Validators.AssignReviewBody.Errors(request.body)].map((e) => ({
                  path: e.path,
                  message: e.message,
                })),
              },
            });
          }
        },
      ],
    },
    async (request, reply) => {
      const user = request.user!;
      const { encounterId } = request.params as { encounterId: string };
      const body = request.body as AssignReviewBodyType;

      try {
        const item = await noteReviewService.assignReview(encounterId, body, user);

        fastify.io.to(`location:${user.locationId}`).emit("review:assigned", {
          encounterId,
          assignedReviewerId: body.assignedReviewerId,
          assignedBy: user.id,
        });

        return reply.send(item);
      } catch (err) {
        if (err instanceof NoteReviewNotFoundError) {
          return reply.code(404).send({ error: { message: err.message } });
        }
        throw err;
      }
    },
  );

  // ── POST /encounters/:id/review/escalate ───────────────────────────────────
  // No response schema — handler returns mixed status codes

  fastify.post(
    "/encounters/:id/review/escalate",
    {
      schema: {
        tags: ["Note Review"],
        summary: "Escalate a review — always requires escalationReason (audit mandatory)",
        params: EncounterIdParamsSchema,
        body: EscalateReviewBodySchema,
      },
      preValidation: [
        async (request, reply) => {
          if (!Validators.EscalateReviewBody.Check(request.body)) {
            return reply.code(400).send({
              error: {
                message: "escalationReason is required",
                errors: [...Validators.EscalateReviewBody.Errors(request.body)].map((e) => ({
                  path: e.path,
                  message: e.message,
                })),
              },
            });
          }
        },
      ],
    },
    async (request, reply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };
      const body = request.body as EscalateReviewBodyType;

      try {
        const item = await noteReviewService.escalate(id, body, user);

        fastify.io.to(`location:${user.locationId}`).emit("review:escalated", {
          encounterId: id,
          escalatedBy: user.id,
          escalationReason: body.escalationReason,
        });

        return reply.send(item);
      } catch (err) {
        if (err instanceof NoteReviewNotFoundError) {
          return reply.code(404).send({ error: { message: err.message } });
        }
        if (err instanceof NoteReviewInvalidTransitionError) {
          return reply.code(422).send({ error: { message: err.message, code: "INVALID_TRANSITION" } });
        }
        if (err instanceof NoteReviewEscalationReasonRequired) {
          return reply.code(400).send({ error: { message: err.message, code: "ESCALATION_REASON_REQUIRED" } });
        }
        throw err;
      }
    },
  );

  // ── GET /encounters/:id/review/history ────────────────────────────────────

  fastify.get(
    "/encounters/:id/review/history",
    {
      schema: {
        tags: ["Note Review"],
        summary: "Get full revision history for an encounter — side-by-side diff data",
        params: EncounterIdParamsSchema,
      },
    },
    async (request, reply) => {
      const user = request.user!;
      const { id } = request.params as { id: string };

      try {
        const history = await noteReviewService.getHistory(id, user);
        return reply.send(history);
      } catch (err) {
        if (err instanceof NoteReviewNotFoundError) {
          return reply.code(404).send({ error: { message: err.message } });
        }
        throw err;
      }
    },
  );

  // ── POST /review-queue/acknowledge ────────────────────────────────────────

  fastify.post(
    "/review-queue/acknowledge",
    {
      schema: {
        tags: ["Note Review"],
        summary: "Bulk-acknowledge PENDING notes — moves them to IN_REVIEW",
        body: BulkAcknowledgeBodySchema,
      },
      preValidation: [
        async (request, reply) => {
          if (!Validators.BulkAcknowledgeBody.Check(request.body)) {
            return reply.code(400).send({
              error: {
                message: "Invalid bulk acknowledge body",
                errors: [...Validators.BulkAcknowledgeBody.Errors(request.body)].map((e) => ({
                  path: e.path,
                  message: e.message,
                })),
              },
            });
          }
        },
      ],
    },
    async (request, reply) => {
      const user = request.user!;
      const body = request.body as BulkAcknowledgeBodyType;

      const result = await noteReviewService.bulkAcknowledge(body.encounterIds, user);
      return reply.send(result);
    },
  );
}
