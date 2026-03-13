/**
 * ERA 835 + Remittance Reconciliation Routes — T3-7b
 *
 * POST   /api/v1/remittances/ingest              → clearinghouse webhook / file drop
 * GET    /api/v1/remittances                     → list 835 batches
 * GET    /api/v1/remittances/unmatched           → exception queue with aging
 * GET    /api/v1/remittances/:id                 → batch detail + postings + unmatched
 * POST   /api/v1/remittances/unmatched/:id/match → manual match to claim
 * POST   /api/v1/remittances/unmatched/:id/post  → manual post after match
 * GET    /api/v1/claims/:id/remittance           → all postings for a claim
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  ClaimRemittanceResponseSchema,
  IngestERABodySchema,
  IngestERAResultSchema,
  ManualMatchBodySchema,
  ManualPostBodySchema,
  Remittance835DetailSchema,
  RemittanceListQuerySchema,
  RemittanceListResponseSchema,
  UnmatchedRemittanceListResponseSchema,
} from "../schemas/era835.schema.js";
import type {
  IngestERABody,
  ManualMatchBody,
  ManualPostBody,
  RemittanceListQuery,
} from "../schemas/era835.schema.js";
import {
  ClaimNotFoundForMatchError,
  ERA835ParseError,
  ERA835Service,
  UnmatchedNotYetMatchedError,
  UnmatchedRemittanceNotFoundError,
} from "../services/era835.service.js";

export async function era835Routes(fastify: FastifyInstance): Promise<void> {
  const svc = new ERA835Service(fastify.log);

  // ── POST /remittances/ingest ─────────────────────────────────────────────────
  fastify.post<{ Body: IngestERABody }>(
    "/remittances/ingest",
    {
      schema: {
        body: IngestERABodySchema,
        response: { 202: IngestERAResultSchema },
        tags: ["Remittances"],
        summary: "Ingest 835 ERA file from clearinghouse webhook or manual upload",
      },
    },
    async (req, reply: FastifyReply) => {
      const userId = req.user?.id ?? "system";
      try {
        const result = await svc.ingestERA(req.body, userId);
        return reply.status(202).send({
          remittanceId: result.remittanceId,
          matched: result.matched,
          unmatched: result.unmatched,
          status: result.unmatched === 0 ? "POSTED" : "PARTIAL",
        });
      } catch (err) {
        if (err instanceof ERA835ParseError) {
          return reply.status(422).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  // ── GET /remittances ─────────────────────────────────────────────────────────
  fastify.get<{ Querystring: RemittanceListQuery }>(
    "/remittances",
    {
      schema: {
        querystring: RemittanceListQuerySchema,
        response: { 200: RemittanceListResponseSchema },
        tags: ["Remittances"],
        summary: "List 835 batches filterable by payer, date, posting status",
      },
    },
    async (req, reply: FastifyReply) => {
      const locationId = req.user?.locationId;
      if (!locationId) return reply.status(403).send({ error: "No location context" });

      const result = await svc.listRemittances(locationId, req.query);
      return reply.send(result);
    },
  );

  // ── GET /remittances/unmatched ───────────────────────────────────────────────
  // Must be declared before /remittances/:id to avoid param collision
  fastify.get(
    "/remittances/unmatched",
    {
      schema: {
        response: { 200: UnmatchedRemittanceListResponseSchema },
        tags: ["Remittances"],
        summary: "Exception queue — unmatched 835 items with aging",
      },
    },
    async (req: FastifyRequest<{ Querystring: { page?: number; pageSize?: number } }>, reply: FastifyReply) => {
      const locationId = req.user?.locationId;
      if (!locationId) return reply.status(403).send({ error: "No location context" });

      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 25;
      const result = await svc.listUnmatched(locationId, page, pageSize);
      return reply.send(result);
    },
  );

  // ── GET /remittances/:id ─────────────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    "/remittances/:id",
    {
      schema: {
        params: { type: "object", properties: { id: { type: "string", format: "uuid" } }, required: ["id"] },
        response: { 200: Remittance835DetailSchema },
        tags: ["Remittances"],
        summary: "Batch detail — header + postings + unmatched items",
      },
    },
    async (req, reply: FastifyReply) => {
      const locationId = req.user?.locationId;
      if (!locationId) return reply.status(403).send({ error: "No location context" });

      const detail = await svc.getRemittanceDetail(req.params.id, locationId);
      if (!detail) return reply.status(404).send({ error: "Remittance not found" });
      return reply.send(detail);
    },
  );

  // ── POST /remittances/unmatched/:id/match ────────────────────────────────────
  fastify.post<{ Params: { id: string }; Body: ManualMatchBody }>(
    "/remittances/unmatched/:id/match",
    {
      schema: {
        params: { type: "object", properties: { id: { type: "string", format: "uuid" } }, required: ["id"] },
        body: ManualMatchBodySchema,
        response: { 204: {} },
        tags: ["Remittances"],
        summary: "Manually match an unmatched remittance item to a claim",
      },
    },
    async (req, reply: FastifyReply) => {
      const locationId = req.user?.locationId;
      const userId = req.user?.id;
      if (!locationId || !userId) return reply.status(403).send({ error: "No location context" });

      try {
        await svc.manualMatch(req.params.id, locationId, req.body, userId);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof UnmatchedRemittanceNotFoundError || err instanceof ClaimNotFoundForMatchError) {
          return reply.status(err.statusCode).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  // ── POST /remittances/unmatched/:id/post ─────────────────────────────────────
  fastify.post<{ Params: { id: string }; Body: ManualPostBody }>(
    "/remittances/unmatched/:id/post",
    {
      schema: {
        params: { type: "object", properties: { id: { type: "string", format: "uuid" } }, required: ["id"] },
        body: ManualPostBodySchema,
        response: { 204: {} },
        tags: ["Remittances"],
        summary: "Manually post a matched unmatched remittance item",
      },
    },
    async (req, reply: FastifyReply) => {
      const locationId = req.user?.locationId;
      const userId = req.user?.id;
      if (!locationId || !userId) return reply.status(403).send({ error: "No location context" });

      try {
        await svc.manualPost(req.params.id, locationId, userId);
        return reply.status(204).send();
      } catch (err) {
        if (
          err instanceof UnmatchedRemittanceNotFoundError ||
          err instanceof UnmatchedNotYetMatchedError
        ) {
          return reply.status(err.statusCode).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  // ── GET /claims/:id/remittance ───────────────────────────────────────────────
  fastify.get<{ Params: { id: string } }>(
    "/claims/:id/remittance",
    {
      schema: {
        params: { type: "object", properties: { id: { type: "string", format: "uuid" } }, required: ["id"] },
        response: { 200: ClaimRemittanceResponseSchema },
        tags: ["Claims", "Remittances"],
        summary: "All ERA postings for a specific claim — payment/adjustment breakdown",
      },
    },
    async (req, reply: FastifyReply) => {
      const locationId = req.user?.locationId;
      if (!locationId) return reply.status(403).send({ error: "No location context" });

      const result = await svc.getClaimRemittance(req.params.id, locationId);
      return reply.send(result);
    },
  );
}
