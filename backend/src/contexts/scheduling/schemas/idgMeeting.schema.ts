// contexts/scheduling/schemas/idgMeeting.schema.ts
// Interdisciplinary Group (IDG) Meeting - CMS 15-day requirement (42 CFR §418.56)

import { type Static, Type } from "@sinclair/typebox";

export const IDGAttendanceStatusSchema = Type.Enum({
  present: "present",
  absent: "absent",
  excused: "excused",
  remote: "remote",
});

export const IDGMemberSchema = Type.Object({
  userId: Type.String({ format: "uuid" }),
  name: Type.String(),
  role: Type.String(), // RN, MD, SW, Chaplain, etc.
  status: IDGAttendanceStatusSchema,
});

// Per-attendee notes captured during the live meeting (No-Prep IDG)
export const IDGAttendeeNoteEntrySchema = Type.Object({
  role: Type.String(),
  notes: Type.String(),
  goalsReviewed: Type.Boolean(),
  concerns: Type.Union([Type.String(), Type.Null()]),
});

// Keyed by userId — { [userId: string]: IDGAttendeeNoteEntry }
export const IDGAttendeeNotesSchema = Type.Record(Type.String(), IDGAttendeeNoteEntrySchema);

export const IDGMeetingStatusSchema = Type.Enum({
  scheduled: "scheduled",
  in_progress: "in_progress",
  completed: "completed",
  cancelled: "cancelled",
});

export const IDGMeetingSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    patientId: Type.String({ format: "uuid" }),
    scheduledAt: Type.String({ format: "date-time" }),
    completedAt: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
    status: IDGMeetingStatusSchema,
    // Required disciplines per CMS
    attendees: Type.Array(IDGMemberSchema),
    rnPresent: Type.Boolean(),
    mdPresent: Type.Boolean(),
    swPresent: Type.Boolean(),
    // Compliance tracking
    daysSinceLastIdg: Type.Union([Type.Number(), Type.Null()]),
    isCompliant: Type.Boolean(), // Must be ≤ 15 days
    // Notes
    carePlanReviewed: Type.Boolean(),
    symptomManagementDiscussed: Type.Boolean(),
    goalsOfCareReviewed: Type.Boolean(),
    notes: Type.Union([Type.String(), Type.Null()]),
    // No-Prep IDG: per-attendee structured notes
    attendeeNotes: IDGAttendeeNotesSchema,
    assembledNote: Type.Union([Type.String(), Type.Null()]),
    locationId: Type.String({ format: "uuid" }),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

// ── CRUD request schemas ───────────────────────────────────────────────────────

export const CreateIDGMeetingBodySchema = Type.Object(
  {
    patientId: Type.String({ format: "uuid" }),
    scheduledAt: Type.String({ format: "date-time" }),
    attendees: Type.Array(IDGMemberSchema, { minItems: 1 }),
    carePlanReviewed: Type.Optional(Type.Boolean()),
    symptomManagementDiscussed: Type.Optional(Type.Boolean()),
    goalsOfCareReviewed: Type.Optional(Type.Boolean()),
    notes: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const CompleteIDGMeetingBodySchema = Type.Object(
  {
    attendees: Type.Array(IDGMemberSchema, { minItems: 1 }),
    attendeeNotes: IDGAttendeeNotesSchema,
    carePlanReviewed: Type.Boolean(),
    symptomManagementDiscussed: Type.Boolean(),
    goalsOfCareReviewed: Type.Boolean(),
    notes: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export const IDGMeetingResponseSchema = IDGMeetingSchema;

export const IDGMeetingListResponseSchema = Type.Object(
  {
    meetings: Type.Array(IDGMeetingResponseSchema),
    total: Type.Number(),
  },
  { additionalProperties: false },
);

export const IDGComplianceStatusSchema = Type.Object(
  {
    patientId: Type.String({ format: "uuid" }),
    compliant: Type.Boolean(),
    daysSinceLastIdg: Type.Union([Type.Number(), Type.Null()]),
    daysOverdue: Type.Number(),
    lastMeetingId: Type.Union([Type.String({ format: "uuid" }), Type.Null()]),
    lastMeetingDate: Type.Union([Type.String({ format: "date-time" }), Type.Null()]),
  },
  { additionalProperties: false },
);

// ── Business logic helpers ────────────────────────────────────────────────────

/** CMS 42 CFR §418.56 — IDG must meet at least every 15 days */
export const checkIDGCompliance = (
  lastIDGDate: string,
  currentDate: string = new Date().toISOString(),
): { compliant: boolean; daysOverdue: number } => {
  const last = new Date(lastIDGDate);
  const current = new Date(currentDate);
  const daysDiff = Math.floor((current.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));

  return {
    compliant: daysDiff <= 15,
    daysOverdue: Math.max(0, daysDiff - 15),
  };
};

/**
 * Roles that satisfy the "pastoral or other counselor" requirement per 42 CFR §418.56(a)(4).
 * Hospices may use different titles — all map to the same CMS requirement.
 */
const CHAPLAIN_ROLES = new Set([
  "chaplain",
  "spiritual_care",
  "spiritual care",
  "pastoral_counselor",
  "pastoral counselor",
  "pastoral",
  "counselor",
]);

/**
 * 42 CFR §418.56(a) — IDG must include at minimum:
 *  (1) Physician (MD or DO)
 *  (2) Registered Nurse (RN)
 *  (3) Social Worker (SW)
 *  (4) Pastoral or other counselor (Chaplain / Spiritual Care)
 *
 * All four must be present or remote. Absent/excused does NOT count.
 */
export const hasRequiredAttendees = (attendees: Static<typeof IDGMemberSchema>[]): boolean => {
  const roles = attendees
    .filter((a) => a.status === "present" || a.status === "remote")
    .map((a) => a.role.toLowerCase());
  const hasChaplain = roles.some((r) => CHAPLAIN_ROLES.has(r));
  return roles.includes("rn") && roles.includes("md") && roles.includes("sw") && hasChaplain;
};

/**
 * Assemble structured IDG note from per-attendee contributions.
 * Called on status → 'completed' transition.
 */
export const assembleIDGNote = (
  attendees: Static<typeof IDGMemberSchema>[],
  attendeeNotes: Static<typeof IDGAttendeeNotesSchema>,
  meetingDate: string,
): string => {
  const dateStr = new Date(meetingDate).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const lines: string[] = [`IDG Meeting Note — ${dateStr}`, ""];

  const activeAttendees = attendees.filter((a) => a.status === "present" || a.status === "remote");

  for (const attendee of activeAttendees) {
    const note = attendeeNotes[attendee.userId];
    if (!note) continue;
    lines.push(`[${note.role}] ${attendee.name}:`);
    lines.push(`  Update: ${note.notes}`);
    lines.push(`  Goals of care reviewed: ${note.goalsReviewed ? "Yes" : "No"}`);
    if (note.concerns) {
      lines.push(`  Concerns: ${note.concerns}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type IDGMeeting = Static<typeof IDGMeetingSchema>;
export type IDGMember = Static<typeof IDGMemberSchema>;
export type IDGAttendanceStatus = Static<typeof IDGAttendanceStatusSchema>;
export type IDGAttendeeNoteEntry = Static<typeof IDGAttendeeNoteEntrySchema>;
export type IDGAttendeeNotes = Static<typeof IDGAttendeeNotesSchema>;
export type CreateIDGMeetingBody = Static<typeof CreateIDGMeetingBodySchema>;
export type CompleteIDGMeetingBody = Static<typeof CompleteIDGMeetingBodySchema>;
export type IDGMeetingResponse = Static<typeof IDGMeetingResponseSchema>;
export type IDGMeetingListResponse = Static<typeof IDGMeetingListResponseSchema>;
export type IDGComplianceStatus = Static<typeof IDGComplianceStatusSchema>;
