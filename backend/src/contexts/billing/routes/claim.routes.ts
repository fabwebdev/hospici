/**
 * Claim Workbench Routes — T3-7a
 *
 * All routes registered at /api/v1:
 *   POST   /claims                     → createClaim
 *   GET    /claims                     → listClaims
 *   GET    /claims/:id                 → getClaimDetail
 *   POST   /claims/:id/audit           → triggerAudit  (stub — T3-12)
 *   POST   /claims/submit              → bulkSubmit
 *   POST   /claims/:id/hold            → holdClaim
 *   POST   /claims/:id/unhold          → unholdClaim
 *   POST   /claims/:id/replace         → replaceClaim
 *   POST   /claims/:id/void            → voidClaim
 *   POST   /claims/:id/retry           → retryRejectedClaim
 *   GET    /claims/:id/download        → downloadX12 (raw 837i text)
 */

import { db } from "@/db/client.js";
import {
  billHolds,
  claimRejections,
  claimRevisions,
  claimSubmissions,
} from "@/db/schema/claims.table.js";
import { and, desc, isNull, sql } from "drizzle-orm";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  BulkSubmitBodySchema,
  BulkSubmitResponseSchema,
  ClaimDetailResponseSchema,
  ClaimListQuerySchema,
  ClaimListResponseSchema,
  CreateClaimBodySchema,
  HoldBodySchema,
  ReplaceClaimBodySchema,
} from "../schemas/claim.schema.js";
import type {
  BulkSubmitBody,
  ClaimListQuery,
  CreateClaimBody,
  HoldBody,
  ReplaceClaimBody,
} from "../schemas/claim.schema.js";
import {
  ClaimAlreadyOnHoldError,
  ClaimNotFoundError,
  ClaimNotOnHoldError,
  ClaimService,
  InvalidClaimTransitionError,
} from "../services/claim.service.js";
import { ClaimReadinessService } from "../services/claimReadiness.service.js";
import { X12Service } from "../services/x12.service.js";
import type { X12GeneratorInput } from "../services/x12.service.js";

// ── Param schemas ─────────────────────────────────────────────────────────────

const idParams = {
  type: "object",
  properties: { id: { type: "string", format: "uuid" } },
  required: ["id"],
} as const;

// ── Error reply helper ─────────────────────────────────────────────────────────

function handleError(err: unknown, reply: FastifyReply): void {
  if (err instanceof ClaimNotFoundError) {
    reply.code(404).send({ success: false, error: { code: "NOT_FOUND", message: err.message } });
    return;
  }
  if (err instanceof InvalidClaimTransitionError) {
    reply
      .code(409)
      .send({ success: false, error: { code: "INVALID_TRANSITION", message: err.message } });
    return;
  }
  if (err instanceof ClaimAlreadyOnHoldError) {
    reply
      .code(409)
      .send({ success: false, error: { code: "ALREADY_ON_HOLD", message: err.message } });
    return;
  }
  if (err instanceof ClaimNotOnHoldError) {
    reply.code(409).send({ success: false, error: { code: "NOT_ON_HOLD", message: err.message } });
    return;
  }
  throw err;
}

// ── Route plugin ──────────────────────────────────────────────────────────────

export async function claimRoutes(app: FastifyInstance): Promise<void> {
  // ── RLS context injection ───────────────────────────────────────────────────
  // The global registerRLSMiddleware already injects RLS for all routes, but
  // we re-assert here as an explicit preHandler so the intent is clear for
  // readers of this file.
  app.addHook("preHandler", async (req) => {
    if (!req.user) return; // Unauthenticated requests short-circuit at the global hook
    const { id: userId, locationId } = req.user;
    await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    await db.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);
  });

  // ── POST /claims ─────────────────────────────────────────────────────────────

  app.post<{ Body: CreateClaimBody }>(
    "/claims",
    {
      schema: {
        tags: ["Claims"],
        summary: "Create a new hospice claim",
        body: CreateClaimBodySchema,
        response: {
          201: { type: "object" },
          400: { type: "object" },
        },
      },
    },
    async (req, reply) => {
      if (!req.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { id: userId, locationId } = req.user;
      try {
        const claim = await ClaimService.createClaim(req.body, userId, locationId, req.log);
        reply.code(201).send({ success: true, data: { claim } });
      } catch (err) {
        handleError(err, reply);
      }
    },
  );

  // ── GET /claims ───────────────────────────────────────────────────────────────

  app.get<{ Querystring: ClaimListQuery }>(
    "/claims",
    {
      schema: {
        tags: ["Claims"],
        summary: "List claims for the authenticated location",
        querystring: ClaimListQuerySchema,
        response: {
          200: ClaimListResponseSchema,
        },
      },
    },
    async (req, reply) => {
      if (!req.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { locationId } = req.user;
      const query = req.query;
      const { claims, total } = await ClaimService.listClaims(query, locationId);
      const page = query.page ?? 1;
      const limit = query.limit ?? 25;
      reply.send({ success: true, data: { claims, total, page, limit } });
    },
  );

  // ── GET /claims/:id ───────────────────────────────────────────────────────────

  app.get(
    "/claims/:id",
    {
      schema: {
        tags: ["Claims"],
        summary: "Get claim detail including revisions, submissions, rejections, and readiness",
        params: idParams,
        response: {
          200: ClaimDetailResponseSchema,
          404: { type: "object" },
        },
      },
    },
    async (req, reply) => {
      if (!req.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { id } = req.params as { id: string };
      const { locationId } = req.user;

      try {
        const claim = await ClaimService.getClaim(id, locationId);
        if (!claim) throw new ClaimNotFoundError(id);

        const [revisions, submissions, rejections, activeHoldRows, readiness] = await Promise.all([
          db
            .select()
            .from(claimRevisions)
            .where(eq(claimRevisions.claimId, id))
            .orderBy(desc(claimRevisions.transitionedAt)),
          db
            .select()
            .from(claimSubmissions)
            .where(eq(claimSubmissions.claimId, id))
            .orderBy(desc(claimSubmissions.submittedAt)),
          db
            .select()
            .from(claimRejections)
            .where(eq(claimRejections.claimId, id))
            .orderBy(desc(claimRejections.createdAt)),
          db
            .select()
            .from(billHolds)
            .where(and(eq(billHolds.claimId, id), isNull(billHolds.releasedAt)))
            .orderBy(desc(billHolds.placedAt))
            .limit(1),
          ClaimReadinessService.check(claim),
        ]);

        reply.send({
          success: true,
          data: {
            claim,
            revisions,
            submissions,
            rejections,
            activeHold: activeHoldRows[0] ?? null,
            readiness,
          },
        });
      } catch (err) {
        handleError(err, reply);
      }
    },
  );

  // ── POST /claims/:id/audit ────────────────────────────────────────────────────
  // TODO: Full audit engine wired in T3-12. Transitions to READY_FOR_AUDIT only.

  app.post(
    "/claims/:id/audit",
    {
      schema: {
        tags: ["Claims"],
        summary: "Trigger audit for a claim (stub — full engine wired in T3-12)",
        params: idParams,
        response: {
          200: { type: "object" },
          404: { type: "object" },
          409: { type: "object" },
        },
      },
    },
    async (req, reply) => {
      if (!req.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { id } = req.params as { id: string };
      const { id: userId, locationId } = req.user;
      try {
        const claim = await ClaimService.transitionState(
          id,
          "READY_FOR_AUDIT",
          userId,
          locationId,
          "Audit triggered by user",
          req.log,
        );
        reply.send({ success: true, data: { claim } });
      } catch (err) {
        handleError(err, reply);
      }
    },
  );

  // ── POST /claims/submit ───────────────────────────────────────────────────────
  // NOTE: Registered as a static path before /claims/:id to prevent Fastify
  // from treating "submit" as an :id param value.

  app.post<{ Body: BulkSubmitBody }>(
    "/claims/submit",
    {
      schema: {
        tags: ["Claims"],
        summary: "Bulk-queue multiple READY_TO_SUBMIT claims for submission",
        body: BulkSubmitBodySchema,
        response: {
          200: BulkSubmitResponseSchema,
          400: { type: "object" },
        },
      },
    },
    async (req, reply) => {
      if (!req.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { locationId } = req.user;
      const { claimIds } = req.body;
      const result = await ClaimService.queueSubmission(claimIds, locationId, req.log);
      reply.send({ success: true, data: result });
    },
  );

  // ── POST /claims/:id/hold ─────────────────────────────────────────────────────

  app.post<{ Body: HoldBody }>(
    "/claims/:id/hold",
    {
      schema: {
        tags: ["Claims"],
        summary: "Place a bill hold on a claim",
        params: idParams,
        body: HoldBodySchema,
        response: {
          201: { type: "object" },
          404: { type: "object" },
          409: { type: "object" },
        },
      },
    },
    async (req, reply) => {
      if (!req.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { id } = req.params as { id: string };
      const { id: userId, locationId } = req.user;
      try {
        const hold = await ClaimService.holdClaim(id, req.body, userId, locationId);
        reply.code(201).send({ success: true, data: { hold } });
      } catch (err) {
        handleError(err, reply);
      }
    },
  );

  // ── POST /claims/:id/unhold ───────────────────────────────────────────────────

  app.post(
    "/claims/:id/unhold",
    {
      schema: {
        tags: ["Claims"],
        summary: "Release a bill hold on a claim",
        params: idParams,
        response: {
          200: { type: "object" },
          404: { type: "object" },
          409: { type: "object" },
        },
      },
    },
    async (req, reply) => {
      if (!req.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { id } = req.params as { id: string };
      const { id: userId, locationId } = req.user;
      try {
        await ClaimService.unholdClaim(id, userId, locationId);
        reply.send({ success: true });
      } catch (err) {
        handleError(err, reply);
      }
    },
  );

  // ── POST /claims/:id/replace ──────────────────────────────────────────────────

  app.post<{ Body: ReplaceClaimBody }>(
    "/claims/:id/replace",
    {
      schema: {
        tags: ["Claims"],
        summary: "Replace a claim (void original, create replacement with correctedFromId)",
        params: idParams,
        body: ReplaceClaimBodySchema,
        response: {
          201: { type: "object" },
          404: { type: "object" },
          409: { type: "object" },
        },
      },
    },
    async (req, reply) => {
      if (!req.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { id } = req.params as { id: string };
      const { id: userId, locationId } = req.user;
      try {
        const replacement = await ClaimService.replaceClaim(
          id,
          req.body,
          userId,
          locationId,
          req.log,
        );
        reply.code(201).send({ success: true, data: { claim: replacement } });
      } catch (err) {
        handleError(err, reply);
      }
    },
  );

  // ── POST /claims/:id/void ─────────────────────────────────────────────────────

  app.post<{ Body: { reason: string } }>(
    "/claims/:id/void",
    {
      schema: {
        tags: ["Claims"],
        summary: "Void a claim",
        params: idParams,
        body: {
          type: "object",
          properties: { reason: { type: "string", minLength: 1 } },
          required: ["reason"],
          additionalProperties: false,
        },
        response: {
          200: { type: "object" },
          404: { type: "object" },
          409: { type: "object" },
        },
      },
    },
    async (req, reply) => {
      if (!req.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { id } = req.params as { id: string };
      const { id: userId, locationId } = req.user;
      const { reason } = req.body;
      try {
        const claim = await ClaimService.voidClaim(id, userId, locationId, reason);
        reply.send({ success: true, data: { claim } });
      } catch (err) {
        handleError(err, reply);
      }
    },
  );

  // ── POST /claims/:id/retry ────────────────────────────────────────────────────

  app.post(
    "/claims/:id/retry",
    {
      schema: {
        tags: ["Claims"],
        summary: "Retry a rejected claim (REJECTED → DRAFT → readiness re-evaluated)",
        params: idParams,
        response: {
          200: { type: "object" },
          404: { type: "object" },
          409: { type: "object" },
        },
      },
    },
    async (req, reply) => {
      if (!req.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { id } = req.params as { id: string };
      const { id: userId, locationId } = req.user;
      try {
        const claim = await ClaimService.retryRejectedClaim(id, userId, locationId, req.log);
        reply.send({ success: true, data: { claim } });
      } catch (err) {
        handleError(err, reply);
      }
    },
  );

  // ── GET /claims/:id/download ──────────────────────────────────────────────────

  app.get(
    "/claims/:id/download",
    {
      schema: {
        tags: ["Claims"],
        summary: "Download the 837I X12 EDI file for a claim",
        params: idParams,
        response: {
          200: { type: "string" },
          404: { type: "object" },
        },
      },
    },
    async (req, reply) => {
      if (!req.user) throw Object.assign(new Error("Not authenticated"), { statusCode: 401 });
      const { id } = req.params as { id: string };
      const { locationId } = req.user;

      try {
        const claim = await ClaimService.getClaim(id, locationId);
        if (!claim) throw new ClaimNotFoundError(id);

        // Generate the X12 EDI on-demand and return the raw string.
        // Call ClaimService.generateAndAttachX12 separately to persist the hashes.
        const input: X12GeneratorInput = {
          claimId: claim.id,
          billType: claim.billType,
          statementFromDate: claim.statementFromDate,
          statementToDate: claim.statementToDate,
          totalCharge: claim.totalCharge,
          payerId: claim.payerId,
          ...(claim.clearinghouseIcn ? { priorClaimIcn: claim.clearinghouseIcn } : {}),
          lines: (
            claim.claimLines as Array<{
              revenueCode: string;
              hcpcsCode?: string | null;
              serviceDate: string;
              units: number;
              lineCharge: number;
            }>
          ).map((l) => ({
            revenueCode: l.revenueCode,
            hcpcsCode: l.hcpcsCode ?? null,
            serviceDate: l.serviceDate,
            units: l.units,
            lineCharge: l.lineCharge,
          })),
        };

        const { x12 } = X12Service.generate(input);

        reply
          .header("Content-Type", "text/plain")
          .header("Content-Disposition", `attachment; filename="claim-${id}.edi"`)
          .send(x12);
      } catch (err) {
        handleError(err, reply);
      }
    },
  );
}
