/**
 * MyDashboardService — User-scoped dashboard data.
 *
 * Returns today's schedule (visits + IDG meetings) and the last signed
 * encounter for the current user. All queries run in a single RLS-scoped
 * transaction.
 *
 * PHI: Patient names are decrypted from the patients table for display.
 */

import { db } from "@/db/client.js";
import { encounters } from "@/db/schema/encounters.table.js";
import { idgMeetings } from "@/db/schema/idg-meetings.table.js";
import { patients } from "@/db/schema/patients.table.js";
import { scheduledVisits } from "@/db/schema/scheduled-visits.table.js";
import { decryptPhi } from "@/shared-kernel/services/phi-encryption.service.js";
import { and, desc, eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { MyDashboardResponse, ScheduleItem } from "../schemas/my-dashboard.schema.js";

type UserCtx = NonNullable<FastifyRequest["user"]>;

async function applyRlsContext(
  tx: { execute: (typeof db)["execute"] },
  user: UserCtx,
): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.current_user_id', ${user.id}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_location_id', ${user.locationId}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_role', ${user.role}, true)`);
}

const VISIT_TYPE_LABELS: Record<string, string> = {
  routine_rn: "Routine Visit",
  admission: "Admission Visit",
  recertification: "Recertification",
  discharge: "Discharge Visit",
  crisis_visit: "Crisis Visit",
  social_work: "Social Work",
  chaplain: "Chaplain Visit",
  therapy: "Therapy",
  aide_visit: "Aide Visit",
  supervision: "Supervision",
  progress_note: "Progress Note",
};

async function decryptPatientName(encryptedData: unknown): Promise<string> {
  try {
    const plaintext = await decryptPhi(encryptedData as string);
    const fhir = JSON.parse(plaintext) as { name?: { given?: string[]; family?: string }[] };
    const primary = fhir.name?.[0];
    if (!primary) return "Unknown";
    const given = primary.given?.join(" ") ?? "";
    return `${given} ${primary.family ?? ""}`.trim() || "Unknown";
  } catch {
    return "Unknown";
  }
}

export async function getMyDashboard(user: UserCtx): Promise<MyDashboardResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // 1. Today's scheduled visits for this clinician
    const visitRows = await tx
      .select({
        id: scheduledVisits.id,
        scheduledDate: scheduledVisits.scheduledDate,
        visitType: scheduledVisits.visitType,
        patientId: scheduledVisits.patientId,
      })
      .from(scheduledVisits)
      .where(
        and(eq(scheduledVisits.clinicianId, user.id), eq(scheduledVisits.scheduledDate, todayStr), eq(scheduledVisits.status, "scheduled")),
      );

    // 2. Today's IDG meetings at this location (user may be an attendee)
    const idgRows = await tx
      .select({
        id: idgMeetings.id,
        scheduledAt: idgMeetings.scheduledAt,
        patientId: idgMeetings.patientId,
        status: idgMeetings.status,
      })
      .from(idgMeetings)
      .where(
        and(
          sql`${idgMeetings.scheduledAt}::date = ${todayStr}`,
          eq(idgMeetings.status, "scheduled"),
        ),
      );

    // 3. Last signed encounter for this clinician
    const lastSignedRows = await tx
      .select({
        visitedAt: encounters.visitedAt,
        visitType: encounters.visitType,
        patientId: encounters.patientId,
      })
      .from(encounters)
      .where(and(eq(encounters.clinicianId, user.id), eq(encounters.status, "SIGNED")))
      .orderBy(desc(encounters.visitedAt))
      .limit(1);

    // Collect all patient IDs that need name resolution
    const patientIds = new Set<string>();
    for (const row of visitRows) patientIds.add(row.patientId);
    for (const row of idgRows) patientIds.add(row.patientId);
    for (const row of lastSignedRows) patientIds.add(row.patientId);

    // Batch-fetch and decrypt patient names
    const nameMap = new Map<string, string>();
    if (patientIds.size > 0) {
      const patientRows = await tx
        .select({ id: patients.id, data: patients.data })
        .from(patients)
        .where(sql`${patients.id} = ANY(${[...patientIds]}::uuid[])`);

      await Promise.all(
        patientRows.map(async (row) => {
          const name = await decryptPatientName(row.data);
          nameMap.set(row.id, name);
        }),
      );
    }

    // Build schedule items
    const schedule: ScheduleItem[] = [];

    for (const row of visitRows) {
      schedule.push({
        id: row.id,
        time: "08:00", // scheduledDate is date-only; time not stored separately
        type: "visit",
        visitType: row.visitType,
        label: nameMap.get(row.patientId) ?? "Unknown",
      });
    }

    for (const row of idgRows) {
      const hours = row.scheduledAt.getHours().toString().padStart(2, "0");
      const minutes = row.scheduledAt.getMinutes().toString().padStart(2, "0");
      schedule.push({
        id: row.id,
        time: `${hours}:${minutes}`,
        type: "idg",
        visitType: "IDG Meeting",
        label: nameMap.get(row.patientId) ?? "Team",
      });
    }

    // Sort by time
    schedule.sort((a, b) => a.time.localeCompare(b.time));

    // Build last signed note
    let lastSignedNote: MyDashboardResponse["lastSignedNote"] = null;
    if (lastSignedRows[0]) {
      const row = lastSignedRows[0];
      lastSignedNote = {
        visitedAt: row.visitedAt.toISOString(),
        visitType: VISIT_TYPE_LABELS[row.visitType] ?? row.visitType,
        patientName: nameMap.get(row.patientId) ?? "Unknown",
      };
    }

    return { schedule, lastSignedNote };
  });
}
