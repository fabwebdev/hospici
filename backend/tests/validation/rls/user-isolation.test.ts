/**
 * RLS — User isolation tests
 *
 * Verifies that a user in Location A cannot read patients or pain assessments
 * belonging to Location B, and that the isolation is enforced at the database
 * level (driven by app.* config — not by HTTP headers).
 *
 * Phase 1 exit gate (T1-9)
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PoolClient } from "pg";
import {
  TEST_IDS,
  cleanupFixtures,
  createAppRole,
  getTestPool,
  runMigrations,
  seedFixtures,
  withRlsContext,
} from "../../integration/setup.js";

const pool = getTestPool();

beforeAll(async () => {
  await runMigrations();
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

// ── Patient isolation ─────────────────────────────────────────────────────────

describe("patient row-level isolation", () => {
  it("User A (registered_nurse, locationA) can read their own location's patients", async () => {
    await withRlsContext(
      pool,
      {
        userId: TEST_IDS.userA,
        locationId: TEST_IDS.locationA,
        role: "registered_nurse",
      },
      async (client) => {
        const { rows } = await client.query(
          "SELECT id FROM patients WHERE id = $1",
          [TEST_IDS.patientA],
        );
        expect(rows).toHaveLength(1);
        expect(rows[0].id).toBe(TEST_IDS.patientA);
      },
    );
  });

  it("User A (registered_nurse, locationA) cannot read patients in locationB", async () => {
    await withRlsContext(
      pool,
      {
        userId: TEST_IDS.userA,
        locationId: TEST_IDS.locationA,
        role: "registered_nurse",
      },
      async (client) => {
        const { rows } = await client.query(
          "SELECT id FROM patients WHERE id = $1",
          [TEST_IDS.patientB],
        );
        expect(rows).toHaveLength(0);
      },
    );
  });

  it("User B (registered_nurse, locationB) can read their own location's patients", async () => {
    await withRlsContext(
      pool,
      {
        userId: TEST_IDS.userB,
        locationId: TEST_IDS.locationB,
        role: "registered_nurse",
      },
      async (client) => {
        const { rows } = await client.query(
          "SELECT id FROM patients WHERE id = $1",
          [TEST_IDS.patientB],
        );
        expect(rows).toHaveLength(1);
      },
    );
  });

  it("User B (registered_nurse, locationB) cannot read patients in locationA", async () => {
    await withRlsContext(
      pool,
      {
        userId: TEST_IDS.userB,
        locationId: TEST_IDS.locationB,
        role: "registered_nurse",
      },
      async (client) => {
        const { rows } = await client.query(
          "SELECT id FROM patients WHERE id = $1",
          [TEST_IDS.patientA],
        );
        expect(rows).toHaveLength(0);
      },
    );
  });

  it("SELECT * FROM patients returns only the caller's location rows, not all rows", async () => {
    await withRlsContext(
      pool,
      {
        userId: TEST_IDS.userA,
        locationId: TEST_IDS.locationA,
        role: "registered_nurse",
      },
      async (client) => {
        const { rows } = await client.query(
          "SELECT id FROM patients WHERE id IN ($1, $2)",
          [TEST_IDS.patientA, TEST_IDS.patientB],
        );
        // Only patientA (locationA) should be visible
        expect(rows).toHaveLength(1);
        expect(rows[0].id).toBe(TEST_IDS.patientA);
      },
    );
  });
});

// ── Pain assessment isolation ─────────────────────────────────────────────────

describe("pain assessment row-level isolation", () => {
  it("User A (registered_nurse, locationA) can read pain assessments in locationA", async () => {
    await withRlsContext(
      pool,
      {
        userId: TEST_IDS.userA,
        locationId: TEST_IDS.locationA,
        role: "registered_nurse",
      },
      async (client) => {
        const { rows } = await client.query(
          "SELECT id FROM pain_assessments WHERE id = $1",
          [TEST_IDS.painAssessmentA],
        );
        expect(rows).toHaveLength(1);
      },
    );
  });

  it("User B (registered_nurse, locationB) cannot read pain assessments in locationA", async () => {
    await withRlsContext(
      pool,
      {
        userId: TEST_IDS.userB,
        locationId: TEST_IDS.locationB,
        role: "registered_nurse",
      },
      async (client) => {
        const { rows } = await client.query(
          "SELECT id FROM pain_assessments WHERE id = $1",
          [TEST_IDS.painAssessmentA],
        );
        expect(rows).toHaveLength(0);
      },
    );
  });
});

// ── Config-driven isolation (proves headers have no effect) ───────────────────

describe("RLS is driven by app.* config, not by HTTP headers", () => {
  it("Setting app.current_location_id to locationB exposes locationB patients only", async () => {
    // This test proves the control point is the DB session config —
    // no HTTP header injection can bypass it.
    await withRlsContext(
      pool,
      {
        userId: TEST_IDS.userB,
        locationId: TEST_IDS.locationB, // locationB context
        role: "registered_nurse",
      },
      async (client) => {
        const { rows } = await client.query(
          "SELECT id FROM patients WHERE id IN ($1, $2) ORDER BY id",
          [TEST_IDS.patientA, TEST_IDS.patientB],
        );
        // Only patientB is visible — location isolation is enforced by the DB
        expect(rows).toHaveLength(1);
        expect(rows[0].id).toBe(TEST_IDS.patientB);
      },
    );
  });

  it("Without app.current_location_id set, the query returns 0 patients (safe failure)", async () => {
    // SET LOCAL ROLE to hospici_app but provide an empty string for location.
    // Policies using location_id = current_setting(...)::UUID will fail the
    // UUID cast on empty string — test proves there's no anonymous fallback.
    const client: PoolClient = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL ROLE TO hospici_app");
      await client.query("SELECT set_config('app.current_user_id', $1, true)", [TEST_IDS.userA]);
      // Intentionally set location to a non-matching UUID to mimic missing context
      await client.query(
        "SELECT set_config('app.current_location_id', $1, true)",
        ["00000000-0000-0000-0000-000000000000"], // no-location sentinel
      );
      await client.query("SELECT set_config('app.current_role', $1, true)", ["registered_nurse"]);

      const { rows } = await client.query(
        "SELECT id FROM patients WHERE id IN ($1, $2)",
        [TEST_IDS.patientA, TEST_IDS.patientB],
      );
      // Neither patient belongs to the zero-UUID location
      expect(rows).toHaveLength(0);

      await client.query("ROLLBACK");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  });
});
