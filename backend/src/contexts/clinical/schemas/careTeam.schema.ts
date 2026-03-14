/**
 * Care team schemas — TypeBox definitions for the care team members module.
 *
 * Covers:
 *   - Care team member assignment (clinicians + external providers)
 *   - Active team listing (unassigned_at IS NULL)
 *   - Soft-delete via unassign operation
 *
 * Schema-first: TypeBox → Drizzle table → migration → typebox-compiler.ts
 * No TypeCompiler.Compile() calls here — all compilation in typebox-compiler.ts.
 */

import { type Static, Type } from "@sinclair/typebox";

// ── Enum ───────────────────────────────────────────────────────────────────────

export const CareTeamDisciplineSchema = Type.Union([
  Type.Literal("PHYSICIAN"),
  Type.Literal("RN"),
  Type.Literal("SW"),
  Type.Literal("CHAPLAIN"),
  Type.Literal("AIDE"),
  Type.Literal("VOLUNTEER"),
  Type.Literal("BEREAVEMENT"),
  Type.Literal("THERAPIST"),
]);
export type CareTeamDiscipline = Static<typeof CareTeamDisciplineSchema>;

// ── Core response schema ───────────────────────────────────────────────────────

export const CareTeamMemberResponseSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  patientId: Type.String({ format: "uuid" }),
  locationId: Type.String({ format: "uuid" }),
  userId: Type.Optional(Type.String({ format: "uuid" })),
  name: Type.String({ minLength: 1, maxLength: 300 }),
  discipline: CareTeamDisciplineSchema,
  role: Type.String({ minLength: 1, maxLength: 200 }),
  phone: Type.Optional(Type.String({ maxLength: 30 })),
  email: Type.Optional(Type.String({ format: "email", maxLength: 200 })),
  isPrimaryContact: Type.Boolean(),
  isOnCall: Type.Boolean(),
  assignedByUserId: Type.Optional(Type.String({ format: "uuid" })),
  assignedAt: Type.String({ format: "date-time" }),
  unassignedAt: Type.Optional(Type.String({ format: "date-time" })),
  createdAt: Type.String({ format: "date-time" }),
});
export type CareTeamMemberResponse = Static<typeof CareTeamMemberResponseSchema>;

// ── List response ──────────────────────────────────────────────────────────────

export const CareTeamListResponseSchema = Type.Object({
  members: Type.Array(CareTeamMemberResponseSchema),
  total: Type.Integer(),
});
export type CareTeamListResponse = Static<typeof CareTeamListResponseSchema>;

// ── Request body schemas ───────────────────────────────────────────────────────

export const AssignCareTeamMemberBodySchema = Type.Object({
  userId: Type.Optional(Type.String({ format: "uuid" })),
  name: Type.String({ minLength: 1, maxLength: 300 }),
  discipline: CareTeamDisciplineSchema,
  role: Type.String({ minLength: 1, maxLength: 200 }),
  phone: Type.Optional(Type.String({ maxLength: 30 })),
  email: Type.Optional(Type.String({ format: "email", maxLength: 200 })),
  isPrimaryContact: Type.Optional(Type.Boolean()),
  isOnCall: Type.Optional(Type.Boolean()),
});
export type AssignCareTeamMemberBody = Static<typeof AssignCareTeamMemberBodySchema>;
