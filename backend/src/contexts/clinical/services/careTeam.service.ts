/**
 * CareTeamService — care team member management for hospice patients.
 *
 * Features:
 *   - List active team members (unassigned_at IS NULL)
 *   - Assign new member (clinician with account or external provider)
 *   - Unassign member (soft delete via unassigned_at timestamp)
 *
 * RLS: every operation runs inside db.transaction() with applyRlsContext().
 * PHI: logAudit() on every read/write.
 */

import { logAudit } from "@/contexts/identity/services/audit.service.js";
import { db } from "@/db/client.js";
import { careTeamMembers } from "@/db/schema/care-team-members.table.js";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type {
  AssignCareTeamMemberBody,
  CareTeamListResponse,
  CareTeamMemberResponse,
} from "../schemas/careTeam.schema.js";

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

// ── Row → response mapper ─────────────────────────────────────────────────────

function toCareTeamMemberResponse(
  row: typeof careTeamMembers.$inferSelect,
): CareTeamMemberResponse {
  const base: CareTeamMemberResponse = {
    id: row.id,
    patientId: row.patientId,
    locationId: row.locationId,
    name: row.name,
    discipline: row.discipline as CareTeamMemberResponse["discipline"],
    role: row.role,
    isPrimaryContact: row.isPrimaryContact,
    isOnCall: row.isOnCall,
    assignedAt: row.assignedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
  if (row.userId != null) base.userId = row.userId;
  if (row.phone != null) base.phone = row.phone;
  if (row.email != null) base.email = row.email;
  if (row.assignedByUserId != null) base.assignedByUserId = row.assignedByUserId;
  if (row.unassignedAt != null) base.unassignedAt = row.unassignedAt.toISOString();
  return base;
}

// ── CRUD operations ───────────────────────────────────────────────────────────

export async function listCareTeam(
  patientId: string,
  user: UserCtx,
): Promise<CareTeamListResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const activeFilter = and(
      eq(careTeamMembers.patientId, patientId),
      isNull(careTeamMembers.unassignedAt),
    );

    const [rows, countRows] = await Promise.all([
      tx.select().from(careTeamMembers).where(activeFilter),
      tx.select({ value: count() }).from(careTeamMembers).where(activeFilter),
    ]);

    await logAudit(
      "view",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "care_team_list",
        details: { count: rows.length },
      },
      tx as unknown as AuditDbCtx,
    );

    return {
      members: rows.map(toCareTeamMemberResponse),
      total: Number(countRows[0]?.value ?? 0),
    };
  });
}

export async function assignMember(
  patientId: string,
  body: AssignCareTeamMemberBody,
  user: UserCtx,
): Promise<CareTeamMemberResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const rows = await tx
      .insert(careTeamMembers)
      .values({
        patientId,
        locationId: user.locationId,
        userId: body.userId,
        name: body.name,
        discipline: body.discipline as typeof careTeamMembers.$inferInsert["discipline"],
        role: body.role,
        phone: body.phone,
        email: body.email,
        isPrimaryContact: body.isPrimaryContact ?? false,
        isOnCall: body.isOnCall ?? false,
        assignedByUserId: user.id,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Insert returned no rows");

    await logAudit(
      "create",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "care_team_member",
        resourceId: row.id,
        details: {
          name: body.name,
          discipline: body.discipline,
          role: body.role,
          userId: body.userId,
        },
      },
      tx as unknown as AuditDbCtx,
    );

    return toCareTeamMemberResponse(row);
  });
}

export async function unassignMember(
  patientId: string,
  memberId: string,
  user: UserCtx,
): Promise<CareTeamMemberResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const rows = await tx
      .update(careTeamMembers)
      .set({ unassignedAt: new Date() })
      .where(
        and(eq(careTeamMembers.id, memberId), eq(careTeamMembers.patientId, patientId)),
      )
      .returning();

    const row = rows[0];
    if (!row) {
      throw Object.assign(new Error("Care team member not found"), { statusCode: 404 });
    }

    await logAudit(
      "update",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "care_team_member",
        resourceId: memberId,
        details: { action: "unassign" },
      },
      tx as unknown as AuditDbCtx,
    );

    return toCareTeamMemberResponse(row);
  });
}

export const CareTeamService = {
  listCareTeam,
  assignMember,
  unassignMember,
};
