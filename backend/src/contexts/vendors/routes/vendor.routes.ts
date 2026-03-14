// contexts/vendors/routes/vendor.routes.ts
// T3-8: Vendor Governance + BAA Registry — Fastify route plugin

import { db } from "@/db/client.js";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import {
  CreateVendorBodySchema,
  CreateVendorReviewBodySchema,
  ExpiringBaaResponseSchema,
  UpdateVendorBodySchema,
  VendorDetailResponseSchema,
  VendorListQuerySchema,
  VendorListResponseSchema,
  VendorResponseSchema,
} from "../schemas/vendor.schema.js";
import { VendorService } from "../services/vendor.service.js";

const VENDOR_WRITE_ROLES = new Set(["compliance_officer", "super_admin"]);

const idParams = {
  type: "object",
  properties: { id: { type: "string", format: "uuid" } },
  required: ["id"],
} as const;

const errorResponse = {
  type: "object",
  properties: { error: { type: "string" } },
} as const;

export async function vendorRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (req) => {
    if (!req.user) return;
    const { id: userId, locationId } = req.user;
    await db.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    await db.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);
  });

  // GET /api/v1/vendors
  app.get(
    "/",
    {
      schema: {
        tags: ["Vendors"],
        querystring: VendorListQuerySchema,
        response: {
          200: VendorListResponseSchema,
          401: errorResponse,
        },
      },
    },
    async (req, reply) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      const result = await VendorService.listVendors(req.user.locationId, req.query as never);
      return reply.send(result);
    },
  );

  // POST /api/v1/vendors
  app.post(
    "/",
    {
      schema: {
        tags: ["Vendors"],
        body: CreateVendorBodySchema,
        response: {
          201: VendorResponseSchema,
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    async (req, reply) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      if (!VENDOR_WRITE_ROLES.has(req.user.role)) {
        return reply
          .code(403)
          .send({ error: "Forbidden: compliance_officer or super_admin required" });
      }
      const vendor = await VendorService.createVendor(req.user.locationId, req.body as never, req.user.id, req.user.role);
      return reply.code(201).send(vendor);
    },
  );

  // GET /api/v1/vendors/expiring
  app.get(
    "/expiring",
    {
      schema: {
        tags: ["Vendors"],
        querystring: {
          type: "object",
          properties: { within: { type: "number", default: 90 } },
        },
        response: {
          200: ExpiringBaaResponseSchema,
          401: errorResponse,
        },
      },
    },
    async (req, reply) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      const { within = 90 } = req.query as { within?: number };
      const result = await VendorService.getExpiring(req.user.locationId, within);
      return reply.send(result);
    },
  );

  // GET /api/v1/vendors/missing-baas
  app.get(
    "/missing-baas",
    {
      schema: {
        tags: ["Vendors"],
        response: {
          200: { type: "array", items: VendorResponseSchema },
          401: errorResponse,
        },
      },
    },
    async (req, reply) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      const result = await VendorService.getMissingBaas(req.user.locationId);
      return reply.send(result);
    },
  );

  // GET /api/v1/vendors/:id
  app.get(
    "/:id",
    {
      schema: {
        tags: ["Vendors"],
        params: idParams,
        response: {
          200: VendorDetailResponseSchema,
          401: errorResponse,
          404: errorResponse,
        },
      },
    },
    async (req, reply) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      const { id } = req.params as { id: string };
      const detail = await VendorService.getVendor(id);
      if (!detail) {
        return reply.code(404).send({ error: "Vendor not found" });
      }
      return reply.send(detail);
    },
  );

  // PATCH /api/v1/vendors/:id
  app.patch(
    "/:id",
    {
      schema: {
        tags: ["Vendors"],
        params: idParams,
        body: UpdateVendorBodySchema,
        response: {
          200: VendorResponseSchema,
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
      if (!VENDOR_WRITE_ROLES.has(req.user.role)) {
        return reply.code(403).send({ error: "Forbidden" });
      }
      const { id } = req.params as { id: string };
      const vendor = await VendorService.updateVendor(id, req.body as never, req.user.id, req.user.role, req.user.locationId);
      if (!vendor) {
        return reply.code(404).send({ error: "Vendor not found" });
      }
      return reply.send(vendor);
    },
  );

  // POST /api/v1/vendors/:id/reviews
  app.post(
    "/:id/reviews",
    {
      schema: {
        tags: ["Vendors"],
        params: idParams,
        body: CreateVendorReviewBodySchema,
        response: {
          201: { type: "object" },
          401: errorResponse,
          403: errorResponse,
        },
      },
    },
    async (req, reply) => {
      if (!req.user) {
        return reply.code(401).send({ error: "Unauthorized" });
      }
      if (!VENDOR_WRITE_ROLES.has(req.user.role)) {
        return reply.code(403).send({ error: "Forbidden" });
      }
      const { id } = req.params as { id: string };
      const review = await VendorService.addReview(
        id,
        req.user.locationId,
        req.user.id,
        req.body as never,
      );
      return reply.code(201).send(review);
    },
  );
}
