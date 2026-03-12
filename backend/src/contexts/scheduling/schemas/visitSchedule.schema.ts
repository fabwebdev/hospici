/**
 * VisitSchedule schemas — TypeBox definitions for T2-10.
 * Validators compiled in typebox-compiler.ts (never here).
 */

import { type Static, Type } from "@sinclair/typebox";

// ── Enums ──────────────────────────────────────────────────────────────────────

export const VisitStatusSchema = Type.Union(
  [
    Type.Literal("scheduled"),
    Type.Literal("completed"),
    Type.Literal("missed"),
    Type.Literal("cancelled"),
  ],
  { $id: "VisitStatus" },
);

export const VisitScheduleDisciplineSchema = Type.Union(
  [
    Type.Literal("RN"),
    Type.Literal("SW"),
    Type.Literal("CHAPLAIN"),
    Type.Literal("THERAPY"),
    Type.Literal("AIDE"),
  ],
  { $id: "VisitScheduleDiscipline" },
);

// ── FrequencyPlan ──────────────────────────────────────────────────────────────

export const FrequencyPlanSchema = Type.Object(
  {
    visitsPerWeek: Type.Integer({ minimum: 1, maximum: 14 }),
    notes: Type.Optional(Type.String({ maxLength: 500 })),
  },
  { $id: "FrequencyPlan" },
);

// ── Scheduled Visit response ───────────────────────────────────────────────────

export const ScheduledVisitResponseSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    patientId: Type.String({ format: "uuid" }),
    locationId: Type.String({ format: "uuid" }),
    clinicianId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    visitType: Type.String(),
    discipline: VisitScheduleDisciplineSchema,
    scheduledDate: Type.String({ format: "date" }),
    frequencyPlan: FrequencyPlanSchema,
    status: VisitStatusSchema,
    completedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    cancelledAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    missedReason: Type.Union([Type.String(), Type.Null()]),
    notes: Type.Union([Type.String(), Type.Null()]),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { $id: "ScheduledVisitResponse" },
);

export const ScheduledVisitListResponseSchema = Type.Object(
  {
    data: Type.Array(ScheduledVisitResponseSchema),
    total: Type.Integer({ minimum: 0 }),
  },
  { $id: "ScheduledVisitListResponse" },
);

// ── Create ─────────────────────────────────────────────────────────────────────

export const CreateScheduledVisitBodySchema = Type.Object(
  {
    visitType: Type.String({ minLength: 1 }),
    discipline: VisitScheduleDisciplineSchema,
    scheduledDate: Type.String({ format: "date" }),
    frequencyPlan: FrequencyPlanSchema,
    clinicianId: Type.Optional(Type.String({ format: "uuid" })),
    notes: Type.Optional(Type.String({ maxLength: 2000 })),
  },
  { $id: "CreateScheduledVisitBody" },
);

// ── Patch status ───────────────────────────────────────────────────────────────

export const PatchScheduledVisitStatusBodySchema = Type.Object(
  {
    status: VisitStatusSchema,
    missedReason: Type.Optional(Type.String({ maxLength: 1000 })),
    notes: Type.Optional(Type.String({ maxLength: 2000 })),
  },
  { $id: "PatchScheduledVisitStatusBody" },
);

// ── Static types ───────────────────────────────────────────────────────────────

export type ScheduledVisitResponseType = Static<typeof ScheduledVisitResponseSchema>;
export type CreateScheduledVisitBodyType = Static<typeof CreateScheduledVisitBodySchema>;
export type PatchScheduledVisitStatusBodyType = Static<typeof PatchScheduledVisitStatusBodySchema>;
