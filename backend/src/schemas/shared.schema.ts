import { Type, type Static } from "@sinclair/typebox";

// ── Primitives ─────────────────────────────────────────────────────────────────

export const UuidSchema = Type.String({
  format: "uuid",
  description: "UUID v4",
});

export const IsoDateSchema = Type.String({
  format: "date",
  description: "ISO 8601 date (YYYY-MM-DD)",
});

export const IsoDateTimeSchema = Type.String({
  format: "date-time",
  description: "ISO 8601 datetime",
});

// ── Shared params / query ──────────────────────────────────────────────────────

export const UuidParamsSchema = Type.Object({
  id: UuidSchema,
});

export const PaginationQuerySchema = Type.Object({
  page: Type.Optional(Type.Number({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100, default: 20 })),
  sortBy: Type.Optional(Type.String()),
  sortDir: Type.Optional(Type.Union([Type.Literal("asc"), Type.Literal("desc")])),
});

// ── Success / error envelopes ─────────────────────────────────────────────────

export const SuccessResponseSchema = <T extends ReturnType<typeof Type.Object>>(data: T) =>
  Type.Object({
    success: Type.Literal(true),
    data,
  });

export const ErrorResponseSchema = Type.Object({
  success: Type.Literal(false),
  error: Type.Object({
    code: Type.String(),
    message: Type.String(),
    details: Type.Optional(Type.Unknown()),
  }),
});

// ── PHI field inventory ───────────────────────────────────────────────────────
// Authoritative list. Any field added here is encrypted at rest via pgcrypto.
// Petra reviews all additions.

export const PhiFieldSchema = Type.Object({
  firstName: Type.String(),
  lastName: Type.String(),
  dateOfBirth: IsoDateSchema,
  ssn: Type.Optional(Type.String()),
  medicareId: Type.Optional(Type.String()),
  medicaidId: Type.Optional(Type.String()),
  address: Type.Optional(Type.String()),
  phone: Type.Optional(Type.String()),
  email: Type.Optional(Type.String()),
  diagnosis: Type.Optional(Type.String()),
  // Add new PHI fields here — notify Petra
});

// ── Static types ───────────────────────────────────────────────────────────────

export type Uuid = Static<typeof UuidSchema>;
export type PaginationQuery = Static<typeof PaginationQuerySchema>;
export type PhiField = Static<typeof PhiFieldSchema>;
