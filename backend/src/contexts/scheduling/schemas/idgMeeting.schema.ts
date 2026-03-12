// contexts/scheduling/schemas/idgMeeting.schema.ts
// Interdisciplinary Group (IDG) Meeting - CMS 15-day requirement

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

export const IDGMeetingSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    patientId: Type.String({ format: "uuid" }),
    scheduledAt: Type.String({ format: "date-time" }),
    completedAt: Type.Optional(Type.String({ format: "date-time" })),
    status: Type.Enum({
      scheduled: "scheduled",
      in_progress: "in_progress",
      completed: "completed",
      cancelled: "cancelled",
    }),
    // Required disciplines per CMS
    attendees: Type.Array(IDGMemberSchema),
    rnPresent: Type.Boolean(),
    mdPresent: Type.Boolean(),
    swPresent: Type.Boolean(),
    // Compliance tracking
    daysSinceLastIDG: Type.Number(),
    isCompliant: Type.Boolean(), // Must be ≤ 15 days
    // Notes
    carePlanReviewed: Type.Boolean(),
    symptomManagementDiscussed: Type.Boolean(),
    goalsOfCareReviewed: Type.Boolean(),
    notes: Type.Optional(Type.String()),
    locationId: Type.String({ format: "uuid" }),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);

// IDG 15-day compliance check
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

// Minimum required attendees
export const hasRequiredAttendees = (attendees: Static<typeof IDGMemberSchema>[]): boolean => {
  const roles = attendees
    .filter((a) => a.status === "present" || a.status === "remote")
    .map((a) => a.role.toLowerCase());
  return roles.includes("rn") && roles.includes("md") && roles.includes("sw");
};

export type IDGMeeting = Static<typeof IDGMeetingSchema>;
export type IDGMember = Static<typeof IDGMemberSchema>;
export type IDGAttendanceStatus = Static<typeof IDGAttendanceStatusSchema>;
