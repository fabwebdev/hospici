/**
 * Cap Intelligence Routes (T3-3)
 * Base prefix: /api/v1/cap
 */

import { CapCalculationService } from "@/contexts/billing/services/capCalculation.service.js";
import { capRecalculationQueue } from "@/jobs/queue.js";
import { getCapYear } from "@/utils/business-days.js";
import type { FastifyInstance } from "fastify";

export default async function capRoutes(fastify: FastifyInstance): Promise<void> {
  // ── POST /cap/recalculate ─────────────────────────────────────────────────

  fastify.post(
    "/recalculate",
    {
      schema: {
        tags: ["Cap"],
        summary: "Trigger manual cap recalculation (admin/billing_specialist only)",
      },
    },
    async (request, reply) => {
      const user = request as unknown as {
        user?: { id?: string; role?: string; locationId?: string };
      };
      const role = user.user?.role ?? "";
      if (!["admin", "billing_specialist", "super_admin"].includes(role)) {
        return reply
          .code(403)
          .send({ error: { code: "FORBIDDEN", message: "Admin or billing_specialist required" } });
      }

      const locationId = user.user?.locationId ?? "";
      const capYear = getCapYear(new Date()).year;

      const job = await capRecalculationQueue.add("manual-recalculate", {
        locationId,
        capYear,
        triggeredBy: "manual" as const,
        triggeredByUserId: user.user?.id ?? null,
      });

      return reply.code(202).send({
        jobId: job.id ?? "unknown",
        message:
          "Cap recalculation job enqueued. Results available via GET /cap/summary after completion.",
      });
    },
  );

  // ── GET /cap/summary ──────────────────────────────────────────────────────

  fastify.get(
    "/summary",
    {
      schema: {
        tags: ["Cap"],
        summary: "Current cap year summary for requesting location",
      },
    },
    async (request, reply) => {
      const user = request as unknown as { user?: { locationId?: string } };
      const locationId = user.user?.locationId ?? "";
      const query = request.query as { capYear?: number };
      const capYear = query.capYear ?? getCapYear(new Date()).year;

      const svc = new CapCalculationService(fastify.valkey);
      const summary = await svc.getCapSummary(locationId, capYear);
      return reply.send(summary);
    },
  );

  // ── GET /cap/patients ─────────────────────────────────────────────────────

  fastify.get(
    "/patients",
    {
      schema: {
        tags: ["Cap"],
        summary: "Filterable patient contributor list",
      },
    },
    async (request, reply) => {
      const user = request as unknown as { user?: { locationId?: string } };
      const locationId = user.user?.locationId ?? "";
      const query = request.query as {
        snapshotId?: string;
        sortBy?: "contribution" | "los" | "name";
        limit?: number;
        losMin?: number;
        losMax?: number;
        highUtilizationOnly?: boolean;
        capYear?: number;
      };
      const capYear = query.capYear ?? getCapYear(new Date()).year;

      const svc = new CapCalculationService(fastify.valkey);
      return reply.send(await svc.getPatientContributors(locationId, capYear, query));
    },
  );

  // ── GET /cap/trends ───────────────────────────────────────────────────────

  fastify.get(
    "/trends",
    {
      schema: {
        tags: ["Cap"],
        summary: "Monthly utilization trends + branch comparison",
      },
    },
    async (request, reply) => {
      const user = request as unknown as { user?: { locationId?: string } };
      const locationId = user.user?.locationId ?? "";
      const query = request.query as { capYear?: number };
      const capYear = query.capYear ?? getCapYear(new Date()).year;

      const svc = new CapCalculationService(fastify.valkey);
      return reply.send(await svc.getCapTrends(locationId, capYear));
    },
  );

  // ── GET /cap/snapshots/:id ────────────────────────────────────────────────

  fastify.get(
    "/snapshots/:id",
    {
      schema: {
        tags: ["Cap"],
        summary: "Single snapshot detail with full patient contribution list",
        params: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" } },
          required: ["id"],
        },
      },
    },
    async (request, reply) => {
      const user = request as unknown as { user?: { locationId?: string } };
      const locationId = user.user?.locationId ?? "";
      const { id } = request.params as { id: string };

      const svc = new CapCalculationService(fastify.valkey);
      const snapshot = await svc.getSnapshotById(id, locationId);
      if (!snapshot) {
        return reply
          .code(404)
          .send({ error: { code: "NOT_FOUND", message: "Snapshot not found" } });
      }
      return reply.send(snapshot);
    },
  );
}
