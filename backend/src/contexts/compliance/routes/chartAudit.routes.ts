/**
 * chartAudit.routes.ts — T3-13 Chart Audit Mode routes.
 *
 * Routes:
 *   GET  /review-checklist-templates          — active template for (discipline, visitType)
 *   GET  /review-checklist-templates/:id/history — version history for (discipline, visitType)
 *   GET  /chart-audit/queue                   — paginated workbench queue
 *   GET  /chart-audit/dashboard               — workload summary cards
 *   POST /chart-audit/bulk-action             — bulk chart-level QA (atomic)
 *   GET  /patients/:id/chart-audit            — single-patient completeness report
 *   GET  /review-queue/views                  — saved views (personal + shared)
 *   POST /review-queue/views                  — save new view
 *   PATCH /review-queue/views/:id             — update view
 *   DELETE /review-queue/views/:id            — delete own view
 *   POST /review-queue/bulk-action            — encounter-level bulk action
 */

import { Validators } from "@/config/typebox-compiler.js";
import type { FastifyInstance } from "fastify";
import type {
  ChartAuditQueueQueryType,
  ChartBulkActionBodyType,
  CreateReviewQueueViewBodyType,
  PatchReviewQueueViewBodyType,
  ReviewQueueBulkActionBodyType,
} from "../schemas/chartAudit.schema.js";
import {
  ReviewChecklistTemplateListResponseSchema,
  ReviewQueueViewListResponseSchema,
} from "../schemas/chartAudit.schema.js";
import {
  ChartAuditNotFoundError,
  ChartAuditService,
} from "../services/chartAudit.service.js";

const SUPERVISOR_ROLES = new Set(["supervisor", "compliance_officer", "admin", "super_admin"]);

export default async function chartAuditRoutes(fastify: FastifyInstance): Promise<void> {
  const svc = new ChartAuditService();

  // ── GET /review-checklist-templates ────────────────────────────────────────

  fastify.get(
    "/review-checklist-templates",
    {
      schema: {
        tags: ["Chart Audit"],
        summary: "Get active checklist template for a (discipline, visitType) pair",
        querystring: {
          type: "object",
          properties: {
            discipline: { type: "string" },
            visitType: { type: "string" },
          },
          required: ["discipline", "visitType"],
        },
        // No response schema — handler returns mixed 200/404
      },
    },
    async (request, reply) => {
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { discipline, visitType } = request.query as { discipline: string; visitType: string };
      const template = await svc.getActiveTemplate(discipline, visitType, request.user.locationId);
      if (!template) return reply.code(404).send({ error: { message: "No active template found" } });
      return reply.send(template);
    },
  );

  // ── GET /review-checklist-templates/:id/history ────────────────────────────
  // ":id" is a conceptual identifier — we use discipline + visitType from query

  fastify.get(
    "/review-checklist-templates/history",
    {
      schema: {
        tags: ["Chart Audit"],
        summary: "Get all versions of a checklist template for (discipline, visitType)",
        querystring: {
          type: "object",
          properties: {
            discipline: { type: "string" },
            visitType: { type: "string" },
          },
          required: ["discipline", "visitType"],
        },
        response: { 200: ReviewChecklistTemplateListResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { discipline, visitType } = request.query as { discipline: string; visitType: string };
      const data = await svc.getTemplateHistory(discipline, visitType, request.user.locationId);
      return reply.send({ data, total: data.length });
    },
  );

  // ── GET /chart-audit/queue ─────────────────────────────────────────────────

  fastify.get(
    "/chart-audit/queue",
    {
      schema: {
        tags: ["Chart Audit"],
        summary: "Paginated chart-audit workbench queue",
        querystring: {
          type: "object",
          properties: {
            locationId: { type: "string", format: "uuid" },
            discipline: { type: "string" },
            reviewerId: { type: "string", format: "uuid" },
            status: { type: "string", enum: ["NOT_STARTED", "IN_PROGRESS", "COMPLETE", "FLAGGED"] },
            deficiencyType: { type: "string" },
            billingImpact: { type: "boolean" },
            complianceImpact: { type: "boolean" },
            missingDocSeverity: { type: "string", enum: ["critical", "warning"] },
            dateRangeStart: { type: "string", format: "date" },
            dateRangeEnd: { type: "string", format: "date" },
            page: { type: "integer", minimum: 1, default: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100, default: 25 },
            sortBy: { type: "string" },
            sortDir: { type: "string", enum: ["asc", "desc"] },
            groupBy: { type: "string" },
          },
          additionalProperties: false,
        },
        // No response schema — handler returns mixed 200/403
      },
    },
    async (request, reply) => {
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      if (!SUPERVISOR_ROLES.has(request.user.role)) {
        return reply.code(403).send({ error: { message: "Supervisor role required" } });
      }
      const query = request.query as ChartAuditQueueQueryType;
      const result = await svc.getQueue(request.user, query);
      return reply.send(result);
    },
  );

  // ── GET /chart-audit/dashboard ─────────────────────────────────────────────

  fastify.get(
    "/chart-audit/dashboard",
    {
      schema: {
        tags: ["Chart Audit"],
        summary: "Chart-audit workbench dashboard — workload summary cards",
        // No response schema — handler returns mixed 200/403
      },
    },
    async (request, reply) => {
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      if (!SUPERVISOR_ROLES.has(request.user.role)) {
        return reply.code(403).send({ error: { message: "Supervisor role required" } });
      }
      const result = await svc.getDashboard(request.user);
      return reply.send(result);
    },
  );

  // ── POST /chart-audit/bulk-action ──────────────────────────────────────────

  fastify.post(
    "/chart-audit/bulk-action",
    {
      schema: {
        tags: ["Chart Audit"],
        summary: "Bulk chart-level QA action (ASSIGN / REQUEST_REVISION / EXPORT_CSV) — atomic",
        // No response schema — handler returns mixed 200/400/403/CSV
      },
      preValidation: [
        async (request, reply) => {
          if (!Validators.ChartBulkActionBody.Check(request.body)) {
            return reply.code(400).send({
              error: {
                message: "Invalid bulk action body",
                errors: [...Validators.ChartBulkActionBody.Errors(request.body)].map((e) => ({
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
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      if (!SUPERVISOR_ROLES.has(request.user.role)) {
        return reply.code(403).send({ error: { message: "Supervisor role required" } });
      }

      const body = request.body as ChartBulkActionBodyType;

      if (body.action === "EXPORT_CSV") {
        // First get the queue data, then build CSV
        const queueData = await svc.getQueue(request.user, { patientIds: body.patientIds } as never);
        const csv = svc.buildQueueCsv(queueData.data);
        return reply
          .header("Content-Type", "text/csv")
          .header("Content-Disposition", "attachment; filename=chart-audit-queue.csv")
          .send(csv);
      }

      const result = await svc.bulkChartAction(request.user, body);
      return reply.send(result);
    },
  );

  // ── GET /patients/:id/chart-audit ──────────────────────────────────────────

  fastify.get(
    "/patients/:id/chart-audit",
    {
      schema: {
        tags: ["Chart Audit"],
        summary: "Full chart-completeness report for a single patient",
        params: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" } },
          required: ["id"],
        },
        // No response schema — handler returns mixed 200/403
      },
    },
    async (request, reply) => {
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      if (!SUPERVISOR_ROLES.has(request.user.role)) {
        return reply.code(403).send({ error: { message: "Supervisor role required" } });
      }
      const { id } = request.params as { id: string };
      const result = await svc.getPatientChartAudit(id, request.user);
      return reply.send(result);
    },
  );

  // ── GET /review-queue/views ────────────────────────────────────────────────

  fastify.get(
    "/review-queue/views",
    {
      schema: {
        tags: ["Chart Audit"],
        summary: "List saved review queue views for current user + shared views in location",
        querystring: {
          type: "object",
          properties: {
            viewScope: { type: "string", enum: ["note_review", "chart_audit"] },
          },
          additionalProperties: false,
        },
        response: { 200: ReviewQueueViewListResponseSchema },
      },
    },
    async (request, reply) => {
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { viewScope } = request.query as { viewScope?: string };
      const data = await svc.listViews(request.user, viewScope);
      return reply.send({ data, total: data.length });
    },
  );

  // ── POST /review-queue/views ───────────────────────────────────────────────

  fastify.post(
    "/review-queue/views",
    {
      schema: {
        tags: ["Chart Audit"],
        summary: "Save a new review queue filter/sort/column view",
        // No response schema — handler returns mixed 201/400
      },
      preValidation: [
        async (request, reply) => {
          if (!Validators.CreateReviewQueueViewBody.Check(request.body)) {
            return reply.code(400).send({
              error: {
                message: "Invalid view body",
                errors: [...Validators.CreateReviewQueueViewBody.Errors(request.body)].map((e) => ({
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
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const body = request.body as CreateReviewQueueViewBodyType;
      const view = await svc.createView(request.user, body);
      return reply.code(201).send(view);
    },
  );

  // ── PATCH /review-queue/views/:id ─────────────────────────────────────────

  fastify.patch(
    "/review-queue/views/:id",
    {
      schema: {
        tags: ["Chart Audit"],
        summary: "Update a saved view (name, filters, sort, columns, isShared, isPinned, isDefault)",
        params: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" } },
          required: ["id"],
        },
        // No response schema — handler returns mixed 200/400/404
      },
      preValidation: [
        async (request, reply) => {
          if (!Validators.PatchReviewQueueViewBody.Check(request.body)) {
            return reply.code(400).send({
              error: {
                message: "Invalid patch body",
                errors: [...Validators.PatchReviewQueueViewBody.Errors(request.body)].map((e) => ({
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
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { id } = request.params as { id: string };
      const body = request.body as PatchReviewQueueViewBodyType;

      try {
        const view = await svc.patchView(id, request.user, body);
        return reply.send(view);
      } catch (err) {
        if (err instanceof ChartAuditNotFoundError) {
          return reply.code(404).send({ error: { message: err.message } });
        }
        throw err;
      }
    },
  );

  // ── DELETE /review-queue/views/:id ────────────────────────────────────────

  fastify.delete(
    "/review-queue/views/:id",
    {
      schema: {
        tags: ["Chart Audit"],
        summary: "Delete a saved view (own views only)",
        params: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" } },
          required: ["id"],
        },
      },
    },
    async (request, reply) => {
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { id } = request.params as { id: string };

      try {
        await svc.deleteView(id, request.user);
        return reply.code(204).send();
      } catch (err) {
        if (err instanceof ChartAuditNotFoundError) {
          return reply.code(404).send({ error: { message: err.message } });
        }
        throw err;
      }
    },
  );

  // ── POST /review-queue/bulk-action ────────────────────────────────────────

  fastify.post(
    "/review-queue/bulk-action",
    {
      schema: {
        tags: ["Chart Audit"],
        summary: "Encounter-level bulk QA action (ASSIGN / REQUEST_REVISION / ACKNOWLEDGE) — atomic",
        // No response schema — handler returns mixed 200/400/403
      },
      preValidation: [
        async (request, reply) => {
          if (!Validators.ReviewQueueBulkActionBody.Check(request.body)) {
            return reply.code(400).send({
              error: {
                message: "Invalid bulk action body",
                errors: [...Validators.ReviewQueueBulkActionBody.Errors(request.body)].map((e) => ({
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
      if (!request.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      if (!SUPERVISOR_ROLES.has(request.user.role)) {
        return reply.code(403).send({ error: { message: "Supervisor role required" } });
      }
      const body = request.body as ReviewQueueBulkActionBodyType;
      const result = await svc.bulkReviewQueueAction(request.user, body);
      return reply.send(result);
    },
  );
}
