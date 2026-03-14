/**
 * FHIR Service — FHIR R4 Resource mapping and search operations
 *
 * Converts Hospici internal models to/from FHIR R4 format:
 * - Patient ↔ FHIR Patient (US Core profile)
 * - Pain Assessments ↔ FHIR Observation (US Core profile)
 *
 * RLS pattern: All methods run inside db.transaction() with RLS context applied.
 * SMART scope enforcement happens at route layer before calling these methods.
 */

import { env } from "@/config/env.js";
import { db } from "@/db/client.js";
import { painAssessments } from "@/db/schema/pain-assessments.table.js";
import { patients } from "@/db/schema/patients.table.js";
import { decryptPhi } from "@/shared-kernel/services/phi-encryption.service.js";
import { and, count, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type {
  FhirBundle,
  FhirObservation,
  FhirPatient,
  ObservationSearchQuery,
  PatientSearchQuery,
} from "../schemas/fhir.schema.js";

type UserCtx = NonNullable<FastifyRequest["user"]>;

/** Shape of the FHIR data stored in the `data` JSONB column */
type PatientFhirData = {
  identifier: Array<{ system: string; value: string }>;
  name: Array<{
    use?: string;
    family: string;
    given: string[];
  }>;
  gender?: "male" | "female" | "other" | "unknown";
  birthDate: string;
  address?: Array<{
    use?: string;
    line: string[];
    city: string;
    state: string;
    postalCode: string;
    country?: string;
  }>;
  telecom?: Array<{
    system?: string;
    value?: string;
    use?: string;
  }>;
  hospiceLocationId: string;
};

/**
 * Apply RLS context LOCAL to the current transaction.
 */
async function applyRlsContext(
  tx: { execute: (typeof db)["execute"] },
  user: UserCtx,
): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.current_user_id', ${user.id}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_location_id', ${user.locationId}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_role', ${user.role}, true)`);
}

/**
 * Convert Hospici patient row to FHIR Patient resource (US Core profile).
 */
async function toFhirPatient(row: typeof patients.$inferSelect): Promise<FhirPatient> {
  const encryptedData = row.data as string;
  const plaintext = await decryptPhi(encryptedData);
  const fhirData = JSON.parse(plaintext) as PatientFhirData;

  const patient: FhirPatient = {
    resourceType: "Patient",
    id: row.id,
    meta: {
      lastUpdated: row.updatedAt?.toISOString() ?? new Date().toISOString(),
      profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient"],
    },
    identifier: fhirData.identifier.map((id) => ({
      system: id.system,
      value: id.value,
    })),
    name: fhirData.name.map((n) => ({
      use: n.use as "usual" | "official" | "temp" | "nickname" | "old" | "maiden",
      family: n.family,
      given: n.given,
    })),
    gender: fhirData.gender ?? "unknown",
    birthDate: fhirData.birthDate,
  };

  if (fhirData.address?.length) {
    patient.address = fhirData.address.map((a) => ({
      use: a.use as "home" | "work" | "temp" | "old" | "billing",
      line: a.line,
      city: a.city,
      state: a.state,
      postalCode: a.postalCode,
      country: a.country ?? "US",
    }));
  }

  if (fhirData.telecom?.length) {
    patient.telecom = fhirData.telecom
      .filter((t): t is { system: string; value: string; use?: string } => !!t.value)
      .map((t) => ({
        system: t.system as "phone" | "fax" | "email" | "pager" | "url" | "sms" | "other",
        value: t.value,
        use: t.use as "home" | "work" | "temp" | "old" | "mobile",
      }));
  }

  // Managing organization references the hospice location
  patient.managingOrganization = {
    reference: `Organization/${row.locationId}`,
    display: "Hospice Location",
  };

  patient.active = row.dischargeDate == null;

  return patient;
}

/**
 * Convert Hospici pain assessment to FHIR Observation (US Core profile).
 */
function toFhirObservation(row: typeof painAssessments.$inferSelect): FhirObservation {
  const assessmentType = row.assessmentType;
  const assessmentData = (row.data ?? {}) as Record<string, unknown>;

  // Map assessment type to LOINC code
  const loincCodes: Record<string, { code: string; display: string }> = {
    NRS: { code: "72514-3", display: "Pain severity - 0-10 verbal numeric rating score" },
    WONG_BAKER: { code: "38214-3", display: "Pain severity Wong-Baker FACES scale" },
    FLACC: { code: "38216-8", display: "FLACC pain assessment scale" },
    PAINAD: { code: "72093-8", display: "Pain assessment in dementia scale" },
    ESAS: { code: "55423-8", display: "Edmonton Symptom Assessment Scale" },
  };

  const loinc = loincCodes[assessmentType] ?? {
    code: "38208-5",
    display: "Pain severity assessment",
  };

  const observation: FhirObservation = {
    resourceType: "Observation",
    id: row.id,
    meta: {
      lastUpdated:
        row.assessedAt?.toISOString() ?? row.createdAt?.toISOString() ?? new Date().toISOString(),
      profile: ["http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-survey"],
    },
    status: "final",
    category: [
      {
        coding: [
          {
            system: "http://terminology.hl7.org/CodeSystem/observation-category",
            code: "survey",
            display: "Survey",
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: "http://loinc.org",
          code: loinc.code,
          display: loinc.display,
        },
      ],
      text: loinc.display,
    },
    subject: {
      reference: `Patient/${row.patientId}`,
    },
    effectiveDateTime: row.assessedAt?.toISOString(),
    ...(row.createdAt && { issued: row.createdAt.toISOString() }),
    ...(row.assessedBy && {
      performer: [{ reference: `Practitioner/${row.assessedBy}` }],
    }),
  };

  // Add value based on assessment type
  if (row.totalScore != null) {
    observation.valueQuantity = {
      value: row.totalScore,
      unit: "{score}",
      system: "http://unitsofmeasure.org",
      code: "{score}",
    };
  }

  // Add ESAS-specific components if ESAS
  if (assessmentType === "ESAS" && assessmentData && typeof assessmentData === "object") {
    const esasData = assessmentData as {
      pain?: number;
      tiredness?: number;
      drowsiness?: number;
      nausea?: number;
      lackOfAppetite?: number;
      shortnessOfBreath?: number;
      depression?: number;
      anxiety?: number;
      wellbeing?: number;
    };

    const components = [];

    if (esasData.pain != null) {
      components.push({
        code: {
          coding: [
            {
              system: "http://loinc.org",
              code: "72514-3",
              display: "Pain severity",
            },
          ],
        },
        valueQuantity: {
          value: esasData.pain,
          unit: "{score}",
          system: "http://unitsofmeasure.org",
          code: "{score}",
        },
      });
    }

    if (esasData.shortnessOfBreath != null) {
      components.push({
        code: {
          coding: [
            {
              system: "http://loinc.org",
              code: "74793-5",
              display: "Shortness of breath severity",
            },
          ],
        },
        valueQuantity: {
          value: esasData.shortnessOfBreath,
          unit: "{score}",
          system: "http://unitsofmeasure.org",
          code: "{score}",
        },
      });
    }

    if (esasData.nausea != null) {
      components.push({
        code: {
          coding: [
            {
              system: "http://loinc.org",
              code: "72516-8",
              display: "Nausea severity",
            },
          ],
        },
        valueQuantity: {
          value: esasData.nausea,
          unit: "{score}",
          system: "http://unitsofmeasure.org",
          code: "{score}",
        },
      });
    }

    if (components.length > 0) {
      observation.component = components;
    }
  }

  return observation;
}

/**
 * Search patients using FHIR search parameters.
 * Returns a FHIR Bundle of Patient resources.
 */
export async function searchPatients(
  user: UserCtx,
  query: PatientSearchQuery,
): Promise<FhirBundle> {
  const page = query._page ?? 1;
  const pageSize = query._count ?? 20;
  const offset = (page - 1) * pageSize;

  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    // Build where conditions based on search params
    const conditions = [];

    if (query._id) {
      conditions.push(eq(patients.id, query._id));
    }

    // Note: name/given/family searches require decrypting PHI which is expensive
    // We filter at the application level after fetching

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countRows] = await Promise.all([
      tx.select().from(patients).where(whereClause).limit(pageSize).offset(offset),
      tx.select({ value: count() }).from(patients).where(whereClause),
    ]);

    const total = Number(countRows[0]?.value ?? 0);

    // Convert to FHIR Patients (decrypting PHI)
    const patientResources = await Promise.all(rows.map(toFhirPatient));

    // Apply name filters post-decryption if specified
    let filteredPatients = patientResources;
    if (query.name) {
      const nameLower = query.name.toLowerCase();
      filteredPatients = patientResources.filter((p) =>
        p.name.some(
          (n) =>
            n.family?.toLowerCase().includes(nameLower) ||
            n.given?.some((g) => g.toLowerCase().includes(nameLower)),
        ),
      );
    }
    if (query.given) {
      const givenLower = query.given.toLowerCase();
      filteredPatients = filteredPatients.filter((p) =>
        p.name.some((n) => n.given?.some((g) => g.toLowerCase().includes(givenLower))),
      );
    }
    if (query.family) {
      const familyLower = query.family.toLowerCase();
      filteredPatients = filteredPatients.filter((p) =>
        p.name.some((n) => n.family?.toLowerCase().includes(familyLower)),
      );
    }

    const bundle: FhirBundle = {
      resourceType: "Bundle",
      type: "searchset",
      total: total,
      entry: filteredPatients.map((p) => ({
        fullUrl: `${env.betterAuthUrl}/fhir/r4/Patient/${p.id}`,
        resource: p,
        search: { mode: "match" },
      })),
    };

    // Add pagination links if applicable
    if (page > 1 || filteredPatients.length === pageSize) {
      bundle.link = [];
      if (page > 1) {
        bundle.link.push({
          relation: "previous",
          url: `${env.betterAuthUrl}/fhir/r4/Patient?_page=${page - 1}&_count=${pageSize}`,
        });
      }
      if (filteredPatients.length === pageSize && total > page * pageSize) {
        bundle.link.push({
          relation: "next",
          url: `${env.betterAuthUrl}/fhir/r4/Patient?_page=${page + 1}&_count=${pageSize}`,
        });
      }
    }

    return bundle;
  });
}

/**
 * Get a single Patient by ID (FHIR format).
 */
export async function getPatient(id: string, user: UserCtx): Promise<FhirPatient | null> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const rows = await tx.select().from(patients).where(eq(patients.id, id));
    const row = rows[0];
    if (!row) return null;

    return toFhirPatient(row);
  });
}

/**
 * Search observations using FHIR search parameters.
 * Returns a FHIR Bundle of Observation resources.
 */
export async function searchObservations(
  user: UserCtx,
  query: ObservationSearchQuery,
): Promise<FhirBundle> {
  const page = query._page ?? 1;
  const pageSize = query._count ?? 20;
  const offset = (page - 1) * pageSize;

  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    // Build where conditions
    const conditions = [];

    if (query._id) {
      conditions.push(eq(painAssessments.id, query._id));
    }

    // patient or subject parameter filters by patient ID
    const patientId = query.patient ?? query.subject;
    if (patientId) {
      // Handle both "Patient/xxx" and "xxx" formats
      const cleanPatientId = patientId.startsWith("Patient/") ? patientId.slice(8) : patientId;
      conditions.push(eq(painAssessments.patientId, cleanPatientId));
    }

    // Date range filters
    if (query.date) {
      // Exact date match (simplified - matches date portion)
      conditions.push(sql`DATE(${painAssessments.assessedAt}) = ${query.date}`);
    }
    if (query["date-gt"]) {
      conditions.push(gte(painAssessments.assessedAt, new Date(query["date-gt"])));
    }
    if (query["date-lt"]) {
      conditions.push(lte(painAssessments.assessedAt, new Date(query["date-lt"])));
    }
    if (query["date-ge"]) {
      conditions.push(gte(painAssessments.assessedAt, new Date(query["date-ge"])));
    }
    if (query["date-le"]) {
      conditions.push(lte(painAssessments.assessedAt, new Date(query["date-le"])));
    }

    // Code filter (LOINC codes)
    if (query.code) {
      // Map LOINC codes to assessment types
      const loincToType: Record<string, string> = {
        "72514-3": "NRS",
        "38214-3": "WONG_BAKER",
        "38216-8": "FLACC",
        "72093-8": "PAINAD",
        "55423-8": "ESAS",
      };

      const codes = query.code.split(",").map((c) => c.trim());
      const types = codes.map((c) => loincToType[c]).filter((t): t is string => t !== undefined);

      if (types.length > 0) {
        // Build OR condition for assessment types
        const typeConditions = types.map((t) =>
          eq(
            painAssessments.assessmentType,
            t as "FLACC" | "PAINAD" | "NRS" | "WONG_BAKER" | "ESAS",
          ),
        );
        if (typeConditions.length === 1) {
          conditions.push(typeConditions[0]);
        } else {
          const orCond = or(...typeConditions);
          if (orCond) conditions.push(orCond);
        }
      }
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, countRows] = await Promise.all([
      tx.select().from(painAssessments).where(whereClause).limit(pageSize).offset(offset),
      tx.select({ value: count() }).from(painAssessments).where(whereClause),
    ]);

    const total = Number(countRows[0]?.value ?? 0);
    const observations = rows.map(toFhirObservation);

    const bundle: FhirBundle = {
      resourceType: "Bundle",
      type: "searchset",
      total: total,
      entry: observations.map((o) => ({
        fullUrl: `${env.betterAuthUrl}/fhir/r4/Observation/${o.id}`,
        resource: o,
        search: { mode: "match" },
      })),
    };

    // Add pagination links
    if (page > 1 || observations.length === pageSize) {
      bundle.link = [];
      if (page > 1) {
        bundle.link.push({
          relation: "previous",
          url: `${env.betterAuthUrl}/fhir/r4/Observation?_page=${page - 1}&_count=${pageSize}`,
        });
      }
      if (observations.length === pageSize && total > page * pageSize) {
        bundle.link.push({
          relation: "next",
          url: `${env.betterAuthUrl}/fhir/r4/Observation?_page=${page + 1}&_count=${pageSize}`,
        });
      }
    }

    return bundle;
  });
}

/**
 * Get a single Observation by ID (FHIR format).
 */
export async function getObservation(id: string, user: UserCtx): Promise<FhirObservation | null> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const rows = await tx.select().from(painAssessments).where(eq(painAssessments.id, id));
    const row = rows[0];
    if (!row) return null;

    return toFhirObservation(row);
  });
}

/**
 * FHIR Service namespace
 */
export const FhirService = {
  searchPatients,
  getPatient,
  searchObservations,
  getObservation,
};
