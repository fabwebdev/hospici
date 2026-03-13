/**
 * RLS — Role-based access tests
 *
 * Verifies that each ABAC role sees only what it is permitted to see:
 *  - billing_specialist can read patients but NOT pain assessments
 *  - volunteer cannot insert patients
 *  - intake_coordinator can insert patients
 *  - registered_nurse can read and insert pain assessments
 *
 * Phase 1 exit gate (T1-9)
 */

import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  TEST_IDS,
  cleanupFixtures,
  createAppRole,
  getTestPool,
  seedFixtures,
  withRlsContext,
} from "../../integration/setup.js";

const pool = getTestPool();

beforeAll(async () => {
  const client: PoolClient = await pool.connect();
  try {
    await createAppRole(client);
    await seedFixtures(client);
  } finally {
    client.release();
  }
}, 30_000);

afterAll(async () => {
  const client: PoolClient = await pool.connect();
  try {
    await cleanupFixtures(client);
  } finally {
    client.release();
  }
});

// ── Billing specialist ────────────────────────────────────────────────────────

describe("billing_specialist role", () => {
  it("can read patients in their location (billing has patient SELECT access)", async () => {
    await withRlsContext(
      pool,
      {
        userId: TEST_IDS.userBilling,
        locationId: TEST_IDS.locationA,
        role: "billing_specialist",
      },
      async (client) => {
        const { rows } = await client.query("SELECT id FROM patients WHERE id = $1", [
          TEST_IDS.patientA,
        ]);
        expect(rows).toHaveLength(1);
      },
    );
  });

  it("CANNOT read pain assessments (explicit billing deny policy)", async () => {
    await withRlsContext(
      pool,
      {
        userId: TEST_IDS.userBilling,
        locationId: TEST_IDS.locationA,
        role: "billing_specialist",
      },
      async (client) => {
        const { rows } = await client.query("SELECT id FROM pain_assessments WHERE id = $1", [
          TEST_IDS.painAssessmentA,
        ]);
        // pain_assessments_billing_deny policy blocks billing from reading clinical notes
        expect(rows).toHaveLength(0);
      },
    );
  });

  it("CANNOT insert patients (billing is not in patients_insert allowed roles)", async () => {
    await withRlsContext(
      pool,
      {
        userId: TEST_IDS.userBilling,
        locationId: TEST_IDS.locationA,
        role: "billing_specialist",
      },
      async (client) => {
        const insertPromise = client.query(
          `INSERT INTO patients (id, location_id, data)
           VALUES (gen_random_uuid(), $1, '{"resourceType":"Patient"}')`,
          [TEST_IDS.locationA],
        );
        // patients_insert policy only allows intake_coordinator, admin, supervisory
        await expect(insertPromise).rejects.toThrow();
      },
    );
  });
});

// ── Volunteer role ────────────────────────────────────────────────────────────

describe("volunteer role", () => {
  it("CANNOT read patients (volunteer is not in any patients_select allowed group)", async () => {
    await withRlsContext(
      pool,
      {
        userId: TEST_IDS.userVolunteer,
        locationId: TEST_IDS.locationA,
        role: "volunteer",
      },
      async (client) => {
        const { rows } = await client.query("SELECT id FROM patients WHERE id = $1", [
          TEST_IDS.patientA,
        ]);
        expect(rows).toHaveLength(0);
      },
    );
  });

  it("CANNOT insert patients", async () => {
    await withRlsContext(
      pool,
      {
        userId: TEST_IDS.userVolunteer,
        locationId: TEST_IDS.locationA,
        role: "volunteer",
      },
      async (client) => {
        const insertPromise = client.query(
          `INSERT INTO patients (id, location_id, data)
           VALUES (gen_random_uuid(), $1, '{"resourceType":"Patient"}')`,
          [TEST_IDS.locationA],
        );
        await expect(insertPromise).rejects.toThrow();
      },
    );
  });
});

// ── intake_coordinator role ───────────────────────────────────────────────────

describe("intake_coordinator role", () => {
  it("CAN read patients in their location", async () => {
    await withRlsContext(
      pool,
      {
        userId: TEST_IDS.userIntake,
        locationId: TEST_IDS.locationA,
        role: "intake_coordinator",
      },
      async (client) => {
        const { rows } = await client.query("SELECT id FROM patients WHERE id = $1", [
          TEST_IDS.patientA,
        ]);
        expect(rows).toHaveLength(1);
      },
    );
  });

  it("CAN insert a patient in their location", async () => {
    await withRlsContext(
      pool,
      {
        userId: TEST_IDS.userIntake,
        locationId: TEST_IDS.locationA,
        role: "intake_coordinator",
      },
      async (client) => {
        // Should not throw — intake_coordinator is explicitly listed in patients_insert policy
        await expect(
          client.query(
            `INSERT INTO patients (id, location_id, data)
             VALUES (gen_random_uuid(), $1, '{"resourceType":"Patient","name":[{"text":"New Intake Patient"}]}')`,
            [TEST_IDS.locationA],
          ),
        ).resolves.toBeDefined();
        // Note: transaction is rolled back by withRlsContext — no cleanup needed
      },
    );
  });

  it("CANNOT insert a patient in a different location", async () => {
    await withRlsContext(
      pool,
      {
        userId: TEST_IDS.userIntake,
        locationId: TEST_IDS.locationA, // context is locationA
        role: "intake_coordinator",
      },
      async (client) => {
        const insertPromise = client.query(
          `INSERT INTO patients (id, location_id, data)
           VALUES (gen_random_uuid(), $1, '{"resourceType":"Patient"}')`,
          [TEST_IDS.locationB], // trying to insert into locationB
        );
        // patients_insert requires location_id = app.current_location_id
        await expect(insertPromise).rejects.toThrow();
      },
    );
  });
});

// ── registered_nurse role ─────────────────────────────────────────────────────

describe("registered_nurse role", () => {
  it("CAN read pain assessments in their location", async () => {
    await withRlsContext(
      pool,
      {
        userId: TEST_IDS.userA,
        locationId: TEST_IDS.locationA,
        role: "registered_nurse",
      },
      async (client) => {
        const { rows } = await client.query("SELECT id FROM pain_assessments WHERE id = $1", [
          TEST_IDS.painAssessmentA,
        ]);
        expect(rows).toHaveLength(1);
      },
    );
  });

  it("CAN insert a pain assessment when assessed_by matches current user", async () => {
    await withRlsContext(
      pool,
      {
        userId: TEST_IDS.userA,
        locationId: TEST_IDS.locationA,
        role: "registered_nurse",
      },
      async (client) => {
        await expect(
          client.query(
            `INSERT INTO pain_assessments
               (id, patient_id, location_id, assessment_type, assessed_at, assessed_by, total_score, data)
             VALUES
               (gen_random_uuid(), $1, $2, 'NRS', NOW(), $3, 5,
                '{"score":5,"description":"rls insert test"}')`,
            [TEST_IDS.patientA, TEST_IDS.locationA, TEST_IDS.userA],
          ),
        ).resolves.toBeDefined();
      },
    );
  });

  it("CANNOT insert a pain assessment when assessed_by does not match current user", async () => {
    await withRlsContext(
      pool,
      {
        userId: TEST_IDS.userA,
        locationId: TEST_IDS.locationA,
        role: "registered_nurse",
      },
      async (client) => {
        const insertPromise = client.query(
          `INSERT INTO pain_assessments
             (id, patient_id, location_id, assessment_type, assessed_at, assessed_by, total_score, data)
           VALUES
             (gen_random_uuid(), $1, $2, 'NRS', NOW(), $3, 5,
              '{"score":5,"description":"rls insert mismatch"}')`,
          [
            TEST_IDS.patientA,
            TEST_IDS.locationA,
            TEST_IDS.userB, // different user — violates assessed_by = current_user_id check
          ],
        );
        await expect(insertPromise).rejects.toThrow();
      },
    );
  });
});
