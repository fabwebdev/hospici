/**
 * PatientInsuranceService — insurance/coverage record management for hospice patients.
 *
 * Stores Medicare Part A MBI, secondary insurance, and payer details needed by billing.
 * Soft-delete only (isActive = false) to preserve audit history.
 *
 * RLS: every operation runs inside db.transaction() with applyRlsContext().
 * PHI: logAudit() on every read/write (HIPAA §164.312(b)).
 */

import { logAudit } from "@/contexts/identity/services/audit.service.js";
import { db } from "@/db/client.js";
import { patientInsurance } from "@/db/schema/patient-insurance.table.js";
import { and, count, eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type {
  CreateInsuranceBody,
  InsuranceListResponse,
  PatchInsuranceBody,
  PatientInsuranceResponse,
} from "../schemas/patient-insurance.schema.js";

type UserCtx = NonNullable<FastifyRequest["user"]>;
type AuditDbCtx = { insert: (typeof db)["insert"] };
type InsuranceRow = typeof patientInsurance.$inferSelect;

async function applyRlsContext(
  tx: { execute: (typeof db)["execute"] },
  user: UserCtx,
): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.current_user_id', ${user.id}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_location_id', ${user.locationId}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_role', ${user.role}, true)`);
}

function toInsuranceResponse(row: InsuranceRow): PatientInsuranceResponse {
  const base: PatientInsuranceResponse = {
    id: row.id,
    patientId: row.patientId,
    coverageType: row.coverageType as PatientInsuranceResponse["coverageType"],
    isPrimary: row.isPrimary,
    payerName: row.payerName,
    subscriberId: row.subscriberId,
    relationshipToPatient:
      row.relationshipToPatient as PatientInsuranceResponse["relationshipToPatient"],
    isActive: row.isActive,
    documentedBy: row.documentedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (row.payerId != null) base.payerId = row.payerId;
  if (row.planName != null) base.planName = row.planName;
  if (row.policyNumber != null) base.policyNumber = row.policyNumber;
  if (row.groupNumber != null) base.groupNumber = row.groupNumber;
  if (row.subscriberFirstName != null) base.subscriberFirstName = row.subscriberFirstName;
  if (row.subscriberLastName != null) base.subscriberLastName = row.subscriberLastName;
  if (row.subscriberDob != null) base.subscriberDob = row.subscriberDob;
  if (row.effectiveDate != null) base.effectiveDate = row.effectiveDate;
  if (row.terminationDate != null) base.terminationDate = row.terminationDate;
  if (row.priorAuthNumber != null) base.priorAuthNumber = row.priorAuthNumber;
  return base;
}

export async function listInsurance(
  patientId: string,
  user: UserCtx,
): Promise<InsuranceListResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const activeFilter = and(
      eq(patientInsurance.patientId, patientId),
      eq(patientInsurance.isActive, true),
    );

    const [rows, countRows] = await Promise.all([
      tx.select().from(patientInsurance).where(activeFilter),
      tx.select({ value: count() }).from(patientInsurance).where(activeFilter),
    ]);

    await logAudit(
      "view",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "patient_insurance",
        details: { count: rows.length },
      },
      tx as unknown as AuditDbCtx,
    );

    return {
      insurance: rows.map(toInsuranceResponse),
      total: Number(countRows[0]?.value ?? 0),
    };
  });
}

export async function getInsuranceById(
  patientId: string,
  insuranceId: string,
  user: UserCtx,
): Promise<PatientInsuranceResponse | null> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const rows = await tx
      .select()
      .from(patientInsurance)
      .where(
        and(eq(patientInsurance.id, insuranceId), eq(patientInsurance.patientId, patientId)),
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
        resourceType: "patient_insurance",
        resourceId: insuranceId,
      },
      tx as unknown as AuditDbCtx,
    );

    return toInsuranceResponse(row);
  });
}

export async function createInsurance(
  patientId: string,
  body: CreateInsuranceBody,
  user: UserCtx,
): Promise<PatientInsuranceResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const insertValues: typeof patientInsurance.$inferInsert = {
      patientId,
      locationId: user.locationId,
      coverageType:
        body.coverageType as typeof patientInsurance.$inferInsert["coverageType"],
      isPrimary: body.isPrimary,
      payerName: body.payerName,
      subscriberId: body.subscriberId,
      relationshipToPatient:
        body.relationshipToPatient as typeof patientInsurance.$inferInsert["relationshipToPatient"],
      documentedBy: user.id,
    };
    if (body.payerId != null) insertValues.payerId = body.payerId;
    if (body.planName != null) insertValues.planName = body.planName;
    if (body.policyNumber != null) insertValues.policyNumber = body.policyNumber;
    if (body.groupNumber != null) insertValues.groupNumber = body.groupNumber;
    if (body.subscriberFirstName != null)
      insertValues.subscriberFirstName = body.subscriberFirstName;
    if (body.subscriberLastName != null) insertValues.subscriberLastName = body.subscriberLastName;
    if (body.subscriberDob != null) insertValues.subscriberDob = body.subscriberDob;
    if (body.effectiveDate != null) insertValues.effectiveDate = body.effectiveDate;
    if (body.terminationDate != null) insertValues.terminationDate = body.terminationDate;
    if (body.priorAuthNumber != null) insertValues.priorAuthNumber = body.priorAuthNumber;

    const rows = await tx.insert(patientInsurance).values(insertValues).returning();
    const row = rows[0];
    if (!row) throw new Error("Insert returned no rows");

    await logAudit(
      "create",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "patient_insurance",
        resourceId: row.id,
        details: { coverageType: body.coverageType, isPrimary: body.isPrimary },
      },
      tx as unknown as AuditDbCtx,
    );

    return toInsuranceResponse(row);
  });
}

export async function patchInsurance(
  patientId: string,
  insuranceId: string,
  body: PatchInsuranceBody,
  user: UserCtx,
): Promise<PatientInsuranceResponse | null> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const updateValues: Partial<typeof patientInsurance.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (body.coverageType !== undefined)
      updateValues.coverageType =
        body.coverageType as typeof patientInsurance.$inferInsert["coverageType"];
    if (body.isPrimary !== undefined) updateValues.isPrimary = body.isPrimary;
    if (body.payerName !== undefined) updateValues.payerName = body.payerName;
    if (body.payerId !== undefined) updateValues.payerId = body.payerId;
    if (body.planName !== undefined) updateValues.planName = body.planName;
    if (body.policyNumber !== undefined) updateValues.policyNumber = body.policyNumber;
    if (body.groupNumber !== undefined) updateValues.groupNumber = body.groupNumber;
    if (body.subscriberId !== undefined) updateValues.subscriberId = body.subscriberId;
    if (body.subscriberFirstName !== undefined)
      updateValues.subscriberFirstName = body.subscriberFirstName;
    if (body.subscriberLastName !== undefined)
      updateValues.subscriberLastName = body.subscriberLastName;
    if (body.subscriberDob !== undefined) updateValues.subscriberDob = body.subscriberDob;
    if (body.relationshipToPatient !== undefined)
      updateValues.relationshipToPatient =
        body.relationshipToPatient as typeof patientInsurance.$inferInsert["relationshipToPatient"];
    if (body.effectiveDate !== undefined) updateValues.effectiveDate = body.effectiveDate;
    if (body.terminationDate !== undefined) updateValues.terminationDate = body.terminationDate;
    if (body.priorAuthNumber !== undefined) updateValues.priorAuthNumber = body.priorAuthNumber;

    const updated = await tx
      .update(patientInsurance)
      .set(updateValues)
      .where(
        and(eq(patientInsurance.id, insuranceId), eq(patientInsurance.patientId, patientId)),
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
        resourceType: "patient_insurance",
        resourceId: insuranceId,
        details: { updatedFields: Object.keys(body) },
      },
      tx as unknown as AuditDbCtx,
    );

    return toInsuranceResponse(row);
  });
}

export async function deactivateInsurance(
  patientId: string,
  insuranceId: string,
  user: UserCtx,
): Promise<void> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const updated = await tx
      .update(patientInsurance)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(eq(patientInsurance.id, insuranceId), eq(patientInsurance.patientId, patientId)),
      )
      .returning({ id: patientInsurance.id });

    if (!updated[0]) {
      throw Object.assign(new Error("Insurance record not found"), { statusCode: 404 });
    }

    await logAudit(
      "update",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "patient_insurance",
        resourceId: insuranceId,
        details: { action: "deactivate" },
      },
      tx as unknown as AuditDbCtx,
    );
  });
}

export const PatientInsuranceService = {
  list: listInsurance,
  getById: getInsuranceById,
  create: createInsurance,
  patch: patchInsurance,
  deactivate: deactivateInsurance,
};
