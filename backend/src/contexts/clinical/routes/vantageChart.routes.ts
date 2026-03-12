/**
 * VantageChart Routes — Encounter CRUD + Layer 1/2 narrative generation.
 *
 * Base prefix: /api/v1/patients (registered in server.ts)
 *
 * Encounter CRUD:
 *   POST   /patients/:patientId/encounters
 *   GET    /patients/:patientId/encounters
 *   GET    /patients/:patientId/encounters/:encounterId
 *   PATCH  /patients/:patientId/encounters/:encounterId
 *
 * VantageChart:
 *   GET    /patients/:patientId/encounters/:encounterId/vantage-chart/context
 *   POST   /patients/:patientId/encounters/:encounterId/vantage-chart/generate
 *   POST   /patients/:patientId/encounters/:encounterId/vantage-chart/enhance
 *
 * Security:
 *   - Layer 2 rate-limited to 10 req/user/hour via Valkey
 *   - Layer 2 ONLY active when FEATURE_AI_CLINICAL_NOTES=true
 *   - PHI NEVER sent to Layer 2 — only assembled draft text
 */

import { Validators } from "@/config/typebox-compiler.js";
import { env } from "@/config/env.js";
import { checkLLMRateLimit, enhanceWithLLM } from "../services/vantageChart.llm.js";
import { VantageChartService } from "../services/vantageChart.service.js";
import { Type } from "@sinclair/typebox";
import type { FastifyInstance } from "fastify";
import {
  CreateEncounterBodySchema,
  EnhanceNarrativeBodySchema,
  EncounterListResponseSchema,
  EncounterResponseSchema,
  GenerateNarrativeBodySchema,
  GenerateNarrativeResponseSchema,
  EnhanceNarrativeResponseSchema,
  PatchEncounterBodySchema,
} from "../schemas/encounter.schema.js";
import { logAudit } from "@/contexts/identity/services/audit.service.js";

const PatientEncounterParamsSchema = {
  type: "object",
  properties: {
    patientId: { type: "string", format: "uuid" },
    encounterId: { type: "string", format: "uuid" },
  },
  required: ["patientId", "encounterId"],
} as const;

const PatientParamsSchema = {
  type: "object",
  properties: {
    patientId: { type: "string", format: "uuid" },
  },
  required: ["patientId"],
} as const;

const ErrorSchema = Type.Object({
  success: Type.Boolean(),
  error: Type.Object({ code: Type.String(), message: Type.String() }),
});

export default async function vantageChartRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  const svc = new VantageChartService(fastify.valkey);

  // ── POST /patients/:patientId/encounters ──────────────────────────────────
  fastify.post(
    "/:patientId/encounters",
    {
      schema: {
        tags: ["Encounters"],
        summary: "Create a new encounter (visit record)",
        params: PatientParamsSchema,
        body: CreateEncounterBodySchema,
        response: { 201: EncounterResponseSchema, 400: ErrorSchema },
      },
      preValidation: [
        async (req, reply) => {
          if (!Validators.CreateEncounterBody.Check(req.body)) {
            const errors = [...Validators.CreateEncounterBody.Errors(req.body)].map(
              (e) => ({ path: e.path, message: e.message }),
            );
            return reply.code(400).send({
              success: false,
              error: { code: "VALIDATION_ERROR", message: JSON.stringify(errors) },
            });
          }
        },
      ],
    },
    async (req, reply) => {
      const { patientId } = req.params as { patientId: string };
      const result = await svc.createEncounter(patientId, req.body as never, req.user!);
      return reply.code(201).send(result);
    },
  );

  // ── GET /patients/:patientId/encounters ───────────────────────────────────
  fastify.get(
    "/:patientId/encounters",
    {
      schema: {
        tags: ["Encounters"],
        summary: "List encounters for a patient",
        params: PatientParamsSchema,
        response: { 200: EncounterListResponseSchema },
      },
    },
    async (req, reply) => {
      const { patientId } = req.params as { patientId: string };
      const result = await svc.listEncounters(patientId, req.user!);
      return reply.send(result);
    },
  );

  // ── GET /patients/:patientId/encounters/:encounterId ──────────────────────
  fastify.get(
    "/:patientId/encounters/:encounterId",
    {
      schema: {
        tags: ["Encounters"],
        summary: "Get a single encounter",
        params: PatientEncounterParamsSchema,
        response: { 200: EncounterResponseSchema, 404: ErrorSchema },
      },
    },
    async (req, reply) => {
      const { patientId, encounterId } = req.params as {
        patientId: string;
        encounterId: string;
      };
      const result = await svc.getEncounter(patientId, encounterId, req.user!);
      if (!result) {
        return reply.code(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: "Encounter not found" },
        });
      }
      return reply.send(result);
    },
  );

  // ── PATCH /patients/:patientId/encounters/:encounterId ────────────────────
  fastify.patch(
    "/:patientId/encounters/:encounterId",
    {
      schema: {
        tags: ["Encounters"],
        summary: "Update encounter (save draft, accept note, change status)",
        params: PatientEncounterParamsSchema,
        body: PatchEncounterBodySchema,
        response: { 200: EncounterResponseSchema, 404: ErrorSchema, 400: ErrorSchema },
      },
      preValidation: [
        async (req, reply) => {
          if (!Validators.PatchEncounterBody.Check(req.body)) {
            const errors = [...Validators.PatchEncounterBody.Errors(req.body)].map(
              (e) => ({ path: e.path, message: e.message }),
            );
            return reply.code(400).send({
              success: false,
              error: { code: "VALIDATION_ERROR", message: JSON.stringify(errors) },
            });
          }
        },
      ],
    },
    async (req, reply) => {
      const { patientId, encounterId } = req.params as {
        patientId: string;
        encounterId: string;
      };
      const result = await svc.patchEncounter(
        patientId,
        encounterId,
        req.body as never,
        req.user!,
      );
      if (!result) {
        return reply.code(404).send({
          success: false,
          error: { code: "NOT_FOUND", message: "Encounter not found" },
        });
      }
      return reply.send(result);
    },
  );

  // ── GET /patients/:patientId/encounters/:encounterId/vantage-chart/context
  fastify.get(
    "/:patientId/encounters/:encounterId/vantage-chart/context",
    {
      schema: {
        tags: ["VantageChart"],
        summary: "Get patient context for VantageChart pre-population",
        params: PatientEncounterParamsSchema,
      },
    },
    async (req, reply) => {
      const { patientId } = req.params as { patientId: string };
      const context = await svc.getPatientContext(patientId);
      return reply.send(context);
    },
  );

  // ── POST /patients/:patientId/encounters/:encounterId/vantage-chart/generate
  fastify.post(
    "/:patientId/encounters/:encounterId/vantage-chart/generate",
    {
      schema: {
        tags: ["VantageChart"],
        summary: "Layer 1 — Generate deterministic narrative from structured input",
        params: PatientEncounterParamsSchema,
        body: GenerateNarrativeBodySchema,
        response: { 200: GenerateNarrativeResponseSchema, 400: ErrorSchema },
      },
      preValidation: [
        async (req, reply) => {
          if (!Validators.GenerateNarrativeBody.Check(req.body)) {
            const errors = [...Validators.GenerateNarrativeBody.Errors(req.body)].map(
              (e) => ({ path: e.path, message: e.message }),
            );
            return reply.code(400).send({
              success: false,
              error: { code: "VALIDATION_ERROR", message: JSON.stringify(errors) },
            });
          }
        },
      ],
    },
    async (req, reply) => {
      const { patientId, encounterId } = req.params as {
        patientId: string;
        encounterId: string;
      };
      const body = req.body as { input: Parameters<typeof svc.generateNarrative>[2] };
      const result = await svc.generateNarrative(
        patientId,
        encounterId,
        body.input,
        req.user!,
      );
      return reply.send(result);
    },
  );

  // ── POST /patients/:patientId/encounters/:encounterId/vantage-chart/enhance
  fastify.post(
    "/:patientId/encounters/:encounterId/vantage-chart/enhance",
    {
      schema: {
        tags: ["VantageChart"],
        summary: "Layer 2 — LLM prose enhancement (rate-limited, no PHI)",
        params: PatientEncounterParamsSchema,
        body: EnhanceNarrativeBodySchema,
        response: {
          200: EnhanceNarrativeResponseSchema,
          400: ErrorSchema,
          403: ErrorSchema,
          429: ErrorSchema,
          503: ErrorSchema,
        },
      },
      preValidation: [
        async (req, reply) => {
          if (!Validators.EnhanceNarrativeBody.Check(req.body)) {
            return reply.code(400).send({
              success: false,
              error: { code: "VALIDATION_ERROR", message: "Invalid request body" },
            });
          }
        },
      ],
    },
    async (req, reply) => {
      if (!env.features.aiClinicalNotes) {
        return reply.code(503).send({
          success: false,
          error: {
            code: "FEATURE_DISABLED",
            message: "AI clinical notes feature is not enabled",
          },
        });
      }

      const { patientId, encounterId } = req.params as {
        patientId: string;
        encounterId: string;
      };
      const userId = req.user!.id;

      // Rate limit check
      const { allowed, remaining } = await checkLLMRateLimit(fastify.valkey, userId);
      if (!allowed) {
        reply.header("Retry-After", "3600");
        return reply.code(429).send({
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: `Layer 2 rate limit exceeded. Max 10 requests/hour. ${remaining} remaining.`,
          },
        });
      }

      const body = req.body as { draft: string };
      const llmResult = await enhanceWithLLM(body.draft);

      // Audit — never log draft text or patient identifiers
      await logAudit("update", userId, patientId, {
        userRole: req.user!.role,
        locationId: req.user!.locationId,
        resourceType: "vantage_chart",
        resourceId: encounterId,
        details: { method: "LLM", tokensUsed: llmResult.tokensUsed },
      });

      return reply.send({
        enhanced: llmResult.enhanced,
        original: llmResult.original,
        method: "LLM" as const,
        tokensUsed: llmResult.tokensUsed,
      });
    },
  );
}
