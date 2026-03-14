/**
 * Team communication schemas — TypeBox definitions for the team comm module.
 *
 * Covers:
 *   - Thread creation and listing (with last message + unread count)
 *   - Message listing and sending
 *   - Socket.IO event: comm:message (sent to location:{locationId} room)
 *
 * Schema-first: TypeBox → Drizzle table → migration → typebox-compiler.ts
 * No TypeCompiler.Compile() calls here — all compilation in typebox-compiler.ts.
 */

import { type Static, Type } from "@sinclair/typebox";

// ── Thread schemas ─────────────────────────────────────────────────────────────

export const CommThreadResponseSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  patientId: Type.String({ format: "uuid" }),
  locationId: Type.String({ format: "uuid" }),
  subject: Type.String({ minLength: 1, maxLength: 500 }),
  createdByUserId: Type.Optional(Type.String({ format: "uuid" })),
  createdAt: Type.String({ format: "date-time" }),
  lastMessageAt: Type.Optional(Type.String({ format: "date-time" })),
  lastMessageBody: Type.Optional(Type.String()),
  messageCount: Type.Integer(),
});
export type CommThreadResponse = Static<typeof CommThreadResponseSchema>;

export const CommThreadListResponseSchema = Type.Object({
  threads: Type.Array(CommThreadResponseSchema),
  total: Type.Integer(),
});
export type CommThreadListResponse = Static<typeof CommThreadListResponseSchema>;

export const CreateCommThreadBodySchema = Type.Object({
  subject: Type.String({ minLength: 1, maxLength: 500 }),
  /** Optional first message body — creates thread + first message atomically */
  initialMessage: Type.Optional(Type.String({ minLength: 1, maxLength: 10000 })),
});
export type CreateCommThreadBody = Static<typeof CreateCommThreadBodySchema>;

// ── Message schemas ────────────────────────────────────────────────────────────

export const CommMessageResponseSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  threadId: Type.String({ format: "uuid" }),
  patientId: Type.String({ format: "uuid" }),
  locationId: Type.String({ format: "uuid" }),
  authorUserId: Type.Optional(Type.String({ format: "uuid" })),
  body: Type.String({ minLength: 1, maxLength: 10000 }),
  sentAt: Type.String({ format: "date-time" }),
});
export type CommMessageResponse = Static<typeof CommMessageResponseSchema>;

export const CommMessageListResponseSchema = Type.Object({
  messages: Type.Array(CommMessageResponseSchema),
  total: Type.Integer(),
});
export type CommMessageListResponse = Static<typeof CommMessageListResponseSchema>;

export const SendCommMessageBodySchema = Type.Object({
  body: Type.String({ minLength: 1, maxLength: 10000 }),
});
export type SendCommMessageBody = Static<typeof SendCommMessageBodySchema>;
