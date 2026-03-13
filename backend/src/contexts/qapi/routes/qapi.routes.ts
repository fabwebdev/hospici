/**
 * QAPI event routes — T3-11
 * POST   /api/v1/qapi/events
 * GET    /api/v1/qapi/events
 * PATCH  /api/v1/qapi/events/:id
 * POST   /api/v1/qapi/events/:id/action-items
 * PATCH  /api/v1/qapi/events/:id/action-items/:itemId
 * POST   /api/v1/qapi/events/:id/close
 */

import { Validators } from "@/config/typebox-compiler.js";
import { db } from "@/db/client.js";
import { sql } from "drizzle-orm";
import {
  QAPIEventClosedError,
  QAPIEventNotFoundError,
  QAPIService,
} from "../services/qapi.service.js";
import type { FastifyInstance } from "fastify";

export default async function qapiRoutes(fastify: FastifyInstance) {
  // ── POST /qapi/events ─────────────────────────────────────────────────────
  fastify.post(
    "/events",
    {
      preValidation: async (request, reply) => {
        if (!Validators.QAPICreateBody.Check(request.body)) {
          return reply.code(400).send({ error: "Invalid request body" });
        }
      },
    },
    async (request, reply) => {
      if (!request.user) return reply.code(401).send({ error: "Unauthorized" });
      const locationId = request.user.locationId;
      if (!locationId) return reply.code(400).send({ error: "No location context" });

      await db.execute(
        sql`SELECT set_config('app.current_location_id', ${locationId}, true)`,
      );

      const body = request.body as import("../schemas/qapi.schema.js").QAPICreateBodyType;
      const event = await QAPIService.createEvent(body, locationId, request.user.id);

      const io = fastify.io;
      if (io) {
        io.to(`location:${locationId}`).emit("qapi:event:created", {
          eventId: event.id,
          locationId,
          eventType: event.eventType,
        });
      }

      return reply.code(201).send(event);
    },
  );

  // ── GET /qapi/events ──────────────────────────────────────────────────────
  fastify.get(
    "/events",
    {
      preValidation: async (request, reply) => {
        if (!Validators.QAPIListQuery.Check(request.query)) {
          return reply.code(400).send({ error: "Invalid query params" });
        }
      },
    },
    async (request, reply) => {
      if (!request.user) return reply.code(401).send({ error: "Unauthorized" });
      const locationId = request.user.locationId;
      if (!locationId) return reply.code(400).send({ error: "No location context" });

      await db.execute(
        sql`SELECT set_config('app.current_location_id', ${locationId}, true)`,
      );

      const query = request.query as import("../schemas/qapi.schema.js").QAPIListQueryType;
      const result = await QAPIService.listEvents(query, locationId);
      return reply.send(result);
    },
  );

  // ── PATCH /qapi/events/:id ────────────────────────────────────────────────
  fastify.patch(
    "/events/:id",
    {
      preValidation: async (request, reply) => {
        if (!Validators.QAPIPatchBody.Check(request.body)) {
          return reply.code(400).send({ error: "Invalid request body" });
        }
      },
    },
    async (request, reply) => {
      if (!request.user) return reply.code(401).send({ error: "Unauthorized" });
      const locationId = request.user.locationId;
      if (!locationId) return reply.code(400).send({ error: "No location context" });

      await db.execute(
        sql`SELECT set_config('app.current_location_id', ${locationId}, true)`,
      );

      const { id } = request.params as { id: string };
      const body = request.body as import("../schemas/qapi.schema.js").QAPIPatchBodyType;

      try {
        const event = await QAPIService.patchEvent(id, body, locationId, request.user.id);
        return reply.send(event);
      } catch (err) {
        if (err instanceof QAPIEventNotFoundError) return reply.code(404).send({ error: err.message });
        if (err instanceof QAPIEventClosedError) return reply.code(409).send({ error: err.message });
        throw err;
      }
    },
  );

  // ── POST /qapi/events/:id/action-items ────────────────────────────────────
  fastify.post(
    "/events/:id/action-items",
    {
      preValidation: async (request, reply) => {
        if (!Validators.QAPIAddActionItemBody.Check(request.body)) {
          return reply.code(400).send({ error: "Invalid request body" });
        }
      },
    },
    async (request, reply) => {
      if (!request.user) return reply.code(401).send({ error: "Unauthorized" });
      const locationId = request.user.locationId;
      if (!locationId) return reply.code(400).send({ error: "No location context" });

      await db.execute(
        sql`SELECT set_config('app.current_location_id', ${locationId}, true)`,
      );

      const { id } = request.params as { id: string };
      const body =
        request.body as import("../schemas/qapi.schema.js").QAPIAddActionItemBodyType;

      try {
        const event = await QAPIService.addActionItem(id, body, locationId, request.user.id);
        return reply.code(201).send(event);
      } catch (err) {
        if (err instanceof QAPIEventNotFoundError) return reply.code(404).send({ error: err.message });
        if (err instanceof QAPIEventClosedError) return reply.code(409).send({ error: err.message });
        throw err;
      }
    },
  );

  // ── PATCH /qapi/events/:id/action-items/:itemId ───────────────────────────
  fastify.patch(
    "/events/:id/action-items/:itemId",
    {},
    async (request, reply) => {
      if (!request.user) return reply.code(401).send({ error: "Unauthorized" });
      const locationId = request.user.locationId;
      if (!locationId) return reply.code(400).send({ error: "No location context" });

      await db.execute(
        sql`SELECT set_config('app.current_location_id', ${locationId}, true)`,
      );

      const { id, itemId } = request.params as { id: string; itemId: string };

      try {
        const event = await QAPIService.completeActionItem(id, itemId, locationId, request.user.id);
        return reply.send(event);
      } catch (err) {
        if (err instanceof QAPIEventNotFoundError) return reply.code(404).send({ error: err.message });
        throw err;
      }
    },
  );

  // ── POST /qapi/events/:id/close ───────────────────────────────────────────
  fastify.post(
    "/events/:id/close",
    {
      preValidation: async (request, reply) => {
        if (!Validators.QAPICloseBody.Check(request.body)) {
          return reply.code(400).send({ error: "closureEvidence must be ≥ 50 characters" });
        }
      },
    },
    async (request, reply) => {
      if (!request.user) return reply.code(401).send({ error: "Unauthorized" });
      const locationId = request.user.locationId;
      if (!locationId) return reply.code(400).send({ error: "No location context" });

      await db.execute(
        sql`SELECT set_config('app.current_location_id', ${locationId}, true)`,
      );

      const { id } = request.params as { id: string };
      const body = request.body as import("../schemas/qapi.schema.js").QAPICloseBodyType;

      try {
        const event = await QAPIService.closeEvent(id, body, locationId, request.user.id);

        const io = fastify.io;
        if (io) {
          io.to(`location:${locationId}`).emit("qapi:event:closed", {
            eventId: event.id,
            locationId,
          });
        }

        return reply.send(event);
      } catch (err) {
        if (err instanceof QAPIEventNotFoundError) return reply.code(404).send({ error: err.message });
        if (err instanceof QAPIEventClosedError) return reply.code(409).send({ error: err.message });
        throw err;
      }
    },
  );
}
