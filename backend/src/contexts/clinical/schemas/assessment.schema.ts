// contexts/clinical/schemas/assessment.schema.ts
// Assessment CRUD + trajectory endpoint schemas (discriminated by assessmentType)

import { type Static, Type } from "@sinclair/typebox";

export const AssessmentTypeSchema = Type.Enum(
  {
    FLACC: "FLACC",
    PAINAD: "PAINAD",
    NRS: "NRS",
    WONG_BAKER: "WONG_BAKER",
    ESAS: "ESAS",
  },
  { description: "Pain/symptom assessment scale type" },
);

export type AssessmentType = Static<typeof AssessmentTypeSchema>;

// ── POST /patients/:id/assessments — body ────────────────────────────────────

/** Scale-specific data is validated per-type in the service layer */
export const CreateAssessmentBodySchema = Type.Object(
  {
    assessmentType: AssessmentTypeSchema,
    assessedAt: Type.String({ format: "date-time" }),
    data: Type.Record(Type.String(), Type.Unknown()),
  },
  { additionalProperties: false },
);

export type CreateAssessmentBody = Static<typeof CreateAssessmentBodySchema>;

// ── Response ─────────────────────────────────────────────────────────────────

export const AssessmentResponseSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    patientId: Type.String({ format: "uuid" }),
    assessmentType: AssessmentTypeSchema,
    assessedAt: Type.String({ format: "date-time" }),
    assessedBy: Type.String({ format: "uuid" }),
    totalScore: Type.Union([Type.Number(), Type.Null()]),
    data: Type.Record(Type.String(), Type.Unknown()),
    createdAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

export type AssessmentResponse = Static<typeof AssessmentResponseSchema>;

export const AssessmentListResponseSchema = Type.Object(
  {
    assessments: Type.Array(AssessmentResponseSchema),
    total: Type.Integer(),
  },
  { additionalProperties: false },
);

export type AssessmentListResponse = Static<typeof AssessmentListResponseSchema>;

// ── Trajectory (GET /patients/:id/trajectory) ─────────────────────────────────

export const TrajectoryDataPointSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    assessedAt: Type.String({ format: "date-time" }),
    assessmentType: AssessmentTypeSchema,
    // Pain score — totalScore for FLACC/PAINAD/NRS/WONG_BAKER; ESAS.pain for ESAS
    pain: Type.Union([Type.Number(), Type.Null()]),
    // Dyspnea — ESAS only
    dyspnea: Type.Union([Type.Number(), Type.Null()]),
    // Nausea — ESAS only
    nausea: Type.Union([Type.Number(), Type.Null()]),
    // Functional status — reserved for future functional assessment scales
    functionalStatus: Type.Union([Type.Number(), Type.Null()]),
  },
  { additionalProperties: false },
);

export type TrajectoryDataPoint = Static<typeof TrajectoryDataPointSchema>;

export const TrajectoryResponseSchema = Type.Object(
  {
    patientId: Type.String({ format: "uuid" }),
    dataPoints: Type.Array(TrajectoryDataPointSchema),
  },
  { additionalProperties: false },
);

export type TrajectoryResponse = Static<typeof TrajectoryResponseSchema>;
