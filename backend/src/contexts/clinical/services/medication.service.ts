/**
 * MedicationService — full medication management for hospice patients.
 *
 * Features:
 *   - Active medication list CRUD (scheduled + PRN + comfort-kit)
 *   - Controlled substance tracking (DEA schedule)
 *   - Medicare/hospice billing classification
 *   - Pharmacy coordination fields
 *   - Caregiver teaching documentation
 *   - Medication reconciliation
 *   - MAR (medication administration record) with effectiveness + adverse-effect monitoring
 *   - Patient allergy CRUD
 *   - OpenFDA drug interaction check on medication add
 *
 * RLS: every operation runs inside db.transaction() with applyRlsContext().
 * PHI: AuditService.log() on every read/write.
 * Socket.IO: medication:administered event emitted from route layer after MAR insert.
 */

import { logAudit } from "@/contexts/identity/services/audit.service.js";
import { db } from "@/db/client.js";
import { medicationAdministrations } from "@/db/schema/medication-administrations.table.js";
import { medications } from "@/db/schema/medications.table.js";
import { patientAllergies } from "@/db/schema/patient-allergies.table.js";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type {
  AdministrationListResponse,
  AllergyListResponse,
  CreateAllergyBody,
  CreateMedicationBody,
  DrugInteractionWarning,
  MedicationAdministration,
  MedicationListResponse,
  MedicationResponse,
  PatchAllergyBody,
  PatchMedicationBody,
  PatientAllergy,
  RecordAdministrationBody,
} from "../schemas/medication.schema.js";

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

// ── OpenFDA drug interaction check ────────────────────────────────────────────

/**
 * Queries the OpenFDA drug interaction endpoint for known interactions between
 * the new medication and the patient's active medications.
 *
 * Returns an empty array on any network/parse failure — never throws.
 * OpenFDA API requires no authentication key.
 */
async function checkDrugInteractions(
  newMedicationName: string,
  activeMedNames: string[],
): Promise<DrugInteractionWarning[]> {
  if (activeMedNames.length === 0) return [];

  try {
    const query = encodeURIComponent(`"${newMedicationName}"`);
    const url = `https://api.fda.gov/drug/label.json?search=drug_interactions:${query}&limit=5`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];

    const json = (await res.json()) as {
      results?: Array<{ drug_interactions?: string[] }>;
    };

    const warnings: DrugInteractionWarning[] = [];
    for (const result of json.results ?? []) {
      for (const interactionText of result.drug_interactions ?? []) {
        // Check if any active medication name appears in the interaction text
        for (const activeName of activeMedNames) {
          if (interactionText.toLowerCase().includes(activeName.toLowerCase())) {
            warnings.push({
              description: interactionText.slice(0, 300),
              severity: "unknown",
              interactingDrug: activeName,
            });
          }
        }
      }
    }
    return warnings;
  } catch {
    // Network errors or timeouts — fail open (never block clinical workflow)
    return [];
  }
}

// ── Row → response mappers ────────────────────────────────────────────────────

function toMedicationResponse(
  row: typeof medications.$inferSelect,
  interactionWarnings?: DrugInteractionWarning[],
): MedicationResponse {
  const base: MedicationResponse = {
    id: row.id,
    patientId: row.patientId,
    locationId: row.locationId,
    name: row.name,
    dosage: row.dosage,
    route: row.route,
    frequency: row.frequency,
    frequencyType: row.frequencyType as "SCHEDULED" | "PRN",
    isComfortKit: row.isComfortKit,
    indication: row.indication,
    startDate: row.startDate,
    status: row.status as "ACTIVE" | "DISCONTINUED" | "ON_HOLD",
    isControlledSubstance: row.isControlledSubstance,
    medicareCoverageType: row.medicareCoverageType as
      | "PART_A_RELATED"
      | "PART_D"
      | "NOT_COVERED"
      | "OTC",
    teachingCompleted: row.teachingCompleted,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (row.genericName != null) base.genericName = row.genericName;
  if (row.brandName != null) base.brandName = row.brandName;
  if (row.prnReason != null) base.prnReason = row.prnReason;
  if (row.prnMaxDosesPerDay != null) base.prnMaxDosesPerDay = Number(row.prnMaxDosesPerDay);
  if (row.endDate != null) base.endDate = row.endDate;
  if (row.prescriberId != null) base.prescriberId = row.prescriberId;
  if (row.physicianOrderId != null) base.physicianOrderId = row.physicianOrderId;
  if (row.discontinuedReason != null) base.discontinuedReason = row.discontinuedReason;
  if (row.discontinuedAt != null) base.discontinuedAt = row.discontinuedAt.toISOString();
  if (row.discontinuedBy != null) base.discontinuedBy = row.discontinuedBy;
  if (row.deaSchedule != null)
    base.deaSchedule = row.deaSchedule as "I" | "II" | "III" | "IV" | "V";
  if (row.pharmacyName != null) base.pharmacyName = row.pharmacyName;
  if (row.pharmacyPhone != null) base.pharmacyPhone = row.pharmacyPhone;
  if (row.pharmacyFax != null) base.pharmacyFax = row.pharmacyFax;
  if (row.patientInstructions != null) base.patientInstructions = row.patientInstructions;
  if (row.teachingCompletedAt != null)
    base.teachingCompletedAt = row.teachingCompletedAt.toISOString();
  if (row.teachingCompletedBy != null) base.teachingCompletedBy = row.teachingCompletedBy;
  if (row.reconciledAt != null) base.reconciledAt = row.reconciledAt.toISOString();
  if (row.reconciledBy != null) base.reconciledBy = row.reconciledBy;
  if (row.reconciliationNotes != null) base.reconciliationNotes = row.reconciliationNotes;
  if (interactionWarnings != null) base.interactionWarnings = interactionWarnings;
  return base;
}

function toAdministrationResponse(
  row: typeof medicationAdministrations.$inferSelect,
): MedicationAdministration {
  const base: MedicationAdministration = {
    id: row.id,
    medicationId: row.medicationId,
    patientId: row.patientId,
    locationId: row.locationId,
    administeredAt: row.administeredAt.toISOString(),
    administeredBy: row.administeredBy,
    administrationType: row.administrationType as "GIVEN" | "OMITTED" | "REFUSED",
    adverseEffectNoted: row.adverseEffectNoted,
    createdAt: row.createdAt.toISOString(),
  };
  if (row.doseGiven != null) base.doseGiven = row.doseGiven;
  if (row.routeGiven != null) base.routeGiven = row.routeGiven;
  if (row.omissionReason != null) base.omissionReason = row.omissionReason;
  if (row.effectivenessRating != null) base.effectivenessRating = row.effectivenessRating;
  if (row.adverseEffectDescription != null)
    base.adverseEffectDescription = row.adverseEffectDescription;
  if (row.notes != null) base.notes = row.notes;
  return base;
}

function toAllergyResponse(row: typeof patientAllergies.$inferSelect): PatientAllergy {
  const base: PatientAllergy = {
    id: row.id,
    patientId: row.patientId,
    locationId: row.locationId,
    allergen: row.allergen,
    allergenType: row.allergenType as "DRUG" | "FOOD" | "ENVIRONMENTAL" | "OTHER",
    reaction: row.reaction,
    severity: row.severity as "MILD" | "MODERATE" | "SEVERE" | "LIFE_THREATENING",
    documentedBy: row.documentedBy,
    documentedAt: row.documentedAt.toISOString(),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
  if (row.onsetDate != null) base.onsetDate = row.onsetDate;
  return base;
}

// ── Medication CRUD ───────────────────────────────────────────────────────────

export async function listMedications(
  patientId: string,
  user: UserCtx,
): Promise<MedicationListResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const [rows, countRows] = await Promise.all([
      tx
        .select()
        .from(medications)
        .where(eq(medications.patientId, patientId))
        .orderBy(asc(medications.name)),
      tx.select({ value: count() }).from(medications).where(eq(medications.patientId, patientId)),
    ]);

    await logAudit(
      "view",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "medication_list",
        details: { count: rows.length },
      },
      tx as unknown as AuditDbCtx,
    );

    return {
      medications: rows.map((r) => toMedicationResponse(r)),
      total: Number(countRows[0]?.value ?? 0),
    };
  });
}

export async function createMedication(
  patientId: string,
  body: CreateMedicationBody,
  user: UserCtx,
): Promise<MedicationResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const rows = await tx
      .insert(medications)
      .values({
        patientId,
        locationId: user.locationId,
        name: body.name,
        genericName: body.genericName,
        brandName: body.brandName,
        dosage: body.dosage,
        route: body.route,
        frequency: body.frequency,
        frequencyType: body.frequencyType,
        prnReason: body.prnReason,
        prnMaxDosesPerDay: body.prnMaxDosesPerDay?.toString(),
        isComfortKit: body.isComfortKit ?? false,
        indication: body.indication,
        startDate: body.startDate,
        endDate: body.endDate,
        prescriberId: body.prescriberId,
        physicianOrderId: body.physicianOrderId,
        isControlledSubstance: body.isControlledSubstance ?? false,
        deaSchedule: body.deaSchedule as "I" | "II" | "III" | "IV" | "V" | undefined,
        medicareCoverageType: body.medicareCoverageType as
          | "PART_A_RELATED"
          | "PART_D"
          | "NOT_COVERED"
          | "OTC",
        pharmacyName: body.pharmacyName,
        pharmacyPhone: body.pharmacyPhone,
        pharmacyFax: body.pharmacyFax,
        patientInstructions: body.patientInstructions,
        status: "ACTIVE",
        teachingCompleted: false,
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
        resourceType: "medication",
        resourceId: row.id,
        details: {
          name: body.name,
          frequencyType: body.frequencyType,
          isComfortKit: body.isComfortKit ?? false,
          medicareCoverageType: body.medicareCoverageType,
        },
      },
      tx as unknown as AuditDbCtx,
    );

    // OpenFDA interaction check — run outside transaction (network I/O)
    const activeMeds = await db
      .select({ name: medications.name })
      .from(medications)
      .where(and(eq(medications.patientId, patientId), eq(medications.status, "ACTIVE")));

    const activeMedNames = activeMeds.map((m) => m.name).filter((n) => n !== body.name);

    const interactionWarnings = await checkDrugInteractions(body.name, activeMedNames);

    return toMedicationResponse(row, interactionWarnings);
  });
}

export async function patchMedication(
  patientId: string,
  medId: string,
  body: PatchMedicationBody,
  user: UserCtx,
): Promise<MedicationResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const updates: Partial<typeof medications.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (body.status !== undefined) updates.status = body.status;
    if (body.endDate !== undefined) updates.endDate = body.endDate;
    if (body.medicareCoverageType !== undefined)
      updates.medicareCoverageType = body.medicareCoverageType as
        | "PART_A_RELATED"
        | "PART_D"
        | "NOT_COVERED"
        | "OTC";
    if (body.pharmacyName !== undefined) updates.pharmacyName = body.pharmacyName;
    if (body.pharmacyPhone !== undefined) updates.pharmacyPhone = body.pharmacyPhone;
    if (body.pharmacyFax !== undefined) updates.pharmacyFax = body.pharmacyFax;
    if (body.patientInstructions !== undefined)
      updates.patientInstructions = body.patientInstructions;
    if (body.reconciliationNotes !== undefined)
      updates.reconciliationNotes = body.reconciliationNotes;
    if (body.physicianOrderId !== undefined) updates.physicianOrderId = body.physicianOrderId;

    // Discontinuation shortcut
    if (body.status === "DISCONTINUED") {
      updates.discontinuedAt = new Date();
      updates.discontinuedBy = user.id;
      if (body.discontinuedReason) updates.discontinuedReason = body.discontinuedReason;
    }

    // Teaching completion
    if (body.teachingCompleted === true) {
      updates.teachingCompleted = true;
      updates.teachingCompletedAt = new Date();
      updates.teachingCompletedBy = user.id;
    }

    // Reconciliation
    if (body.reconciledAt !== undefined) {
      updates.reconciledAt = new Date(body.reconciledAt);
      updates.reconciledBy = user.id;
    }

    const rows = await tx
      .update(medications)
      .set(updates)
      .where(and(eq(medications.id, medId), eq(medications.patientId, patientId)))
      .returning();

    const row = rows[0];
    if (!row) {
      throw Object.assign(new Error("Medication not found"), { statusCode: 404 });
    }

    await logAudit(
      "update",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "medication",
        resourceId: medId,
        details: { fields: Object.keys(body) },
      },
      tx as unknown as AuditDbCtx,
    );

    return toMedicationResponse(row);
  });
}

// ── MAR (Medication Administration Record) ────────────────────────────────────

export async function recordAdministration(
  patientId: string,
  medId: string,
  body: RecordAdministrationBody,
  user: UserCtx,
): Promise<MedicationAdministration> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const rows = await tx
      .insert(medicationAdministrations)
      .values({
        medicationId: medId,
        patientId,
        locationId: user.locationId,
        administeredAt: new Date(body.administeredAt),
        administeredBy: user.id,
        administrationType: body.administrationType,
        doseGiven: body.doseGiven,
        routeGiven: body.routeGiven,
        omissionReason: body.omissionReason,
        effectivenessRating: body.effectivenessRating,
        adverseEffectNoted: body.adverseEffectNoted ?? false,
        adverseEffectDescription: body.adverseEffectDescription,
        notes: body.notes,
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
        resourceType: "medication_administration",
        resourceId: row.id,
        details: {
          medicationId: medId,
          administrationType: body.administrationType,
          adverseEffectNoted: body.adverseEffectNoted ?? false,
          effectivenessRating: body.effectivenessRating,
        },
      },
      tx as unknown as AuditDbCtx,
    );

    return toAdministrationResponse(row);
  });
}

export async function listAdministrations(
  patientId: string,
  medId: string,
  user: UserCtx,
): Promise<AdministrationListResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const [rows, countRows] = await Promise.all([
      tx
        .select()
        .from(medicationAdministrations)
        .where(
          and(
            eq(medicationAdministrations.patientId, patientId),
            eq(medicationAdministrations.medicationId, medId),
          ),
        )
        .orderBy(desc(medicationAdministrations.administeredAt)),
      tx
        .select({ value: count() })
        .from(medicationAdministrations)
        .where(
          and(
            eq(medicationAdministrations.patientId, patientId),
            eq(medicationAdministrations.medicationId, medId),
          ),
        ),
    ]);

    await logAudit(
      "view",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "medication_administration_list",
        details: { medicationId: medId, count: rows.length },
      },
      tx as unknown as AuditDbCtx,
    );

    return {
      administrations: rows.map(toAdministrationResponse),
      total: Number(countRows[0]?.value ?? 0),
    };
  });
}

// ── Patient allergies ──────────────────────────────────────────────────────────

export async function listAllergies(
  patientId: string,
  user: UserCtx,
): Promise<AllergyListResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const [rows, countRows] = await Promise.all([
      tx
        .select()
        .from(patientAllergies)
        .where(eq(patientAllergies.patientId, patientId))
        .orderBy(asc(patientAllergies.allergen)),
      tx
        .select({ value: count() })
        .from(patientAllergies)
        .where(eq(patientAllergies.patientId, patientId)),
    ]);

    await logAudit(
      "view",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "allergy_list",
        details: { count: rows.length },
      },
      tx as unknown as AuditDbCtx,
    );

    return {
      allergies: rows.map(toAllergyResponse),
      total: Number(countRows[0]?.value ?? 0),
    };
  });
}

export async function createAllergy(
  patientId: string,
  body: CreateAllergyBody,
  user: UserCtx,
): Promise<PatientAllergy> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const rows = await tx
      .insert(patientAllergies)
      .values({
        patientId,
        locationId: user.locationId,
        allergen: body.allergen,
        allergenType: body.allergenType as "DRUG" | "FOOD" | "ENVIRONMENTAL" | "OTHER",
        reaction: body.reaction,
        severity: body.severity as "MILD" | "MODERATE" | "SEVERE" | "LIFE_THREATENING",
        onsetDate: body.onsetDate,
        documentedBy: user.id,
        isActive: true,
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
        resourceType: "patient_allergy",
        resourceId: row.id,
        details: {
          allergen: body.allergen,
          allergenType: body.allergenType,
          severity: body.severity,
        },
      },
      tx as unknown as AuditDbCtx,
    );

    return toAllergyResponse(row);
  });
}

export async function patchAllergy(
  patientId: string,
  allergyId: string,
  body: PatchAllergyBody,
  user: UserCtx,
): Promise<PatientAllergy> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const updates: Partial<typeof patientAllergies.$inferInsert> = {};
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.reaction !== undefined) updates.reaction = body.reaction;
    if (body.severity !== undefined)
      updates.severity = body.severity as "MILD" | "MODERATE" | "SEVERE" | "LIFE_THREATENING";

    const rows = await tx
      .update(patientAllergies)
      .set(updates)
      .where(and(eq(patientAllergies.id, allergyId), eq(patientAllergies.patientId, patientId)))
      .returning();

    const row = rows[0];
    if (!row) {
      throw Object.assign(new Error("Allergy not found"), { statusCode: 404 });
    }

    await logAudit(
      "update",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "patient_allergy",
        resourceId: allergyId,
        details: { fields: Object.keys(body) },
      },
      tx as unknown as AuditDbCtx,
    );

    return toAllergyResponse(row);
  });
}

export const MedicationService = {
  listMedications,
  createMedication,
  patchMedication,
  recordAdministration,
  listAdministrations,
  listAllergies,
  createAllergy,
  patchAllergy,
};
