/**
 * PatientService — CRUD operations for FHIR R4 Patient resources.
 *
 * PHI handling:
 *  - The entire FHIR `data` JSONB blob is encrypted via pgcrypto (PhiEncryptionService).
 *  - Promoted columns (id, locationId, admissionDate, dischargeDate, careModel) are
 *    stored unencrypted for efficient RLS filtering and billing queries.
 *
 * RLS pattern:
 *  - Every method runs inside db.transaction() and applies set_config LOCAL so that
 *    all queries within the transaction see the caller's RLS context.
 *  - This is required because set_config(…, true) is scoped to the current transaction;
 *    without an explicit transaction the Drizzle pool may use different connections.
 *
 * HIPAA §164.312(b): audit log emitted on every PHI read/write via AuditService.
 */

import { db } from "@/db/client.js";
import { patients } from "@/db/schema/patients.table.js";
import { AuditService } from "@/contexts/identity/services/audit.service.js";
import { PhiEncryptionService } from "@/shared-kernel/services/phi-encryption.service.js";
import type {
  CareModel,
  CreatePatientBody,
  PatchPatientBody,
  PatientResponse,
} from "../schemas/patient.schema.js";
import { and, count, eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";

type UserCtx = NonNullable<FastifyRequest["user"]>;

/** Shape of the FHIR data stored (encrypted) in the `data` JSONB column */
type PatientFhirData = Omit<CreatePatientBody, "careModel" | "admissionDate" | "dischargeDate">;

/** Duck-typed DB context — satisfied by both `db` and Drizzle `tx` */
type AuditDbCtx = { insert: (typeof db)["insert"] };

type DrizzleRow = typeof patients.$inferSelect;

/**
 * Apply RLS context LOCAL to the current transaction.
 * Must be called at the start of every db.transaction() in this service.
 */
async function applyRlsContext(tx: { execute: (typeof db)["execute"] }, user: UserCtx): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.current_user_id', ${user.id}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_location_id', ${user.locationId}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_role', ${user.role}, true)`);
}

/** Decrypt the `data` JSONB blob and merge with promoted columns to form the response. */
async function toPatientResponse(row: DrizzleRow): Promise<PatientResponse> {
  const encryptedData = row.data as string;
  const plaintext = await PhiEncryptionService.decrypt(encryptedData);
  const fhirData = JSON.parse(plaintext) as PatientFhirData;

  const response: PatientResponse = {
    id: row.id,
    resourceType: "Patient",
    identifier: fhirData.identifier,
    name: fhirData.name,
    birthDate: fhirData.birthDate,
    hospiceLocationId: fhirData.hospiceLocationId,
    careModel: (row.careModel as CareModel) ?? "HOSPICE",
  };

  // Conditionally include optional fields (exactOptionalPropertyTypes requires no explicit undefined)
  if (fhirData.gender !== undefined) response.gender = fhirData.gender;
  if (fhirData.address !== undefined) response.address = fhirData.address;
  if (fhirData._gender !== undefined) response._gender = fhirData._gender;
  if (row.admissionDate != null) response.admissionDate = row.admissionDate;
  if (row.dischargeDate != null) response.dischargeDate = row.dischargeDate;
  if (row.createdAt != null) response.createdAt = row.createdAt.toISOString();
  if (row.updatedAt != null) response.updatedAt = row.updatedAt.toISOString();

  return response;
}

export class PatientService {
  /**
   * List patients for the caller's location (RLS-enforced), with optional
   * careModel filter and cursor-style pagination.
   */
  static async list(
    user: UserCtx,
    query: { page?: number; limit?: number; careModel?: CareModel },
  ): Promise<{ patients: PatientResponse[]; total: number; page: number; limit: number }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const offset = (page - 1) * limit;

    return db.transaction(async (tx) => {
      await applyRlsContext(tx, user);

      const whereClause = query.careModel
        ? eq(patients.careModel, query.careModel)
        : undefined;

      const [rows, countRows] = await Promise.all([
        tx.select().from(patients).where(whereClause).limit(limit).offset(offset),
        tx.select({ value: count() }).from(patients).where(whereClause),
      ]);

      const total = countRows[0]?.value ?? 0;
      const decrypted = await Promise.all(rows.map(toPatientResponse));

      await AuditService.log(
        "view",
        user.id,
        null,
        {
          userRole: user.role,
          locationId: user.locationId,
          resourceType: "patient",
          resourceId: user.locationId,
          details: { action: "list", count: decrypted.length },
        },
        tx as unknown as AuditDbCtx,
      );

      return { patients: decrypted, total: Number(total), page, limit };
    });
  }

  /**
   * Fetch a single patient by ID. Returns null if not found (or not visible to caller via RLS).
   */
  static async getById(id: string, user: UserCtx): Promise<PatientResponse | null> {
    return db.transaction(async (tx) => {
      await applyRlsContext(tx, user);

      const rows = await tx.select().from(patients).where(eq(patients.id, id));
      const row = rows[0];
      if (!row) return null;

      const patient = await toPatientResponse(row);

      await AuditService.log("view", user.id, id, {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "patient",
      }, tx as unknown as AuditDbCtx);

      return patient;
    });
  }

  /**
   * Create a new patient. Encrypts PHI, inserts into patients table, emits audit log.
   * The caller's locationId overrides the body's hospiceLocationId for RLS safety.
   */
  static async create(body: CreatePatientBody, user: UserCtx): Promise<PatientResponse> {
    // Separate promoted DB columns from FHIR data
    const { careModel, admissionDate, dischargeDate, ...fhirFields } = body;

    // Always trust the session locationId — prevents cross-location patient creation
    const fhirData: PatientFhirData = {
      ...fhirFields,
      hospiceLocationId: user.locationId,
    };

    const encryptedData = await PhiEncryptionService.encrypt(JSON.stringify(fhirData));

    return db.transaction(async (tx) => {
      await applyRlsContext(tx, user);

      const insertValues: typeof patients.$inferInsert = {
        locationId: user.locationId,
        careModel: careModel ?? "HOSPICE",
        data: encryptedData,
      };
      if (admissionDate != null) insertValues.admissionDate = admissionDate;
      if (dischargeDate != null) insertValues.dischargeDate = dischargeDate;

      const rows = await tx.insert(patients).values(insertValues).returning();
      const row = rows[0];
      if (!row) throw new Error("Insert returned no rows");

      const patient = await toPatientResponse(row);

      await AuditService.log("create", user.id, row.id, {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "patient",
        details: { careModel: row.careModel },
      }, tx as unknown as AuditDbCtx);

      return patient;
    });
  }

  /**
   * Partially update a patient. Merges patch onto existing FHIR data, re-encrypts,
   * updates promoted columns. Returns null if patient not found.
   */
  static async patch(
    id: string,
    body: PatchPatientBody,
    user: UserCtx,
  ): Promise<PatientResponse | null> {
    return db.transaction(async (tx) => {
      await applyRlsContext(tx, user);

      // Fetch existing (RLS-enforced)
      const existing = await tx.select().from(patients).where(eq(patients.id, id));
      const existingRow = existing[0];
      if (!existingRow) return null;

      const encryptedExisting = existingRow.data as string;
      const existingFhir = JSON.parse(
        await PhiEncryptionService.decrypt(encryptedExisting),
      ) as PatientFhirData;

      // Separate promoted fields from FHIR patch
      const { careModel, admissionDate, dischargeDate, ...fhirPatch } = body;

      const mergedFhir: PatientFhirData = {
        ...existingFhir,
        ...fhirPatch,
        // hospiceLocationId is immutable after creation
        hospiceLocationId: existingFhir.hospiceLocationId,
      };

      const newEncryptedData = await PhiEncryptionService.encrypt(JSON.stringify(mergedFhir));

      const updateValues: Partial<typeof patients.$inferInsert> = {
        data: newEncryptedData,
        updatedAt: new Date(),
      };
      if (careModel !== undefined) updateValues.careModel = careModel;
      if (admissionDate !== undefined) updateValues.admissionDate = admissionDate;
      if (dischargeDate !== undefined) updateValues.dischargeDate = dischargeDate;

      const updated = await tx
        .update(patients)
        .set(updateValues)
        .where(and(eq(patients.id, id)))
        .returning();

      const updatedRow = updated[0];
      if (!updatedRow) throw new Error("Update returned no rows");

      const patient = await toPatientResponse(updatedRow);

      await AuditService.log("update", user.id, id, {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "patient",
        details: { updatedFields: Object.keys(body) },
      }, tx as unknown as AuditDbCtx);

      return patient;
    });
  }
}
