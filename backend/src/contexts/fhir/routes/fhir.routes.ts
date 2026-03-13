/**
 * FHIR R4 Routes — Patient + Observation endpoints
 *
 * Base prefix: /fhir/r4 (registered in server.ts)
 *
 * Endpoints:
 *   GET /fhir/r4/Patient          — Search patients (FHIR search)
 *   GET /fhir/r4/Patient/:id      — Read patient by ID
 *   GET /fhir/r4/Observation      — Search observations (pain assessments)
 *   GET /fhir/r4/Observation/:id  — Read observation by ID
 *
 * Security:
 * - SMART on FHIR 2.0 scope enforcement
 * - US Core profile validation
 * - RLS context applied for all DB operations
 *
 * Hook order:
 *   preValidation → TypeBox validation
 *   preHandler    → RLS context (via registerRLSMiddleware)
 *   preHandler    → SMART scope check
 *   handler       → FHIR service
 */

import { Type } from "@sinclair/typebox";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  ObservationSearchQuerySchema,
  OperationOutcomeSchema,
  PatientSearchQuerySchema,
  type SmartScope,
  SmartScopeSchema,
} from "../schemas/fhir.schema.js";
import { FhirService } from "../services/fhir.service.js";

// Error response schema for FHIR
const ErrorResponseSchema = Type.Object({
  resourceType: Type.Literal("OperationOutcome"),
  issue: Type.Array(
    Type.Object({
      severity: Type.String(),
      code: Type.String(),
      diagnostics: Type.String(),
    }),
  ),
});

/**
 * Parse SMART on FHIR scopes from Authorization header.
 * Format: "patient/Patient.read patient/Observation.read launch/patient"
 */
function parseSmartScopes(authHeader: string | undefined): SmartScope[] {
  if (!authHeader?.startsWith("Bearer ")) {
    return [];
  }

  const token = authHeader.slice(7);
  try {
    // Try to parse as JWT to extract scope claim
    const base64Url = token.split(".")[1];
    if (!base64Url) return [];

    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(Buffer.from(base64, "base64").toString()) as {
      scope?: string;
    };

    if (!payload.scope) return [];

    return payload.scope
      .split(" ")
      .map((scopeStr) => {
        // Parse scope format: [patient|user|system]/[resource].[read|write|*]
        const match = scopeStr.match(/^(patient|user|system)\/([A-Za-z]+)\.(read|write|\*)$/);
        if (!match) return null;

        return {
          scopeType: match[1] as "patient" | "user" | "system",
          resource: match[2],
          action: match[3] as "read" | "write" | "*",
        };
      })
      .filter((s): s is SmartScope => s !== null);
  } catch {
    // If parsing fails, treat as opaque token and check scopes from request context
    return [];
  }
}

/**
 * Check if the user has the required SMART scope for the resource and action.
 */
function hasSmartScope(scopes: SmartScope[], resource: string, action: "read" | "write"): boolean {
  return scopes.some(
    (scope) =>
      (scope.resource === resource || scope.resource === "*") &&
      (scope.action === action || scope.action === "*"),
  );
}

/**
 * Prehandler that enforces SMART on FHIR 2.0 scopes.
 */
function requireSmartScope(resource: "Patient" | "Observation", action: "read" | "write") {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user) {
      return reply.code(401).send({
        resourceType: "OperationOutcome",
        issue: [
          {
            severity: "error",
            code: "login",
            diagnostics: "Unauthorized - valid authentication required",
          },
        ],
      });
    }

    // Parse scopes from Authorization header
    const scopes = parseSmartScopes(request.headers.authorization);

    // If no scopes parsed from token, fall back to checking user role permissions
    // In production, scopes should always be present in the token
    if (scopes.length === 0) {
      // Allow read access for clinical and admin roles as fallback
      const allowedRoles = [
        "registered_nurse",
        "physician_attending",
        "physician_np",
        "admin",
        "super_admin",
        "clinical_supervisor_rn",
        "medical_director",
        "billing_specialist",
        "quality_assurance",
        "compliance_officer",
      ];
      if (action === "read" && allowedRoles.includes(request.user.role)) {
        return;
      }

      return reply.code(403).send({
        resourceType: "OperationOutcome",
        issue: [
          {
            severity: "error",
            code: "forbidden",
            diagnostics: `Insufficient scope - ${resource}.${action} required`,
          },
        ],
      });
    }

    if (!hasSmartScope(scopes, resource, action)) {
      return reply.code(403).send({
        resourceType: "OperationOutcome",
        issue: [
          {
            severity: "error",
            code: "forbidden",
            diagnostics: `Insufficient scope - ${resource}.${action} required`,
          },
        ],
      });
    }
  };
}

export default async function fhirRoutes(fastify: FastifyInstance): Promise<void> {
  // ── GET /fhir/r4/Patient ────────────────────────────────────────────────────
  // FHIR Patient search operation
  fastify.get(
    "/Patient",
    {
      schema: {
        tags: ["FHIR R4"],
        summary: "Search patients (FHIR R4 Patient resource)",
        description:
          "Search patients using FHIR search parameters. Returns Bundle of Patient resources.",
        querystring: PatientSearchQuerySchema,
        response: {
          200: {
            description: "FHIR Bundle containing Patient resources",
            type: "object",
          },
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
      preHandler: [requireSmartScope("Patient", "read")],
    },
    async (request, reply) => {
      const query = request.query as {
        _id?: string;
        identifier?: string;
        given?: string;
        family?: string;
        name?: string;
        gender?: "male" | "female" | "other" | "unknown";
        birthdate?: string;
        _count?: number;
        _page?: number;
      };

      const bundle = await FhirService.searchPatients(request.user!, query);
      reply.code(200).send(bundle);
    },
  );

  // ── GET /fhir/r4/Patient/:id ───────────────────────────────────────────────
  // FHIR Patient read operation
  fastify.get(
    "/Patient/:id",
    {
      schema: {
        tags: ["FHIR R4"],
        summary: "Read patient by ID (FHIR R4)",
        description: "Returns a single Patient resource in FHIR R4 format (US Core profile).",
        params: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" } },
          required: ["id"],
        },
        response: {
          200: {
            description: "FHIR Patient resource",
            type: "object",
          },
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
      preHandler: [requireSmartScope("Patient", "read")],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const patient = await FhirService.getPatient(id, request.user!);

      if (!patient) {
        return reply.code(404).send({
          resourceType: "OperationOutcome",
          issue: [
            {
              severity: "error",
              code: "not-found",
              diagnostics: `Patient/${id} not found`,
            },
          ],
        });
      }

      reply.code(200).send(patient);
    },
  );

  // ── GET /fhir/r4/Observation ───────────────────────────────────────────────
  // FHIR Observation search operation
  fastify.get(
    "/Observation",
    {
      schema: {
        tags: ["FHIR R4"],
        summary: "Search observations (FHIR R4 Observation resource)",
        description:
          "Search pain assessments as FHIR Observations. Returns Bundle of Observation resources.",
        querystring: ObservationSearchQuerySchema,
        response: {
          200: {
            description: "FHIR Bundle containing Observation resources",
            type: "object",
          },
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
        },
      },
      preHandler: [requireSmartScope("Observation", "read")],
    },
    async (request, reply) => {
      const query = request.query as {
        _id?: string;
        patient?: string;
        subject?: string;
        code?: string;
        category?: string;
        date?: string;
        "date-gt"?: string;
        "date-lt"?: string;
        "date-ge"?: string;
        "date-le"?: string;
        _count?: number;
        _page?: number;
      };

      const bundle = await FhirService.searchObservations(request.user!, query);
      reply.code(200).send(bundle);
    },
  );

  // ── GET /fhir/r4/Observation/:id ───────────────────────────────────────────
  // FHIR Observation read operation
  fastify.get(
    "/Observation/:id",
    {
      schema: {
        tags: ["FHIR R4"],
        summary: "Read observation by ID (FHIR R4)",
        description: "Returns a single Observation resource in FHIR R4 format (US Core profile).",
        params: {
          type: "object",
          properties: { id: { type: "string", format: "uuid" } },
          required: ["id"],
        },
        response: {
          200: {
            description: "FHIR Observation resource",
            type: "object",
          },
          401: ErrorResponseSchema,
          403: ErrorResponseSchema,
          404: ErrorResponseSchema,
        },
      },
      preHandler: [requireSmartScope("Observation", "read")],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const observation = await FhirService.getObservation(id, request.user!);

      if (!observation) {
        return reply.code(404).send({
          resourceType: "OperationOutcome",
          issue: [
            {
              severity: "error",
              code: "not-found",
              diagnostics: `Observation/${id} not found`,
            },
          ],
        });
      }

      reply.code(200).send(observation);
    },
  );

  // ── FHIR Capability Statement ──────────────────────────────────────────────
  // Required by FHIR spec for server discovery
  fastify.get(
    "/metadata",
    {
      schema: {
        tags: ["FHIR R4"],
        summary: "FHIR Capability Statement",
        description: "Returns the FHIR Capability Statement for this server.",
        response: {
          200: {
            description: "FHIR CapabilityStatement",
            type: "object",
          },
        },
      },
    },
    async (_request, reply) => {
      const capabilityStatement = {
        resourceType: "CapabilityStatement",
        id: "hospici-fhir-server",
        status: "active",
        kind: "instance",
        date: new Date().toISOString(),
        software: {
          name: "Hospici FHIR Server",
          version: "1.0.0",
        },
        implementation: {
          description: "Hospici Hospice EHR FHIR R4 Endpoint",
          url: `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/fhir/r4`,
        },
        fhirVersion: "4.0.1",
        format: ["json"],
        rest: [
          {
            mode: "server",
            security: {
              cors: true,
              service: [
                {
                  coding: [
                    {
                      system: "http://terminology.hl7.org/CodeSystem/restful-security-service",
                      code: "SMART-on-FHIR",
                      display: "SMART-on-FHIR",
                    },
                  ],
                },
              ],
              extension: [
                {
                  url: "http://fhir-registry.smarthealthit.org/StructureDefinition/oauth-uris",
                  extension: [
                    {
                      url: "authorize",
                      valueUri: `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/api/v1/auth/authorize`,
                    },
                    {
                      url: "token",
                      valueUri: `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/api/v1/auth/token`,
                    },
                  ],
                },
              ],
            },
            resource: [
              {
                type: "Patient",
                profile: "http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient",
                interaction: [{ code: "read" }, { code: "search-type" }],
                searchParam: [
                  { name: "_id", type: "token" },
                  { name: "identifier", type: "token" },
                  { name: "given", type: "string" },
                  { name: "family", type: "string" },
                  { name: "name", type: "string" },
                  { name: "gender", type: "token" },
                  { name: "birthdate", type: "date" },
                ],
              },
              {
                type: "Observation",
                profile:
                  "http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-survey",
                interaction: [{ code: "read" }, { code: "search-type" }],
                searchParam: [
                  { name: "_id", type: "token" },
                  { name: "patient", type: "reference" },
                  { name: "subject", type: "reference" },
                  { name: "code", type: "token" },
                  { name: "category", type: "token" },
                  { name: "date", type: "date" },
                ],
              },
            ],
          },
        ],
      };

      reply.code(200).send(capabilityStatement);
    },
  );
}
