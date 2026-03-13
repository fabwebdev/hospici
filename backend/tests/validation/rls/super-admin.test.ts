/**
 * RLS — super_admin bypass tests
 *
 * Verifies:
 *  1. super_admin can perform operations that are restricted for other roles
 *     (e.g., DELETE patients).
 *  2. super_admin STILL cannot read data in a different location — the
 *     location filter in every policy is never bypassed by role alone.
 *  3. super_admin can read audit_logs for their location.
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

// ── super_admin privileges ────────────────────────────────────────────────────

describe("super_admin can perform privileged operations", () => {
  it("can read patients in their location", async () => {
    await withRlsContext(
      pool,
      {
        userId: TEST_IDS.userSuperAdmin,
        locationId: TEST_IDS.locationA,
        role: "super_admin",
      },
      async (client) => {
        const { rows } = await client.query("SELECT id FROM patients WHERE id = $1", [
          TEST_IDS.patientA,
        ]);
        expect(rows).toHaveLength(1);
      },
    );
  });

  it("can DELETE a patient (patients_delete allows ADMINISTRATIVE group)", async () => {
    await withRlsContext(
      pool,
      {
        userId: TEST_IDS.userSuperAdmin,
        locationId: TEST_IDS.locationA,
        role: "super_admin",
      },
      async (client) => {
        // Use a temp insert so we don't delete the fixture patient permanently.
        // The entire withRlsContext is wrapped in a transaction that gets rolled back.
        await client.query(
          `INSERT INTO patients (id, location_id, data)
           VALUES ($1, $2, '{"resourceType":"Patient","name":[{"text":"Temp for delete test"}]}')`,
          ["a9a9a9a9-9999-9999-9999-999999999999", TEST_IDS.locationA],
        );

        const deleteResult = await client.query("DELETE FROM patients WHERE id = $1 RETURNING id", [
          "a9a9a9a9-9999-9999-9999-999999999999",
        ]);
        expect(deleteResult.rows).toHaveLength(1);
      },
    );
  });

  it("can insert a patient (super_admin is in ADMINISTRATIVE group)", async () => {
    await withRlsContext(
      pool,
      {
        userId: TEST_IDS.userSuperAdmin,
        locationId: TEST_IDS.locationA,
        role: "super_admin",
      },
      async (client) => {
        await expect(
          client.query(
            `INSERT INTO patients (id, location_id, data)
             VALUES (gen_random_uuid(), $1, '{"resourceType":"Patient"}')`,
            [TEST_IDS.locationA],
          ),
        ).resolves.toBeDefined();
      },
    );
  });
});

// ── Location filter still applies to super_admin ─────────────────────────────

describe("super_admin location filter", () => {
  it("CANNOT read patients in a different location even with super_admin role", async () => {
    // super_admin context is set to locationA — locationB patients must not be visible.
    // This ensures location isolation is never bypassed by role elevation alone.
    await withRlsContext(
      pool,
      {
        userId: TEST_IDS.userSuperAdmin,
        locationId: TEST_IDS.locationA, // super_admin scoped to locationA
        role: "super_admin",
      },
      async (client) => {
        const { rows } = await client.query(
          "SELECT id FROM patients WHERE id = $1",
          [TEST_IDS.patientB], // patientB is in locationB
        );
        expect(rows).toHaveLength(0);
      },
    );
  });

  it("CAN read patients in locationB when context is set to locationB", async () => {
    // super_admin has locationIds: [locationA, locationB] — the middleware would
    // set the current_location_id based on the requested scope.
    await withRlsContext(
      pool,
      {
        userId: TEST_IDS.userSuperAdmin,
        locationId: TEST_IDS.locationB,
        role: "super_admin",
      },
      async (client) => {
        const { rows } = await client.query("SELECT id FROM patients WHERE id = $1", [
          TEST_IDS.patientB,
        ]);
        expect(rows).toHaveLength(1);
      },
    );
  });
});

// ── Audit log access ──────────────────────────────────────────────────────────

describe("super_admin audit log access", () => {
  it("can INSERT into audit_logs (audit_logs_insert allows true)", async () => {
    await withRlsContext(
      pool,
      {
        userId: TEST_IDS.userSuperAdmin,
        locationId: TEST_IDS.locationA,
        role: "super_admin",
      },
      async (client) => {
        await expect(
          client.query(
            `INSERT INTO audit_logs
               (user_id, user_role, location_id, action, resource_type, resource_id)
             VALUES ($1, 'super_admin', $2, 'READ', 'patients', $3)`,
            [TEST_IDS.userSuperAdmin, TEST_IDS.locationA, TEST_IDS.patientA],
          ),
        ).resolves.toBeDefined();
        // Transaction is rolled back — no permanent audit record
      },
    );
  });

  it("can SELECT audit_logs for their location (ADMINISTRATIVE group allowed)", async () => {
    // Insert a real audit row first as superuser (bypass RLS), then verify super_admin can read it
    const setup: PoolClient = await pool.connect();
    let auditId: string | undefined;
    try {
      const result = await setup.query(
        `INSERT INTO audit_logs
           (user_id, user_role, location_id, action, resource_type, resource_id)
         VALUES ($1, 'super_admin', $2, 'READ', 'patients', $3)
         RETURNING id`,
        [TEST_IDS.userSuperAdmin, TEST_IDS.locationA, TEST_IDS.patientA],
      );
      auditId = result.rows[0].id as string;
    } finally {
      setup.release();
    }

    try {
      await withRlsContext(
        pool,
        {
          userId: TEST_IDS.userSuperAdmin,
          locationId: TEST_IDS.locationA,
          role: "super_admin",
        },
        async (client) => {
          const { rows } = await client.query("SELECT id FROM audit_logs WHERE id = $1", [auditId]);
          expect(rows).toHaveLength(1);
        },
      );
    } finally {
      // Clean up the audit row we inserted outside the RLS transaction
      if (auditId) {
        const cleanup: PoolClient = await pool.connect();
        try {
          await cleanup.query("DELETE FROM audit_logs WHERE id = $1", [auditId]);
        } finally {
          cleanup.release();
        }
      }
    }
  });

  it("registered_nurse CANNOT read audit_logs from a different location", async () => {
    // Insert audit log in locationB as superuser
    const setup: PoolClient = await pool.connect();
    let auditId: string | undefined;
    try {
      const result = await setup.query(
        `INSERT INTO audit_logs
           (user_id, user_role, location_id, action, resource_type, resource_id)
         VALUES ($1, 'registered_nurse', $2, 'READ', 'patients', $3)
         RETURNING id`,
        [TEST_IDS.userB, TEST_IDS.locationB, TEST_IDS.patientB],
      );
      auditId = result.rows[0].id as string;
    } finally {
      setup.release();
    }

    try {
      // User A is in locationA — should not see locationB audit logs
      await withRlsContext(
        pool,
        {
          userId: TEST_IDS.userA,
          locationId: TEST_IDS.locationA,
          role: "registered_nurse",
        },
        async (client) => {
          const { rows } = await client.query("SELECT id FROM audit_logs WHERE id = $1", [auditId]);
          expect(rows).toHaveLength(0);
        },
      );
    } finally {
      if (auditId) {
        const cleanup: PoolClient = await pool.connect();
        try {
          await cleanup.query("DELETE FROM audit_logs WHERE id = $1", [auditId]);
        } finally {
          cleanup.release();
        }
      }
    }
  });
});
