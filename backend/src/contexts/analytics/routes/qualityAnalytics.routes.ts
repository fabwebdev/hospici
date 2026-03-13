/**
 * Quality analytics routes — T3-11
 * GET /api/v1/analytics/clinician-scorecards        supervisor/admin only
 * GET /api/v1/analytics/clinician-scorecards/:userId
 * GET /api/v1/analytics/deficiency-trends
 * GET /api/v1/analytics/quality-outliers
 */

import { Validators } from "@/config/typebox-compiler.js";
import { QualityAnalyticsService } from "../services/qualityAnalytics.service.js";
import type { FastifyInstance } from "fastify";

export default async function qualityAnalyticsRoutes(fastify: FastifyInstance) {
  // ── GET /analytics/clinician-scorecards ───────────────────────────────────
  fastify.get(
    "/clinician-scorecards",
    {
      preValidation: async (request, reply) => {
        if (!Validators.ScorecardQuery.Check(request.query)) {
          return reply.code(400).send({ error: "Invalid query params" });
        }
      },
    },
    async (request, reply) => {
      if (!request.user) return reply.code(401).send({ error: "Unauthorized" });
      // supervisor or admin role required
      const role = request.user.role;
      if (role !== "supervisor" && role !== "admin" && role !== "super_admin") {
        return reply.code(403).send({ error: "Insufficient role — supervisor or admin required" });
      }

      const query =
        request.query as import("../../qapi/schemas/qapi.schema.js").ScorecardQueryType;
      const result = await QualityAnalyticsService.getClinicianScorecards(query);
      return reply.send(result);
    },
  );

  // ── GET /analytics/clinician-scorecards/:userId ───────────────────────────
  fastify.get(
    "/clinician-scorecards/:userId",
    {
      preValidation: async (request, reply) => {
        if (!Validators.ScorecardQuery.Check(request.query)) {
          return reply.code(400).send({ error: "Invalid query params" });
        }
      },
    },
    async (request, reply) => {
      if (!request.user) return reply.code(401).send({ error: "Unauthorized" });
      const role = request.user.role;
      if (role !== "supervisor" && role !== "admin" && role !== "super_admin") {
        return reply.code(403).send({ error: "Insufficient role" });
      }

      const { userId } = request.params as { userId: string };
      const query =
        request.query as import("../../qapi/schemas/qapi.schema.js").ScorecardQueryType;
      const scorecard = await QualityAnalyticsService.getClinicianScorecard(userId, query);
      if (!scorecard) return reply.code(404).send({ error: "No scorecard found for clinician" });
      return reply.send(scorecard);
    },
  );

  // ── GET /analytics/deficiency-trends ─────────────────────────────────────
  fastify.get(
    "/deficiency-trends",
    {
      preValidation: async (request, reply) => {
        if (!Validators.TrendQuery.Check(request.query)) {
          return reply.code(400).send({ error: "Invalid query params" });
        }
      },
    },
    async (request, reply) => {
      if (!request.user) return reply.code(401).send({ error: "Unauthorized" });

      const query =
        request.query as import("../../qapi/schemas/qapi.schema.js").TrendQueryType;
      const report = await QualityAnalyticsService.getDeficiencyTrends(query);
      return reply.send(report);
    },
  );

  // ── GET /analytics/quality-outliers ──────────────────────────────────────
  fastify.get(
    "/quality-outliers",
    {
      preValidation: async (request, reply) => {
        if (!Validators.ScorecardQuery.Check(request.query)) {
          return reply.code(400).send({ error: "Invalid query params" });
        }
      },
    },
    async (request, reply) => {
      if (!request.user) return reply.code(401).send({ error: "Unauthorized" });

      const query =
        request.query as import("../../qapi/schemas/qapi.schema.js").ScorecardQueryType;
      const result = await QualityAnalyticsService.getQualityOutliers(query);
      return reply.send(result);
    },
  );
}
