/**
 * Integration — PatientService CRUD (T2-1)
 *
 * Tests:
 *  1. create() — inserts patient, encrypts PHI, emits audit log
 *  2. getById() — retrieves and decrypts patient
 *  3. patch() — merges partial update, re-encrypts, audits
 *  4. list() — paginated listing with careModel filter
 *
 * Runs against the real test database (DATABASE_URL_TEST / DATABASE_URL).
 * PHI is encrypted via pgcrypto; audit log is verified via raw pg query.
 *
 * Done-when criteria (T2-1):
 *  ✓ POST creates a patient
 *  ✓ GET /:id returns decrypted fields
 *  ✓ audit_logs row exists
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import {
  TEST_IDS,
  cleanupFixtures,
  createAppRole,
  getTestPool,
  seedFixtures,
} from "./setup.js";
import { PatientService } from "@/contexts/clinical/services/patient.service.js";
import type { CreatePatientBody } from "@/contexts/clinical/schemas/patient.schema.js";
import type { FastifyRequest } from "fastify";

const pool = getTestPool();

/** Minimal user context — registered nurse at locationA */
const userA: NonNullable<FastifyRequest["user"]> = {
  id: TEST_IDS.userA,
  role: "registered_nurse",
  locationId: TEST_IDS.locationA,
  locationIds: [TEST_IDS.locationA],
  permissions: [],
  breakGlass: false,
};

const sampleBody: CreatePatientBody = {
  identifier: [{ system: "http://hospici.com/mrn", value: "INT-001" }],
  name: [{ family: "Integration", given: ["Test"] }],
  birthDate: "1950-03-22",
  hospiceLocationId: TEST_IDS.locationA,
  admissionDate: "2026-01-15",
  careModel: "HOSPICE",
};

// Track IDs created during tests so we can clean up
const createdPatientIds: string[] = [];

beforeAll(async () => {
  // globalSetup.ts already ran migrations once — only seed fixtures here
  const client: PoolClient = await pool.connect();
  try {
    await createAppRole(client);
    await seedFixtures(client);
  } finally {
    client.release();
  }
}, 30_000);

afterAll(async () => {
  if (createdPatientIds.length > 0) {
    const client: PoolClient = await pool.connect();
    try {
      await client.query(
        `DELETE FROM patients WHERE id = ANY($1::uuid[])`,
        [createdPatientIds],
      );
    } finally {
      client.release();
    }
  }
  const client: PoolClient = await pool.connect();
  try {
    await cleanupFixtures(client);
  } finally {
    client.release();
  }
}, 15_000);

describe("PatientService.create()", () => {
  it("creates a patient and returns decrypted fields", async () => {
    const patient = await PatientService.create(sampleBody, userA);

    expect(patient.id).toBeDefined();
    expect(patient.resourceType).toBe("Patient");
    expect(patient.name[0]?.family).toBe("Integration");
    expect(patient.name[0]?.given[0]).toBe("Test");
    expect(patient.birthDate).toBe("1950-03-22");
    expect(patient.careModel).toBe("HOSPICE");
    expect(patient.admissionDate).toBe("2026-01-15");

    createdPatientIds.push(patient.id);
  });

  it("stores PHI encrypted (raw JSONB is not plaintext)", async () => {
    const patient = await PatientService.create(sampleBody, userA);
    createdPatientIds.push(patient.id);

    const { rows } = await pool.query<{ data: string }>(
      `SELECT data::text AS data FROM patients WHERE id = $1`,
      [patient.id],
    );
    expect(rows).toHaveLength(1);

    // Stored value should be an encrypted blob, not plaintext
    const raw = rows[0]?.data ?? "";
    expect(raw).not.toContain("Integration");
    expect(raw).not.toContain("1950-03-22");
  });

  it("writes an audit log entry on create", async () => {
    const patient = await PatientService.create(sampleBody, userA);
    createdPatientIds.push(patient.id);

    const { rows } = await pool.query<{ action: string; resource_type: string; user_id: string }>(
      `SELECT action, resource_type, user_id
         FROM audit_logs
        WHERE resource_id = $1::uuid AND action = 'create'
        ORDER BY timestamp DESC
        LIMIT 1`,
      [patient.id],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("create");
    expect(rows[0]?.resource_type).toBe("patient");
    expect(rows[0]?.user_id).toBe(TEST_IDS.userA);
  });

  it("sets locationId from user context", async () => {
    const patient = await PatientService.create(sampleBody, userA);
    createdPatientIds.push(patient.id);

    const { rows } = await pool.query<{ location_id: string }>(
      `SELECT location_id FROM patients WHERE id = $1`,
      [patient.id],
    );
    expect(rows[0]?.location_id).toBe(TEST_IDS.locationA);
  });
});

describe("PatientService.getById()", () => {
  let patientId: string;

  beforeAll(async () => {
    const p = await PatientService.create(sampleBody, userA);
    patientId = p.id;
    createdPatientIds.push(patientId);
  });

  it("returns decrypted patient by ID", async () => {
    const patient = await PatientService.getById(patientId, userA);

    expect(patient).not.toBeNull();
    expect(patient?.id).toBe(patientId);
    expect(patient?.name[0]?.family).toBe("Integration");
    expect(patient?.birthDate).toBe("1950-03-22");
  });

  it("returns null for non-existent ID", async () => {
    const result = await PatientService.getById(
      "00000000-0000-0000-0000-000000000000",
      userA,
    );
    expect(result).toBeNull();
  });

  it("writes a view audit log on getById", async () => {
    await PatientService.getById(patientId, userA);

    const { rows } = await pool.query<{ action: string }>(
      `SELECT action FROM audit_logs
        WHERE resource_id = $1::uuid AND action = 'view'
        ORDER BY timestamp DESC
        LIMIT 1`,
      [patientId],
    );
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0]?.action).toBe("view");
  });
});

describe("PatientService.patch()", () => {
  let patientId: string;

  beforeAll(async () => {
    const p = await PatientService.create(sampleBody, userA);
    patientId = p.id;
    createdPatientIds.push(patientId);
  });

  it("merges patch fields without overwriting unchanged fields", async () => {
    const updated = await PatientService.patch(
      patientId,
      { name: [{ family: "Updated", given: ["Name"] }] },
      userA,
    );

    expect(updated).not.toBeNull();
    expect(updated?.name[0]?.family).toBe("Updated");
    // birthDate unchanged
    expect(updated?.birthDate).toBe("1950-03-22");
  });

  it("updates promoted careModel column", async () => {
    const updated = await PatientService.patch(patientId, { careModel: "PALLIATIVE" }, userA);
    expect(updated?.careModel).toBe("PALLIATIVE");
  });

  it("returns null for non-existent patient", async () => {
    const result = await PatientService.patch(
      "00000000-0000-0000-0000-000000000000",
      { careModel: "HOSPICE" },
      userA,
    );
    expect(result).toBeNull();
  });

  it("writes an update audit log", async () => {
    await PatientService.patch(patientId, { dischargeDate: "2026-06-01" }, userA);

    const { rows } = await pool.query<{ action: string }>(
      `SELECT action FROM audit_logs
        WHERE resource_id = $1::uuid AND action = 'update'
        ORDER BY timestamp DESC
        LIMIT 1`,
      [patientId],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.action).toBe("update");
  });
});

describe("PatientService.list()", () => {
  beforeAll(async () => {
    // Ensure at least one PALLIATIVE patient exists for filter test
    const p = await PatientService.create({ ...sampleBody, careModel: "PALLIATIVE" }, userA);
    createdPatientIds.push(p.id);
  });

  it("returns patients for the caller's location", async () => {
    const result = await PatientService.list(userA, { page: 1, limit: 100 });
    expect(result.patients.length).toBeGreaterThanOrEqual(1);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(100);
    expect(result.total).toBeGreaterThanOrEqual(1);
  });

  it("filters by careModel", async () => {
    const result = await PatientService.list(userA, { careModel: "PALLIATIVE", limit: 100 });
    expect(result.patients.every((p) => p.careModel === "PALLIATIVE")).toBe(true);
  });

  it("paginates correctly when multiple patients exist", async () => {
    const all = await PatientService.list(userA, { page: 1, limit: 100 });
    if (all.total >= 2) {
      const page1 = await PatientService.list(userA, { page: 1, limit: 1 });
      const page2 = await PatientService.list(userA, { page: 2, limit: 1 });

      expect(page1.patients).toHaveLength(1);
      expect(page2.patients).toHaveLength(1);
      expect(page1.patients[0]?.id).not.toBe(page2.patients[0]?.id);
    }
  });
});
