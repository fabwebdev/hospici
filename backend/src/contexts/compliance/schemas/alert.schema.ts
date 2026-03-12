// alert.schema.ts
// TypeBox schemas for compliance alerts — T2-8.
// Validators compiled in typebox-compiler.ts (never here).

import { Type, type Static } from "@sinclair/typebox";

// ── Enums ─────────────────────────────────────────────────────────────────────

export const AlertTypeSchema = Type.Union([
	Type.Literal("NOE_DEADLINE"),
	Type.Literal("NOTR_DEADLINE"),
	Type.Literal("IDG_OVERDUE"),
	Type.Literal("AIDE_SUPERVISION_OVERDUE"),
	Type.Literal("AIDE_SUPERVISION_UPCOMING"),
	Type.Literal("HOPE_WINDOW_CLOSING"),
	Type.Literal("F2F_REQUIRED"),
	Type.Literal("CAP_THRESHOLD"),
	Type.Literal("BENEFIT_PERIOD_EXPIRING"),
	Type.Literal("RECERTIFICATION_DUE"),
	// T2-9 note review alert types
	Type.Literal("NOTE_REVIEW_REQUIRED"),
	Type.Literal("NOTE_INCOMPLETE"),
	Type.Literal("NOTE_OVERDUE_REVIEW"),
]);

export const AlertSeveritySchema = Type.Union([
	Type.Literal("critical"),
	Type.Literal("warning"),
	Type.Literal("info"),
]);

export const AlertStatusSchema = Type.Union([
	Type.Literal("new"),
	Type.Literal("acknowledged"),
	Type.Literal("assigned"),
	Type.Literal("resolved"),
]);

// ── Alert object ──────────────────────────────────────────────────────────────

export const AlertSchema = Type.Object({
	id: Type.String({ format: "uuid" }),
	type: AlertTypeSchema,
	severity: AlertSeveritySchema,
	patientId: Type.String({ format: "uuid" }),
	patientName: Type.String(),
	locationId: Type.String({ format: "uuid" }),
	dueDate: Type.Union([Type.String({ format: "date" }), Type.Null()]),
	daysRemaining: Type.Integer(),
	description: Type.String(),
	rootCause: Type.String(),
	nextAction: Type.String(),
	status: AlertStatusSchema,
	assignedTo: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
	snoozedUntil: Type.Union([Type.String({ format: "date" }), Type.Null()]),
	resolvedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
	createdAt: Type.String({ format: "date-time" }),
	updatedAt: Type.String({ format: "date-time" }),
});

export type AlertBody = Static<typeof AlertSchema>;

// ── List response ─────────────────────────────────────────────────────────────

export const AlertListResponseSchema = Type.Object({
	data: Type.Array(AlertSchema),
	total: Type.Integer({ minimum: 0 }),
});

export type AlertListResponseBody = Static<typeof AlertListResponseSchema>;

// ── PATCH /alerts/:id/status ──────────────────────────────────────────────────

export const AlertStatusPatchBodySchema = Type.Object({
	status: AlertStatusSchema,
	assignedTo: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
	snoozedUntil: Type.Optional(Type.Union([Type.String({ format: "date" }), Type.Null()])),
});

export type AlertStatusPatchBodyType = Static<typeof AlertStatusPatchBodySchema>;

// ── Query string ──────────────────────────────────────────────────────────────

export const AlertListQuerySchema = Type.Object({
	status: Type.Optional(AlertStatusSchema),
	type: Type.Optional(AlertTypeSchema),
	assignedTo: Type.Optional(Type.String({ format: "uuid" })),
	severity: Type.Optional(AlertSeveritySchema),
});

export type AlertListQueryType = Static<typeof AlertListQuerySchema>;
