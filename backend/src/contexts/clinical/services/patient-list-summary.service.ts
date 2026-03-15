/**
 * PatientListSummaryService — Bulk enrichment queries for the patient list.
 *
 * Returns IDG compliance status, NOE filing status, and primary clinician
 * for all patients visible to the caller (RLS-scoped).
 *
 * All three sub-queries run inside a single transaction with RLS context
 * so that location filtering is automatic.
 */

import { db } from "@/db/client.js";
import { careTeamMembers } from "@/db/schema/care-team-members.table.js";
import { idgMeetings } from "@/db/schema/idg-meetings.table.js";
import { noticesOfElection } from "@/db/schema/noe.table.js";
import { patients } from "@/db/schema/patients.table.js";
import { and, desc, eq, isNull, notInArray, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { PatientEnrichment, PatientListSummaryResponse } from "../schemas/patient-list-summary.schema.js";

type UserCtx = NonNullable<FastifyRequest["user"]>;

async function applyRlsContext(
  tx: { execute: (typeof db)["execute"] },
  user: UserCtx,
): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.current_user_id', ${user.id}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_location_id', ${user.locationId}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_role', ${user.role}, true)`);
}

const IDG_COMPLIANCE_DAYS = 15;

export async function getPatientListSummary(user: UserCtx): Promise<PatientListSummaryResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    // 1. Get all patient IDs for this location (RLS-filtered)
    const patientRows = await tx.select({ id: patients.id }).from(patients);
    const patientIds = patientRows.map((r) => r.id);

    if (patientIds.length === 0) return { summary: {} };

    // 2. Latest completed IDG meeting per patient (RLS on idg_meetings by location_id)
    const idgRows = await tx
      .select({
        patientId: idgMeetings.patientId,
        completedAt: idgMeetings.completedAt,
      })
      .from(idgMeetings)
      .where(eq(idgMeetings.status, "completed"))
      .orderBy(desc(idgMeetings.completedAt));

    // 3. Active NOE per patient (exclude terminal statuses)
    const noeRows = await tx
      .select({
        patientId: noticesOfElection.patientId,
        status: noticesOfElection.status,
      })
      .from(noticesOfElection)
      .where(notInArray(noticesOfElection.status, ["voided", "closed"]))
      .orderBy(desc(noticesOfElection.createdAt));

    // 4. Primary RN per patient (active assignments only)
    const careTeamRows = await tx
      .select({
        patientId: careTeamMembers.patientId,
        name: careTeamMembers.name,
      })
      .from(careTeamMembers)
      .where(
        and(
          eq(careTeamMembers.discipline, "RN"),
          eq(careTeamMembers.isPrimaryContact, true),
          isNull(careTeamMembers.unassignedAt),
        ),
      );

    // Build lookup maps — first match per patient wins (ordered by DESC)
    const idgByPatient = new Map<string, Date>();
    for (const row of idgRows) {
      if (!idgByPatient.has(row.patientId) && row.completedAt) {
        idgByPatient.set(row.patientId, row.completedAt);
      }
    }

    const noeByPatient = new Map<string, string>();
    for (const row of noeRows) {
      if (!noeByPatient.has(row.patientId)) {
        noeByPatient.set(row.patientId, row.status);
      }
    }

    const clinicianByPatient = new Map<string, string>();
    for (const row of careTeamRows) {
      if (!clinicianByPatient.has(row.patientId)) {
        clinicianByPatient.set(row.patientId, row.name);
      }
    }

    // Assemble enrichment per patient
    const summary: Record<string, PatientEnrichment> = {};
    const now = new Date();

    for (const id of patientIds) {
      const completedAt = idgByPatient.get(id);
      let idg: PatientEnrichment["idg"];

      if (!completedAt) {
        idg = { lastCompletedAt: null, daysRemaining: null, status: "none" };
      } else {
        const daysSince = Math.floor(
          (now.getTime() - completedAt.getTime()) / (1000 * 60 * 60 * 24),
        );
        const daysRemaining = IDG_COMPLIANCE_DAYS - daysSince;

        let status: "ok" | "warning" | "overdue";
        if (daysRemaining < 0) status = "overdue";
        else if (daysRemaining <= 3) status = "warning";
        else status = "ok";

        idg = {
          lastCompletedAt: completedAt.toISOString(),
          daysRemaining,
          status,
        };
      }

      summary[id] = {
        idg,
        noeStatus: noeByPatient.get(id) ?? null,
        primaryClinician: clinicianByPatient.get(id) ?? null,
      };
    }

    return { summary };
  });
}
