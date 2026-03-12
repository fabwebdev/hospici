/**
 * Encounter schemas — CRUD request/response TypeBox definitions.
 * Encounter = one hospice visit record, containing VantageChart narrative.
 */

import { type Static, Type } from "@sinclair/typebox";
import { VantageChartInputSchema } from "./vantagechart-input.schema.js";

// ── Shared enums ───────────────────────────────────────────────────────────────

export const EncounterStatusSchema = Type.Enum(
  { DRAFT: "DRAFT", COMPLETED: "COMPLETED", SIGNED: "SIGNED" },
  { $id: "EncounterStatus" },
);

export const VantageChartMethodSchema = Type.Enum(
  { TEMPLATE: "TEMPLATE", LLM: "LLM" },
  { $id: "VantageChartMethod" },
);

// ── Traceability record (stored in JSONB, returned from generate) ──────────────

export const TraceabilityEntrySchema = Type.Object({
  narrativeSegment: Type.String(),
  sourceFragment: Type.String(),
  inputData: Type.String(), // JSON-encoded snapshot of variable values
});

// ── Generate request / response ────────────────────────────────────────────────

export const GenerateNarrativeBodySchema = Type.Object(
  {
    input: VantageChartInputSchema,
  },
  { $id: "GenerateNarrativeBody" },
);

export const GenerateNarrativeResponseSchema = Type.Object(
  {
    draft: Type.String(),
    method: Type.Literal("TEMPLATE"),
    metadata: Type.Object({
      sectionCount: Type.Number(),
      fragmentCount: Type.Number(),
      wordCount: Type.Number(),
      completenessPercent: Type.Number(),
    }),
    traceability: Type.Array(TraceabilityEntrySchema),
    /** True when structured input >90% identical to prior accepted visit */
    similarityWarning: Type.Boolean(),
  },
  { $id: "GenerateNarrativeResponse" },
);

export type GenerateNarrativeBody = Static<typeof GenerateNarrativeBodySchema>;
export type GenerateNarrativeResponse = Static<typeof GenerateNarrativeResponseSchema>;

// ── Enhance request / response (Layer 2) ──────────────────────────────────────

export const EnhanceNarrativeBodySchema = Type.Object(
  {
    /** Layer 1 draft text — MUST NOT contain patient identifiers (PHI stripped) */
    draft: Type.String({ maxLength: 8000 }),
  },
  { $id: "EnhanceNarrativeBody" },
);

export const EnhanceNarrativeResponseSchema = Type.Object(
  {
    enhanced: Type.String(),
    original: Type.String(),
    method: Type.Literal("LLM"),
    tokensUsed: Type.Number(),
  },
  { $id: "EnhanceNarrativeResponse" },
);

export type EnhanceNarrativeBody = Static<typeof EnhanceNarrativeBodySchema>;
export type EnhanceNarrativeResponse = Static<typeof EnhanceNarrativeResponseSchema>;

// ── Encounter CRUD ─────────────────────────────────────────────────────────────

export const CreateEncounterBodySchema = Type.Object(
  {
    visitType: Type.Enum({
      routine_rn: "routine_rn",
      admission: "admission",
      recertification: "recertification",
      supervisory: "supervisory",
      prn: "prn",
      discharge: "discharge",
    }),
    visitedAt: Type.Optional(Type.String({ format: "date-time" })),
  },
  { $id: "CreateEncounterBody" },
);

export const PatchEncounterBodySchema = Type.Object(
  {
    status: Type.Optional(EncounterStatusSchema),
    data: Type.Optional(VantageChartInputSchema),
    vantageChartDraft: Type.Optional(Type.String()),
    vantageChartMethod: Type.Optional(VantageChartMethodSchema),
    vantageChartAcceptedAt: Type.Optional(Type.String({ format: "date-time" })),
    vantageChartTraceability: Type.Optional(Type.Array(TraceabilityEntrySchema)),
  },
  { $id: "PatchEncounterBody" },
);

export const EncounterResponseSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    patientId: Type.String({ format: "uuid" }),
    locationId: Type.String({ format: "uuid" }),
    clinicianId: Type.String({ format: "uuid" }),
    visitType: Type.Enum({
      routine_rn: "routine_rn",
      admission: "admission",
      recertification: "recertification",
      supervisory: "supervisory",
      prn: "prn",
      discharge: "discharge",
    }),
    status: EncounterStatusSchema,
    data: Type.Optional(Type.Unknown()),
    vantageChartDraft: Type.Optional(Type.String()),
    vantageChartMethod: Type.Optional(VantageChartMethodSchema),
    vantageChartAcceptedAt: Type.Optional(Type.String()),
    vantageChartTraceability: Type.Optional(Type.Array(TraceabilityEntrySchema)),
    visitedAt: Type.String(),
    createdAt: Type.String(),
    updatedAt: Type.String(),
  },
  { $id: "EncounterResponse" },
);

export const EncounterListResponseSchema = Type.Object(
  {
    encounters: Type.Array(EncounterResponseSchema),
    total: Type.Number(),
  },
  { $id: "EncounterListResponse" },
);

export type CreateEncounterBody = Static<typeof CreateEncounterBodySchema>;
export type PatchEncounterBody = Static<typeof PatchEncounterBodySchema>;
export type EncounterResponse = Static<typeof EncounterResponseSchema>;
export type EncounterListResponse = Static<typeof EncounterListResponseSchema>;
