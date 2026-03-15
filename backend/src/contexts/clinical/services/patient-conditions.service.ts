/**
 * PatientConditionsService — ICD-10 diagnosis management for hospice patients.
 *
 * isTerminal marks the qualifying terminal diagnosis (42 CFR §418.22).
 * isRelated marks CMS-required related conditions included on claims.
 *
 * RLS: every operation runs inside db.transaction() with applyRlsContext().
 * PHI: logAudit() on every read/write (HIPAA §164.312(b)).
 */

import { logAudit } from "@/contexts/identity/services/audit.service.js";
import { db } from "@/db/client.js";
import { patientConditions } from "@/db/schema/patient-conditions.table.js";
import { and, count, eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type {
  ConditionListResponse,
  CreateConditionBody,
  PatchConditionBody,
  PatientConditionResponse,
} from "../schemas/patient-conditions.schema.js";

type UserCtx = NonNullable<FastifyRequest["user"]>;
type AuditDbCtx = { insert: (typeof db)["insert"] };
type ConditionRow = typeof patientConditions.$inferSelect;

async function applyRlsContext(
  tx: { execute: (typeof db)["execute"] },
  user: UserCtx,
): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.current_user_id', ${user.id}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_location_id', ${user.locationId}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_role', ${user.role}, true)`);
}

function toConditionResponse(row: ConditionRow): PatientConditionResponse {
  const base: PatientConditionResponse = {
    id: row.id,
    patientId: row.patientId,
    icd10Code: row.icd10Code,
    description: row.description,
    isTerminal: row.isTerminal,
    isRelated: row.isRelated,
    clinicalStatus: row.clinicalStatus as PatientConditionResponse["clinicalStatus"],
    isActive: row.isActive,
    documentedBy: row.documentedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (row.severity != null)
    base.severity = row.severity as "MILD" | "MODERATE" | "SEVERE";
  if (row.onsetDate != null) base.onsetDate = row.onsetDate;
  if (row.confirmedDate != null) base.confirmedDate = row.confirmedDate;
  return base;
}

export async function listConditions(
  patientId: string,
  user: UserCtx,
): Promise<ConditionListResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const activeFilter = and(
      eq(patientConditions.patientId, patientId),
      eq(patientConditions.isActive, true),
    );

    const [rows, countRows] = await Promise.all([
      tx.select().from(patientConditions).where(activeFilter),
      tx.select({ value: count() }).from(patientConditions).where(activeFilter),
    ]);

    await logAudit(
      "view",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "patient_conditions",
        details: { count: rows.length },
      },
      tx as unknown as AuditDbCtx,
    );

    return {
      conditions: rows.map(toConditionResponse),
      total: Number(countRows[0]?.value ?? 0),
    };
  });
}

export async function getConditionById(
  patientId: string,
  conditionId: string,
  user: UserCtx,
): Promise<PatientConditionResponse | null> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const rows = await tx
      .select()
      .from(patientConditions)
      .where(
        and(eq(patientConditions.id, conditionId), eq(patientConditions.patientId, patientId)),
      );
    const row = rows[0];
    if (!row) return null;

    await logAudit(
      "view",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "patient_condition",
        resourceId: conditionId,
      },
      tx as unknown as AuditDbCtx,
    );

    return toConditionResponse(row);
  });
}

export async function createCondition(
  patientId: string,
  body: CreateConditionBody,
  user: UserCtx,
): Promise<PatientConditionResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const insertValues: typeof patientConditions.$inferInsert = {
      patientId,
      locationId: user.locationId,
      icd10Code: body.icd10Code,
      description: body.description,
      isTerminal: body.isTerminal,
      isRelated: body.isRelated,
      clinicalStatus: body.clinicalStatus as typeof patientConditions.$inferInsert["clinicalStatus"],
      documentedBy: user.id,
    };
    if (body.severity != null)
      insertValues.severity = body.severity as typeof patientConditions.$inferInsert["severity"];
    if (body.onsetDate != null) insertValues.onsetDate = body.onsetDate;
    if (body.confirmedDate != null) insertValues.confirmedDate = body.confirmedDate;

    const rows = await tx.insert(patientConditions).values(insertValues).returning();
    const row = rows[0];
    if (!row) throw new Error("Insert returned no rows");

    await logAudit(
      "create",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "patient_condition",
        resourceId: row.id,
        details: {
          icd10Code: body.icd10Code,
          isTerminal: body.isTerminal,
          isRelated: body.isRelated,
        },
      },
      tx as unknown as AuditDbCtx,
    );

    return toConditionResponse(row);
  });
}

export async function patchCondition(
  patientId: string,
  conditionId: string,
  body: PatchConditionBody,
  user: UserCtx,
): Promise<PatientConditionResponse | null> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const updateValues: Partial<typeof patientConditions.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (body.icd10Code !== undefined) updateValues.icd10Code = body.icd10Code;
    if (body.description !== undefined) updateValues.description = body.description;
    if (body.isTerminal !== undefined) updateValues.isTerminal = body.isTerminal;
    if (body.isRelated !== undefined) updateValues.isRelated = body.isRelated;
    if (body.clinicalStatus !== undefined)
      updateValues.clinicalStatus =
        body.clinicalStatus as typeof patientConditions.$inferInsert["clinicalStatus"];
    if (body.severity !== undefined)
      updateValues.severity =
        body.severity as typeof patientConditions.$inferInsert["severity"];
    if (body.onsetDate !== undefined) updateValues.onsetDate = body.onsetDate;
    if (body.confirmedDate !== undefined) updateValues.confirmedDate = body.confirmedDate;

    const updated = await tx
      .update(patientConditions)
      .set(updateValues)
      .where(
        and(eq(patientConditions.id, conditionId), eq(patientConditions.patientId, patientId)),
      )
      .returning();

    const row = updated[0];
    if (!row) return null;

    await logAudit(
      "update",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "patient_condition",
        resourceId: conditionId,
        details: { updatedFields: Object.keys(body) },
      },
      tx as unknown as AuditDbCtx,
    );

    return toConditionResponse(row);
  });
}

export async function deactivateCondition(
  patientId: string,
  conditionId: string,
  user: UserCtx,
): Promise<void> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const updated = await tx
      .update(patientConditions)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(eq(patientConditions.id, conditionId), eq(patientConditions.patientId, patientId)),
      )
      .returning({ id: patientConditions.id });

    if (!updated[0]) {
      throw Object.assign(new Error("Condition not found"), { statusCode: 404 });
    }

    await logAudit(
      "update",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "patient_condition",
        resourceId: conditionId,
        details: { action: "deactivate" },
      },
      tx as unknown as AuditDbCtx,
    );
  });
}

export const PatientConditionsService = {
  list: listConditions,
  getById: getConditionById,
  create: createCondition,
  patch: patchCondition,
  deactivate: deactivateCondition,
};
