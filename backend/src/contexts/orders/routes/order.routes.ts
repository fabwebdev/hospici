// contexts/orders/routes/order.routes.ts
// T3-9: Physician Order Inbox + Paperless Order Routing — Fastify route plugin

import { db } from "@/db/client.js";
import { sql } from "drizzle-orm";
import type { FastifyInstance, FastifyReply } from "fastify";
import {
  CreateOrderBodySchema,
  ExceptionOrderBodySchema,
  OrderInboxResponseSchema,
  OrderListResponseSchema,
  OrderResponseSchema,
  RejectOrderBodySchema,
  ResendOrderBodySchema,
  SignOrderBodySchema,
} from "../schemas/order.schema.js";
import {
  OrderInsufficientRoleError,
  OrderInvalidTransitionError,
  OrderNotFoundError,
  OrderService,
} from "../services/order.service.js";

// ── Role sets ─────────────────────────────────────────────────────────────────

const SUPERVISOR_ROLES = new Set(["supervisor", "super_admin", "compliance_officer"]);

// ── Param schemas ─────────────────────────────────────────────────────────────

const idParams = {
  type: "object",
  properties: { id: { type: "string", format: "uuid" } },
  required: ["id"],
} as const;

const patientIdParams = {
  type: "object",
  properties: { patientId: { type: "string", format: "uuid" } },
  required: ["patientId"],
} as const;

const errorResponse = {
  type: "object",
  properties: { error: { type: "string" } },
} as const;

// ── Error handler ─────────────────────────────────────────────────────────────

function handleOrderError(err: unknown, reply: FastifyReply): void {
  if (err instanceof OrderNotFoundError) {
    reply.code(404).send({ error: err.message });
    return;
  }
  if (err instanceof OrderInvalidTransitionError) {
    reply.code(422).send({ error: err.message, code: err.code });
    return;
  }
  if (err instanceof OrderInsufficientRoleError) {
    reply.code(403).send({ error: err.message });
    return;
  }
  throw err;
}

// ── Order routes (registered at /api/v1) ──────────────────────────────────────

export async function orderRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (req) => {
    if (!req.user) return;
    const { id: userId, locationId } = req.user;
    await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    await db.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);
  });

  // POST /api/v1/orders — create order
  app.post(
    "/orders",
    {
      schema: {
        tags: ["Orders"],
        body: CreateOrderBodySchema,
        response: {
          201: OrderResponseSchema,
          401: errorResponse,
          422: errorResponse,
        },
      },
    },
    async (req, reply) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      try {
        const service = new OrderService(app.log);
        const result = await service.createOrder(req.body as never, req.user.id, req.user.locationId);
        return reply.code(201).send(result);
      } catch (err) {
        handleOrderError(err, reply);
      }
    },
  );

  // GET /api/v1/orders/inbox — physician inbox
  app.get(
    "/orders/inbox",
    {
      schema: {
        tags: ["Orders"],
        querystring: {
          type: "object",
          properties: {
            status: { type: "string" },
            page: { type: "integer", minimum: 1 },
            limit: { type: "integer", minimum: 1, maximum: 100 },
          },
        },
        response: {
          200: OrderInboxResponseSchema,
          401: errorResponse,
        },
      },
    },
    async (req, reply) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      const service = new OrderService(app.log);
      const result = await service.getInbox(
        req.user.id,
        req.query as { status?: string; page?: number; limit?: number },
        req.user.id,
        req.user.locationId,
      );
      return reply.send(result);
    },
  );

  // GET /api/v1/orders/overdue — overdue list (supervisor/admin)
  app.get(
    "/orders/overdue",
    {
      schema: {
        tags: ["Orders"],
        response: {
          200: OrderListResponseSchema,
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    async (req, reply) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      if (!SUPERVISOR_ROLES.has(req.user.role)) {
        return reply.code(403).send({ error: "Forbidden: supervisor role required" });
      }
      const service = new OrderService(app.log);
      const result = await service.listOverdue(req.user.id, req.user.locationId);
      return reply.send(result);
    },
  );

  // GET /api/v1/orders/:id — order detail
  app.get(
    "/orders/:id",
    {
      schema: {
        tags: ["Orders"],
        params: idParams,
        response: {
          200: OrderResponseSchema,
          401: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      try {
        const service = new OrderService(app.log);
        const { id } = req.params as { id: string };
        const result = await service.getOrder(id, req.user.id, req.user.locationId);
        return reply.send(result);
      } catch (err) {
        handleOrderError(err, reply);
      }
    },
  );

  // POST /api/v1/orders/:id/viewed — mark viewed
  app.post(
    "/orders/:id/viewed",
    {
      schema: {
        tags: ["Orders"],
        params: idParams,
        response: {
          200: OrderResponseSchema,
          401: errorResponse,
          404: errorResponse,
          422: errorResponse,
        },
      },
    },
    async (req, reply) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      try {
        const service = new OrderService(app.log);
        const { id } = req.params as { id: string };
        const result = await service.markViewed(id, req.user.id, req.user.locationId);
        return reply.send(result);
      } catch (err) {
        handleOrderError(err, reply);
      }
    },
  );

  // POST /api/v1/orders/:id/sign
  app.post(
    "/orders/:id/sign",
    {
      schema: {
        tags: ["Orders"],
        params: idParams,
        body: SignOrderBodySchema,
        response: {
          200: OrderResponseSchema,
          401: errorResponse,
          404: errorResponse,
          422: errorResponse,
        },
      },
    },
    async (req, reply) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      try {
        const service = new OrderService(app.log);
        const { id } = req.params as { id: string };
        const result = await service.signOrder(
          id,
          req.body as never,
          req.user.id,
          req.user.locationId,
        );
        return reply.send(result);
      } catch (err) {
        handleOrderError(err, reply);
      }
    },
  );

  // POST /api/v1/orders/:id/reject
  app.post(
    "/orders/:id/reject",
    {
      schema: {
        tags: ["Orders"],
        params: idParams,
        body: RejectOrderBodySchema,
        response: {
          200: OrderResponseSchema,
          401: errorResponse,
          404: errorResponse,
          422: errorResponse,
        },
      },
    },
    async (req, reply) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      try {
        const service = new OrderService(app.log);
        const { id } = req.params as { id: string };
        const { rejectionReason } = req.body as { rejectionReason: string };
        const result = await service.rejectOrder(
          id,
          rejectionReason,
          req.user.id,
          req.user.locationId,
        );
        return reply.send(result);
      } catch (err) {
        handleOrderError(err, reply);
      }
    },
  );

  // POST /api/v1/orders/:id/void — supervisor/admin only
  app.post(
    "/orders/:id/void",
    {
      schema: {
        tags: ["Orders"],
        params: idParams,
        response: {
          200: OrderResponseSchema,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          422: errorResponse,
        },
      },
    },
    async (req, reply) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      if (!SUPERVISOR_ROLES.has(req.user.role)) {
        return reply.code(403).send({ error: "Forbidden: supervisor role required" });
      }
      try {
        const service = new OrderService(app.log);
        const { id } = req.params as { id: string };
        const result = await service.voidOrder(id, req.user.id, req.user.locationId);
        return reply.send(result);
      } catch (err) {
        handleOrderError(err, reply);
      }
    },
  );

  // POST /api/v1/orders/:id/exception — no-signature-required (supervisor/admin)
  app.post(
    "/orders/:id/exception",
    {
      schema: {
        tags: ["Orders"],
        params: idParams,
        body: ExceptionOrderBodySchema,
        response: {
          200: OrderResponseSchema,
          401: errorResponse,
          403: errorResponse,
          404: errorResponse,
          422: errorResponse,
        },
      },
    },
    async (req, reply) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      if (!SUPERVISOR_ROLES.has(req.user.role)) {
        return reply.code(403).send({ error: "Forbidden: supervisor role required" });
      }
      try {
        const service = new OrderService(app.log);
        const { id } = req.params as { id: string };
        const { noSignatureReason } = req.body as { noSignatureReason: string };
        const result = await service.markNoSignatureRequired(
          id,
          noSignatureReason,
          req.user.id,
          req.user.locationId,
        );
        return reply.send(result);
      } catch (err) {
        handleOrderError(err, reply);
      }
    },
  );

  // POST /api/v1/orders/:id/resend
  app.post(
    "/orders/:id/resend",
    {
      schema: {
        tags: ["Orders"],
        params: idParams,
        body: ResendOrderBodySchema,
        response: {
          200: OrderResponseSchema,
          401: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      try {
        const service = new OrderService(app.log);
        const { id } = req.params as { id: string };
        const result = await service.resendOrder(
          id,
          req.body as never,
          req.user.id,
          req.user.locationId,
        );
        return reply.send(result);
      } catch (err) {
        handleOrderError(err, reply);
      }
    },
  );

  // POST /api/v1/orders/:id/returned — mark completed-returned
  app.post(
    "/orders/:id/returned",
    {
      schema: {
        tags: ["Orders"],
        params: idParams,
        response: {
          200: OrderResponseSchema,
          401: errorResponse,
          404: errorResponse,
          422: errorResponse,
        },
      },
    },
    async (req, reply) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      try {
        const service = new OrderService(app.log);
        const { id } = req.params as { id: string };
        const result = await service.markReturnedToChart(id, req.user.id, req.user.locationId);
        return reply.send(result);
      } catch (err) {
        handleOrderError(err, reply);
      }
    },
  );
}

// ── Patient order routes (registered at /api/v1/patients) ────────────────────

export async function orderPatientRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (req) => {
    if (!req.user) return;
    const { id: userId, locationId } = req.user;
    await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    await db.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);
  });

  // GET /api/v1/patients/:patientId/orders
  app.get(
    "/:patientId/orders",
    {
      schema: {
        tags: ["Orders"],
        params: patientIdParams,
        response: {
          200: OrderListResponseSchema,
          401: errorResponse,
        },
      },
    },
    async (req, reply) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      const { patientId } = req.params as { patientId: string };
      const service = new OrderService(app.log);
      const result = await service.getPatientOrders(
        patientId,
        req.user.id,
        req.user.locationId,
      );
      return reply.send(result);
    },
  );
}
