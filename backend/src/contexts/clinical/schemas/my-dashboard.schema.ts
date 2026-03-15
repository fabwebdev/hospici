// contexts/clinical/schemas/my-dashboard.schema.ts
// Schema for the "my dashboard" endpoint — today's schedule + last signed note.

import { type Static, Type } from "@sinclair/typebox";

export const ScheduleItemSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    time: Type.String({ description: "HH:MM format" }),
    type: Type.Union([Type.Literal("visit"), Type.Literal("idg")]),
    visitType: Type.String(),
    label: Type.String({ description: "Patient name or team label" }),
  },
  { additionalProperties: false },
);

export type ScheduleItem = Static<typeof ScheduleItemSchema>;

export const LastSignedNoteSchema = Type.Object(
  {
    visitedAt: Type.String({ description: "ISO datetime" }),
    visitType: Type.String(),
    patientName: Type.String(),
  },
  { additionalProperties: false },
);

export type LastSignedNote = Static<typeof LastSignedNoteSchema>;

export const MyDashboardResponseSchema = Type.Object({
  schedule: Type.Array(ScheduleItemSchema),
  lastSignedNote: Type.Union([LastSignedNoteSchema, Type.Null()]),
});

export type MyDashboardResponse = Static<typeof MyDashboardResponseSchema>;
