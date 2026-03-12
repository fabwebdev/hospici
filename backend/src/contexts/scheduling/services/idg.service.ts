/**
 * IDGService — IDG meeting recording + CMS 15-day compliance enforcement.
 *
 * 42 CFR §418.56: The IDG must review each patient's plan of care at least every
 * 15 days. Missing this deadline is a hard block — not a warning.
 *
 * No-Prep IDG: Each attendee documents their update during the live meeting via
 * `attendeeNotes`. On `status: 'completed'` transition, an assembled IDG note is
 * generated automatically from all contributions.
 *
 * HIPAA: audit log emitted on every read/write via AuditService.
 */

import { logAudit } from "@/contexts/identity/services/audit.service.js";
import { db } from "@/db/client.js";
import { idgMeetings } from "@/db/schema/idg-meetings.table.js";
import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import {
  type CompleteIDGMeetingBody,
  type CreateIDGMeetingBody,
  type IDGComplianceStatus,
  type IDGMeetingListResponse,
  type IDGMeetingResponse,
  assembleIDGNote,
  checkIDGCompliance,
  hasRequiredAttendees,
} from "../schemas/idgMeeting.schema.js";

type UserCtx = NonNullable<FastifyRequest["user"]>;
type AuditDbCtx = { insert: (typeof db)["insert"] };

async function applyRlsContext(
  tx: { execute: (typeof db)["execute"] },
  user: UserCtx,
): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.current_user_id', ${user.id}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_location_id', ${user.locationId}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_role', ${user.role}, true)`);
}

function toResponse(row: typeof idgMeetings.$inferSelect): IDGMeetingResponse {
  return {
    id: row.id,
    patientId: row.patientId,
    locationId: row.locationId,
    scheduledAt: row.scheduledAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    status: row.status as IDGMeetingResponse["status"],
    attendees: (row.attendees as IDGMeetingResponse["attendees"]) ?? [],
    rnPresent: row.rnPresent ?? false,
    mdPresent: row.mdPresent ?? false,
    swPresent: row.swPresent ?? false,
    daysSinceLastIdg: row.daysSinceLastIdg ?? null,
    isCompliant: row.isCompliant ?? true,
    carePlanReviewed: row.carePlanReviewed ?? false,
    symptomManagementDiscussed: row.symptomManagementDiscussed ?? false,
    goalsOfCareReviewed: row.goalsOfCareReviewed ?? false,
    notes: row.notes ?? null,
    attendeeNotes: (row.attendeeNotes as IDGMeetingResponse["attendeeNotes"]) ?? {},
    assembledNote: row.assembledNote ?? null,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: row.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

export async function createIDGMeeting(
  body: CreateIDGMeetingBody,
  user: UserCtx,
): Promise<IDGMeetingResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const rows = await tx
      .insert(idgMeetings)
      .values({
        patientId: body.patientId,
        locationId: user.locationId,
        scheduledAt: new Date(body.scheduledAt),
        status: "scheduled",
        attendees: body.attendees,
        rnPresent: body.attendees.some(
          (a) => a.role.toLowerCase() === "rn" && (a.status === "present" || a.status === "remote"),
        ),
        mdPresent: body.attendees.some(
          (a) => a.role.toLowerCase() === "md" && (a.status === "present" || a.status === "remote"),
        ),
        swPresent: body.attendees.some(
          (a) => a.role.toLowerCase() === "sw" && (a.status === "present" || a.status === "remote"),
        ),
        carePlanReviewed: body.carePlanReviewed ?? false,
        symptomManagementDiscussed: body.symptomManagementDiscussed ?? false,
        goalsOfCareReviewed: body.goalsOfCareReviewed ?? false,
        notes: body.notes ?? null,
        attendeeNotes: {},
        isCompliant: true, // assessed at completion
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Insert returned no rows");

    await logAudit(
      "create",
      user.id,
      body.patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "idg_meeting",
        resourceId: row.id,
        details: { scheduledAt: body.scheduledAt },
      },
      tx as unknown as AuditDbCtx,
    );

    return toResponse(row);
  });
}

export async function listIDGMeetings(
  patientId: string,
  user: UserCtx,
): Promise<IDGMeetingListResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const rows = await tx
      .select()
      .from(idgMeetings)
      .where(eq(idgMeetings.patientId, patientId))
      .orderBy(desc(idgMeetings.scheduledAt));

    await logAudit(
      "view",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "idg_meeting",
        details: { action: "list", count: rows.length },
      },
      tx as unknown as AuditDbCtx,
    );

    return { meetings: rows.map(toResponse), total: rows.length };
  });
}

export class IDGAttendeeValidationError extends Error {
  readonly code = "IDG_MISSING_REQUIRED_DISCIPLINES";
  constructor(missing: string[]) {
    super(
      `IDG meeting requires RN, MD, SW, and Chaplain/Spiritual Care present or remote (42 CFR §418.56(a)). Missing: ${missing.join(", ")}`,
    );
  }
}

export async function completeIDGMeeting(
  meetingId: string,
  body: CompleteIDGMeetingBody,
  user: UserCtx,
): Promise<IDGMeetingResponse> {
  // Enforce required disciplines before writing (CMS 42 CFR §418.56(a) hard rule)
  if (!hasRequiredAttendees(body.attendees)) {
    const roles = body.attendees
      .filter((a) => a.status === "present" || a.status === "remote")
      .map((a) => a.role.toLowerCase());
    const CHAPLAIN_ROLES = new Set([
      "chaplain",
      "spiritual_care",
      "spiritual care",
      "pastoral_counselor",
      "pastoral counselor",
      "pastoral",
      "counselor",
    ]);
    const missing: string[] = [];
    if (!roles.includes("rn")) missing.push("RN");
    if (!roles.includes("md")) missing.push("MD");
    if (!roles.includes("sw")) missing.push("SW");
    if (!roles.some((r) => CHAPLAIN_ROLES.has(r))) missing.push("Chaplain/Spiritual Care");
    throw new IDGAttendeeValidationError(missing);
  }

  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    // Fetch existing meeting to get patientId + scheduledAt for assembled note
    const existing = await tx
      .select()
      .from(idgMeetings)
      .where(eq(idgMeetings.id, meetingId))
      .limit(1);

    if (!existing[0]) {
      throw new Error("IDG meeting not found");
    }

    const meeting = existing[0];
    const completedAt = new Date();
    const assembledNote = assembleIDGNote(
      body.attendees,
      body.attendeeNotes,
      completedAt.toISOString(),
    );

    // Compute compliance: days since previous completed meeting for same patient
    const prevMeeting = await tx
      .select()
      .from(idgMeetings)
      .where(and(eq(idgMeetings.patientId, meeting.patientId), eq(idgMeetings.status, "completed")))
      .orderBy(desc(idgMeetings.completedAt))
      .limit(1);

    let daysSinceLastIdg: number | null = null;
    let isCompliant = true;

    if (prevMeeting[0]?.completedAt) {
      const { compliant, daysOverdue } = checkIDGCompliance(
        prevMeeting[0].completedAt.toISOString(),
        completedAt.toISOString(),
      );
      const days = Math.floor(
        (completedAt.getTime() - prevMeeting[0].completedAt.getTime()) / (1000 * 60 * 60 * 24),
      );
      daysSinceLastIdg = days;
      isCompliant = compliant;
      // Suppress unused variable warning
      void daysOverdue;
    }

    const rows = await tx
      .update(idgMeetings)
      .set({
        status: "completed",
        completedAt,
        attendees: body.attendees,
        attendeeNotes: body.attendeeNotes,
        assembledNote,
        rnPresent: body.attendees.some(
          (a) => a.role.toLowerCase() === "rn" && (a.status === "present" || a.status === "remote"),
        ),
        mdPresent: body.attendees.some(
          (a) => a.role.toLowerCase() === "md" && (a.status === "present" || a.status === "remote"),
        ),
        swPresent: body.attendees.some(
          (a) => a.role.toLowerCase() === "sw" && (a.status === "present" || a.status === "remote"),
        ),
        daysSinceLastIdg,
        isCompliant,
        carePlanReviewed: body.carePlanReviewed,
        symptomManagementDiscussed: body.symptomManagementDiscussed,
        goalsOfCareReviewed: body.goalsOfCareReviewed,
        notes: body.notes ?? null,
        updatedAt: completedAt,
      })
      .where(eq(idgMeetings.id, meetingId))
      .returning();

    const updated = rows[0];
    if (!updated) throw new Error("Update returned no rows");

    await logAudit(
      "update",
      user.id,
      meeting.patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "idg_meeting",
        resourceId: meetingId,
        details: { action: "complete", isCompliant, daysSinceLastIdg },
      },
      tx as unknown as AuditDbCtx,
    );

    return toResponse(updated);
  });
}

export async function getIDGComplianceStatus(
  patientId: string,
  user: UserCtx,
): Promise<IDGComplianceStatus> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const lastCompleted = await tx
      .select()
      .from(idgMeetings)
      .where(and(eq(idgMeetings.patientId, patientId), eq(idgMeetings.status, "completed")))
      .orderBy(desc(idgMeetings.completedAt))
      .limit(1);

    await logAudit(
      "view",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "idg_compliance",
        details: { action: "compliance_check" },
      },
      tx as unknown as AuditDbCtx,
    );

    const meeting = lastCompleted[0];
    const meetingCompletedAt = meeting?.completedAt ?? null;

    if (!meeting || !meetingCompletedAt) {
      return {
        patientId,
        compliant: false,
        daysSinceLastIdg: null,
        daysOverdue: 0,
        lastMeetingId: null,
        lastMeetingDate: null,
      };
    }

    const { compliant, daysOverdue } = checkIDGCompliance(meetingCompletedAt.toISOString());
    const days = Math.floor((Date.now() - meetingCompletedAt.getTime()) / (1000 * 60 * 60 * 24));

    return {
      patientId,
      compliant,
      daysSinceLastIdg: days,
      daysOverdue,
      lastMeetingId: meeting.id,
      lastMeetingDate: meetingCompletedAt.toISOString(),
    };
  });
}

export const IDGService = {
  create: createIDGMeeting,
  list: listIDGMeetings,
  complete: completeIDGMeeting,
  compliance: getIDGComplianceStatus,
};
