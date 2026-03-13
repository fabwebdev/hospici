// contexts/compliance/routes/auditExport.routes.ts
// T3-10: ADR / TPE / Survey Record Packet Export — Fastify route plugin.
//
// Registered at /api/v1/patients (patient-scoped):
//   POST   /:patientId/audit-exports               → 202 { exportId }
//   GET    /:patientId/audit-exports               → paginated list
//   GET    /:patientId/audit-exports/:exportId     → poll status
//   GET    /:patientId/audit-exports/:exportId/download → get download URL

import { db } from "@/db/client.js";
import { sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  AuditRecordExportDownloadResponseSchema,
  AuditRecordExportListResponseSchema,
  AuditRecordExportRequestSchema,
  AuditRecordExportSchema,
} from "../schemas/auditExport.schema.js";
import {
  AuditExportNotFoundError,
  AuditExportNotReadyError,
  AuditExportService,
} from "../services/auditExport.service.js";

// ── Role enforcement ──────────────────────────────────────────────────────────

const ALLOWED_ROLES = new Set(["compliance_officer", "super_admin"]);

// ── Param schemas ─────────────────────────────────────────────────────────────

const patientExportParams = {
  type: "object",
  properties: {
    patientId: { type: "string", format: "uuid" },
  },
  required: ["patientId"],
} as const;

const exportIdParams = {
  type: "object",
  properties: {
    patientId: { type: "string", format: "uuid" },
    exportId: { type: "string", format: "uuid" },
  },
  required: ["patientId", "exportId"],
} as const;

const paginationQuery = {
  type: "object",
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    offset: { type: "integer", minimum: 0, default: 0 },
  },
  additionalProperties: false,
} as const;

const downloadQuery = {
  type: "object",
  properties: {
    format: { type: "string", enum: ["pdf", "zip"] },
  },
  required: ["format"],
  additionalProperties: false,
} as const;

const errorResponse = {
  type: "object",
  properties: { error: { type: "string" } },
} as const;

// ── Error handler ─────────────────────────────────────────────────────────────

function handleExportError(err: unknown, reply: FastifyReply): void {
  if (err instanceof AuditExportNotFoundError) {
    reply.code(404).send({ error: err.message });
    return;
  }
  if (err instanceof AuditExportNotReadyError) {
    reply.code(400).send({ error: err.message });
    return;
  }
  throw err;
}

// ── Route plugin ──────────────────────────────────────────────────────────────

export default async function auditExportRoutes(app: FastifyInstance): Promise<void> {
  // Inject RLS context for every request in this plugin
  app.addHook("preHandler", async (req) => {
    if (!req.user) return;
    const { id: userId, locationId } = req.user;
    await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    await db.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);
  });

  // ── POST /:patientId/audit-exports ─────────────────────────────────────────

  app.post(
    "/:patientId/audit-exports",
    {
      schema: {
        tags: ["Audit Exports"],
        summary: "Request a new ADR/TPE/Survey record packet export",
        params: patientExportParams,
        body: AuditRecordExportRequestSchema,
        response: {
          202: {
            type: "object",
            properties: { exportId: { type: "string", format: "uuid" } },
            required: ["exportId"],
          },
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    async (req, reply) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      if (!ALLOWED_ROLES.has(req.user.role)) {
        return reply.code(403).send({ error: "Forbidden: compliance_officer or super_admin role required" });
      }

      const { patientId } = req.params as { patientId: string };
      const body = req.body as {
        patientId: string;
        purpose: string;
        dateRangeFrom: string;
        dateRangeTo: string;
        selectedSections: string[];
        includeAuditLog: boolean;
        includeCompletenessSummary: boolean;
      };

      const result = await AuditExportService.createExport(
        db,
        patientId,
        req.user.id,
        req.user.locationId,
        {
          purpose: body.purpose,
          dateRangeFrom: body.dateRangeFrom,
          dateRangeTo: body.dateRangeTo,
          selectedSections: body.selectedSections,
          includeAuditLog: body.includeAuditLog,
          includeCompletenessSummary: body.includeCompletenessSummary,
        },
      );

      return reply.code(202).send(result);
    },
  );

  // ── GET /:patientId/audit-exports ──────────────────────────────────────────

  app.get(
    "/:patientId/audit-exports",
    {
      schema: {
        tags: ["Audit Exports"],
        summary: "List audit export history for a patient (most recent first)",
        params: patientExportParams,
        querystring: paginationQuery,
        response: {
          200: AuditRecordExportListResponseSchema,
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    async (req, reply) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      if (!ALLOWED_ROLES.has(req.user.role)) {
        return reply.code(403).send({ error: "Forbidden: compliance_officer or super_admin role required" });
      }

      const { patientId } = req.params as { patientId: string };
      const { limit = 20, offset = 0 } = req.query as { limit?: number; offset?: number };

      const result = await AuditExportService.listExports(
        db,
        patientId,
        req.user.locationId,
        { limit, offset },
      );

      return reply.send(result);
    },
  );

  // ── GET /:patientId/audit-exports/:exportId ────────────────────────────────

  app.get(
    "/:patientId/audit-exports/:exportId",
    {
      schema: {
        tags: ["Audit Exports"],
        summary: "Get a single audit export record (poll for status)",
        params: exportIdParams,
        response: {
          200: AuditRecordExportSchema,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      if (!ALLOWED_ROLES.has(req.user.role)) {
        return reply.code(403).send({ error: "Forbidden: compliance_officer or super_admin role required" });
      }

      const { patientId, exportId } = req.params as { patientId: string; exportId: string };

      try {
        const result = await AuditExportService.getExport(
          db,
          exportId,
          patientId,
          req.user.locationId,
        );
        return reply.send(result);
      } catch (err) {
        handleExportError(err, reply);
      }
    },
  );

  // ── GET /:patientId/audit-exports/:exportId/download ──────────────────────

  app.get(
    "/:patientId/audit-exports/:exportId/download",
    {
      schema: {
        tags: ["Audit Exports"],
        summary: "Get a time-limited download URL for a READY export",
        params: exportIdParams,
        querystring: downloadQuery,
        response: {
          200: AuditRecordExportDownloadResponseSchema,
          400: errorResponse,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      if (!ALLOWED_ROLES.has(req.user.role)) {
        return reply.code(403).send({ error: "Forbidden: compliance_officer or super_admin role required" });
      }

      const { patientId, exportId } = req.params as { patientId: string; exportId: string };
      const { format } = req.query as { format: "pdf" | "zip" };

      try {
        const result = await AuditExportService.getDownloadUrl(
          db,
          exportId,
          patientId,
          req.user.locationId,
          format,
          req.user.id,
        );
        return reply.send(result);
      } catch (err) {
        handleExportError(err, reply);
      }
    },
  );
}
