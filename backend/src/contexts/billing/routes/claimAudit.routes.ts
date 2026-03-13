// contexts/billing/routes/claimAudit.routes.ts
// T3-12: Claim Audit Rules Engine + Bill-Hold Dashboard — Fastify route plugin

import { db } from "@/db/client.js";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { ClaimAuditService } from "../services/claimAudit.service.js";
import type {
  AuditSnapshotResponse,
  BulkHoldBody,
  BulkReleaseBody,
  WarnOverrideBody,
} from "../schemas/claimAudit.schema.js";
import {
  AuditDashboardResponseSchema,
  AuditResultSchema,
  AuditSnapshotResponseSchema,
  BulkHoldBodySchema,
  BulkReleaseBodySchema,
  WarnOverrideBodySchema,
} from "../schemas/claimAudit.schema.js";

// ── Params / shared ───────────────────────────────────────────────────────────

const idParams = {
  type: "object",
  properties: { id: { type: "string", format: "uuid" } },
  required: ["id"],
} as const;

const snapshotParams = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    snapshotId: { type: "string", format: "uuid" },
  },
  required: ["id", "snapshotId"],
} as const;

// ── Role-based access helpers ─────────────────────────────────────────────────

const SUPERVISOR_ROLES = new Set(["supervisor", "admin", "billing_manager"]);
const BILLING_MANAGER_ROLES = new Set(["billing_manager", "admin"]);

function assertRole(userRole: string, allowed: Set<string>): void {
  if (!allowed.has(userRole)) {
    throw Object.assign(new Error("Insufficient role for this operation"), { statusCode: 403 });
  }
}

// ── Route plugin ──────────────────────────────────────────────────────────────

export async function claimAuditRoutes(app: FastifyInstance): Promise<void> {
  // ── RLS context injection ───────────────────────────────────────────────────
  app.addHook("preHandler", async (req) => {
    if (!req.user) return;
    const { id: userId, locationId } = req.user;
    await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    await db.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);
  });

  // ── POST /claims/:id/audit ────────────────────────────────────────────────
  // Runs the full 12-rule audit engine against the specified claim.

  app.post<{ Params: { id: string } }>(
    "/claims/:id/audit",
    {
      schema: {
        tags: ["Claim Audit"],
        summary: "Run the claim audit rules engine",
        params: idParams,
        response: {
          200: AuditResultSchema,
          401: { type: "object" },
          404: { type: "object" },
        },
      },
    },
    async (req, reply) => {
      if (!req.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { id: userId, locationId } = req.user;
      const { id: claimId } = req.params;

      const result = await ClaimAuditService.runAudit(claimId, locationId, userId, req.log);
      reply.send({ success: true, data: result });
    },
  );

  // ── GET /claims/:id/audit ─────────────────────────────────────────────────
  // Returns the latest audit snapshot for a claim.

  app.get<{ Params: { id: string } }>(
    "/claims/:id/audit",
    {
      schema: {
        tags: ["Claim Audit"],
        summary: "Get the latest audit snapshot for a claim",
        params: idParams,
        response: {
          200: { type: "object" },
          401: { type: "object" },
          404: { type: "object" },
        },
      },
    },
    async (req, reply) => {
      if (!req.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { locationId } = req.user;
      const { id: claimId } = req.params;

      const snapshot = await ClaimAuditService.getLatestSnapshot(claimId, locationId);
      if (!snapshot) {
        reply.code(404).send({ success: false, error: { message: "No audit snapshot found for this claim" } });
        return;
      }

      const response: AuditSnapshotResponse = {
        id: snapshot.id,
        claimId: snapshot.claimId,
        claimRevisionId: snapshot.claimRevisionId ?? null,
        locationId: snapshot.locationId,
        auditedAt: snapshot.auditedAt.toISOString(),
        passed: snapshot.passed,
        blockCount: snapshot.blockCount,
        warnCount: snapshot.warnCount,
        failures: snapshot.failures as AuditSnapshotResponse["failures"],
        overrideTrail: snapshot.overrideTrail as AuditSnapshotResponse["overrideTrail"],
        auditedBy: snapshot.auditedBy ?? null,
        createdAt: snapshot.createdAt.toISOString(),
      };

      reply.send({ success: true, data: response });
    },
  );

  // ── GET /claims/:id/audit/history ─────────────────────────────────────────
  // Returns all audit snapshots for a claim, newest first.

  app.get<{ Params: { id: string } }>(
    "/claims/:id/audit/history",
    {
      schema: {
        tags: ["Claim Audit"],
        summary: "Get full audit history for a claim",
        params: idParams,
        response: {
          200: { type: "object" },
          401: { type: "object" },
        },
      },
    },
    async (req, reply) => {
      if (!req.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { locationId } = req.user;
      const { id: claimId } = req.params;

      const snapshots = await ClaimAuditService.getSnapshotHistory(claimId, locationId);

      const responses: AuditSnapshotResponse[] = snapshots.map((snapshot) => ({
        id: snapshot.id,
        claimId: snapshot.claimId,
        claimRevisionId: snapshot.claimRevisionId ?? null,
        locationId: snapshot.locationId,
        auditedAt: snapshot.auditedAt.toISOString(),
        passed: snapshot.passed,
        blockCount: snapshot.blockCount,
        warnCount: snapshot.warnCount,
        failures: snapshot.failures as AuditSnapshotResponse["failures"],
        overrideTrail: snapshot.overrideTrail as AuditSnapshotResponse["overrideTrail"],
        auditedBy: snapshot.auditedBy ?? null,
        createdAt: snapshot.createdAt.toISOString(),
      }));

      reply.send({ success: true, data: responses });
    },
  );

  // ── POST /claims/:id/audit/override ──────────────────────────────────────
  // Supervisor WARN override — appends to override_trail on latest snapshot.
  // Roles: supervisor, admin, billing_manager

  app.post<{ Params: { id: string }; Body: WarnOverrideBody }>(
    "/claims/:id/audit/override",
    {
      schema: {
        tags: ["Claim Audit"],
        summary: "Override a WARN rule failure (supervisor)",
        params: idParams,
        body: WarnOverrideBodySchema,
        response: {
          200: { type: "object" },
          401: { type: "object" },
          403: { type: "object" },
          404: { type: "object" },
        },
      },
    },
    async (req, reply) => {
      if (!req.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { id: userId, locationId, role } = req.user;

      assertRole(role, SUPERVISOR_ROLES);

      const { id: claimId } = req.params;
      const { ruleCode, reason } = req.body;

      // Find latest snapshot for this claim
      const latest = await ClaimAuditService.getLatestSnapshot(claimId, locationId);
      if (!latest) {
        reply.code(404).send({
          success: false,
          error: { message: "No audit snapshot found for this claim" },
        });
        return;
      }

      const updated = await ClaimAuditService.overrideWarn(
        latest.id,
        ruleCode,
        reason,
        userId,
        claimId,
        locationId,
        req.log,
      );

      reply.send({ success: true, data: { snapshotId: updated.id, overrideTrail: updated.overrideTrail } });
    },
  );

  // ── POST /claims/bulk-hold ────────────────────────────────────────────────
  // Place a manual hold on multiple claims atomically.
  // Role: billing_manager, admin

  app.post<{ Body: BulkHoldBody }>(
    "/claims/bulk-hold",
    {
      schema: {
        tags: ["Claim Audit"],
        summary: "Place a hold on multiple claims",
        body: BulkHoldBodySchema,
        response: {
          200: { type: "object" },
          401: { type: "object" },
          403: { type: "object" },
        },
      },
    },
    async (req, reply) => {
      if (!req.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { id: userId, locationId, role } = req.user;

      assertRole(role, BILLING_MANAGER_ROLES);

      const { claimIds, holdReason } = req.body;
      const result = await ClaimAuditService.bulkHold(
        claimIds,
        holdReason,
        userId,
        locationId,
        req.log,
      );

      reply.send({ success: true, data: result });
    },
  );

  // ── POST /claims/bulk-release-hold ────────────────────────────────────────
  // Release holds on multiple claims atomically.
  // Role: billing_manager, admin

  app.post<{ Body: BulkReleaseBody }>(
    "/claims/bulk-release-hold",
    {
      schema: {
        tags: ["Claim Audit"],
        summary: "Release holds on multiple claims",
        body: BulkReleaseBodySchema,
        response: {
          200: { type: "object" },
          401: { type: "object" },
          403: { type: "object" },
        },
      },
    },
    async (req, reply) => {
      if (!req.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { id: userId, locationId, role } = req.user;

      assertRole(role, BILLING_MANAGER_ROLES);

      const { claimIds } = req.body;
      const result = await ClaimAuditService.bulkReleaseHold(
        claimIds,
        userId,
        locationId,
        req.log,
      );

      reply.send({ success: true, data: result });
    },
  );

  // ── GET /billing/audit-dashboard ──────────────────────────────────────────
  // Returns all 7 dashboard sections for the authenticated location.

  app.get(
    "/billing/audit-dashboard",
    {
      schema: {
        tags: ["Claim Audit"],
        summary: "Bill-Hold Dashboard — all 7 sections",
        response: {
          200: { type: "object" },
          401: { type: "object" },
        },
      },
    },
    async (req, reply) => {
      if (!req.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { locationId } = req.user;

      const dashboard = await ClaimAuditService.getAuditDashboard(locationId);
      reply.send({ success: true, data: dashboard });
    },
  );
}
