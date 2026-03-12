/**
 * Integration / RLS test setup helpers.
 *
 * Provides:
 * - DB connection to the test database
 * - Migration runner
 * - Non-superuser role creation for RLS enforcement
 * - Predictable fixture data (static UUIDs)
 * - `withRlsContext()` – runs a block inside a transaction with a non-superuser
 *   role and the three app.* config settings that drive every RLS policy.
 *
 * Setup order in each test file:
 *   beforeAll → runMigrations → createAppRole → seedFixtures
 *   afterAll  → cleanupFixtures → (pool.end() if needed)
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdir, readFile } from "node:fs/promises";
import { Pool, type PoolClient } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

const MIGRATIONS_DIR = join(__dirname, "../../database/migrations/drizzle");

// ── Test database URL ─────────────────────────────────────────────────────────

function getTestDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL_TEST or DATABASE_URL must be set for integration tests",
    );
  }
  return url;
}

// ── Shared pool (lazy) ────────────────────────────────────────────────────────

let _pool: Pool | null = null;

export function getTestPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      connectionString: getTestDatabaseUrl(),
      max: 5,
    });
  }
  return _pool;
}

export async function closeTestPool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

// ── Static fixture IDs (predictable, no collisions across test runs) ──────────

export const TEST_IDS = {
  locationA: "a1a1a1a1-0000-0000-0000-000000000001",
  locationB: "b2b2b2b2-0000-0000-0000-000000000002",
  userA: "a1a1a1a1-0000-0000-aaaa-000000000001", // registered_nurse @ locationA
  userB: "b2b2b2b2-0000-0000-bbbb-000000000002", // registered_nurse @ locationB
  userBilling: "c3c3c3c3-0000-0000-cccc-000000000003", // billing_specialist @ locationA
  userVolunteer: "d4d4d4d4-0000-0000-dddd-000000000004", // volunteer @ locationA
  userSuperAdmin: "e5e5e5e5-0000-0000-eeee-000000000005", // super_admin @ locationA+B
  userIntake: "f6f6f6f6-0000-0000-ffff-000000000006", // intake_coordinator @ locationA
  patientA: "a1a1a1a1-0000-0000-1111-000000000001", // belongs to locationA
  patientB: "b2b2b2b2-0000-0000-2222-000000000002", // belongs to locationB
  painAssessmentA: "a1a1a1a1-0000-0000-3333-000000000001",
  noeA: "a1a1a1a1-0000-0000-4444-000000000001",
  noeFriday: "b2b2b2b2-0000-0000-4444-000000000002",
  benefitPeriodA: "a1a1a1a1-0000-0000-5555-000000000001",
} as const;

// ── Migrations ────────────────────────────────────────────────────────────────

/**
 * Runs all *.sql migration files in alphabetical order against the test DB.
 * Idempotent — all migrations use IF NOT EXISTS / IF EXISTS guards.
 */
export async function runMigrations(): Promise<void> {
  const pool = new Pool({ connectionString: getTestDatabaseUrl() });
  try {
    const files = (await readdir(MIGRATIONS_DIR))
      .filter((f) => f.endsWith(".sql"))
      .sort();

    for (const file of files) {
      const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8");
      await pool.query(sql);
    }
  } finally {
    await pool.end();
  }
}

// ── RLS test role ─────────────────────────────────────────────────────────────

/**
 * Creates the `hospici_app` role (non-superuser, no BYPASSRLS) and grants it
 * the privileges needed to run DML against all public tables.
 *
 * Must be called AFTER migrations (tables must exist before granting).
 * Idempotent — safe to call multiple times.
 */
export async function createAppRole(client: PoolClient): Promise<void> {
  // Create non-superuser role used for RLS enforcement in tests
  await client.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'hospici_app') THEN
        CREATE ROLE hospici_app NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE;
      END IF;
    END$$
  `);

  // Grant DML on all public tables (created by migrations)
  await client.query(`
    GRANT SELECT, INSERT, UPDATE, DELETE
      ON ALL TABLES IN SCHEMA public
      TO hospici_app
  `);

  // Grant execute on RLS helper functions (SECURITY DEFINER, but explicit is safe)
  await client.query(`
    GRANT EXECUTE
      ON FUNCTION current_role_in_group(TEXT), role_has_clinical_access(TEXT)
      TO hospici_app
  `);
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

/**
 * Seeds the minimal fixture set needed by RLS and integration tests.
 * Uses ON CONFLICT DO NOTHING so repeated beforeAll calls are safe.
 * Inserts run as the superuser connection (RLS bypassed).
 */
export async function seedFixtures(client: PoolClient): Promise<void> {
  // Locations
  await client.query(
    `INSERT INTO locations (id, name, npi, address)
     VALUES
       ($1, 'Test Location Alpha', '1234567890', '{"city":"Portland"}'),
       ($2, 'Test Location Beta',  '0987654321', '{"city":"Salem"}')
     ON CONFLICT (id) DO NOTHING`,
    [TEST_IDS.locationA, TEST_IDS.locationB],
  );

  // Users  (abac_attributes drives role + locationIds in RLS policies)
  await client.query(
    `INSERT INTO users (id, name, email, email_verified, abac_attributes, is_active, two_factor_enabled)
     VALUES
       ($1, 'Alice RN',      'alice@test.hospici',   true,
            $7, true, true),
       ($2, 'Bob RN',        'bob@test.hospici',     true,
            $8, true, true),
       ($3, 'Carol Billing', 'carol@test.hospici',   true,
            $9, true, true),
       ($4, 'Dave Vol',      'dave@test.hospici',    true,
            $10, true, true),
       ($5, 'Eve Admin',     'eve@test.hospici',     true,
            $11, true, true),
       ($6, 'Frank Intake',  'frank@test.hospici',   true,
            $12, true, true)
     ON CONFLICT (id) DO NOTHING`,
    [
      TEST_IDS.userA,
      TEST_IDS.userB,
      TEST_IDS.userBilling,
      TEST_IDS.userVolunteer,
      TEST_IDS.userSuperAdmin,
      TEST_IDS.userIntake,
      JSON.stringify({ locationIds: [TEST_IDS.locationA], role: "registered_nurse", permissions: [] }),
      JSON.stringify({ locationIds: [TEST_IDS.locationB], role: "registered_nurse", permissions: [] }),
      JSON.stringify({ locationIds: [TEST_IDS.locationA], role: "billing_specialist", permissions: [] }),
      JSON.stringify({ locationIds: [TEST_IDS.locationA], role: "volunteer", permissions: [] }),
      JSON.stringify({ locationIds: [TEST_IDS.locationA, TEST_IDS.locationB], role: "super_admin", permissions: [] }),
      JSON.stringify({ locationIds: [TEST_IDS.locationA], role: "intake_coordinator", permissions: [] }),
    ],
  );

  // Patients
  await client.query(
    `INSERT INTO patients (id, location_id, data)
     VALUES
       ($1, $3, '{"resourceType":"Patient","name":[{"text":"Patient Alpha"}]}'),
       ($2, $4, '{"resourceType":"Patient","name":[{"text":"Patient Beta"}]}')
     ON CONFLICT (id) DO NOTHING`,
    [TEST_IDS.patientA, TEST_IDS.patientB, TEST_IDS.locationA, TEST_IDS.locationB],
  );

  // Pain assessment (locationA, assessed by userA)
  await client.query(
    `INSERT INTO pain_assessments
       (id, patient_id, location_id, assessment_type, assessed_at, assessed_by, total_score, data)
     VALUES
       ($1, $2, $3, 'numeric', NOW(), $4, 7,
        '{"scale":"numeric","notes":"test assessment"}')
     ON CONFLICT (id) DO NOTHING`,
    [TEST_IDS.painAssessmentA, TEST_IDS.patientA, TEST_IDS.locationA, TEST_IDS.userA],
  );
}

/**
 * Removes all fixture rows created by seedFixtures.
 * Deletes in reverse FK dependency order.
 */
export async function cleanupFixtures(client: PoolClient): Promise<void> {
  await client.query(
    `DELETE FROM notice_of_election WHERE id IN ($1, $2)`,
    [TEST_IDS.noeA, TEST_IDS.noeFriday],
  );
  await client.query(
    `DELETE FROM pain_assessments WHERE id = $1`,
    [TEST_IDS.painAssessmentA],
  );
  await client.query(
    `DELETE FROM patients WHERE id IN ($1, $2)`,
    [TEST_IDS.patientA, TEST_IDS.patientB],
  );
  await client.query(
    `DELETE FROM users WHERE id IN ($1, $2, $3, $4, $5, $6)`,
    [
      TEST_IDS.userA,
      TEST_IDS.userB,
      TEST_IDS.userBilling,
      TEST_IDS.userVolunteer,
      TEST_IDS.userSuperAdmin,
      TEST_IDS.userIntake,
    ],
  );
  await client.query(
    `DELETE FROM locations WHERE id IN ($1, $2)`,
    [TEST_IDS.locationA, TEST_IDS.locationB],
  );
}

// ── RLS context helper ────────────────────────────────────────────────────────

export type RlsContext = {
  userId: string;
  locationId: string;
  role: string;
};

/**
 * Acquires a pooled connection, starts a transaction, sets LOCAL ROLE to the
 * non-superuser `hospici_app` role (which enforces RLS), injects the three
 * app.* config settings that all RLS policies read, then calls `fn`.
 *
 * The transaction is always rolled back — tests cannot accidentally persist data.
 *
 * @example
 * await withRlsContext(pool, { userId: TEST_IDS.userA, locationId: TEST_IDS.locationA, role: 'registered_nurse' }, async (client) => {
 *   const { rows } = await client.query('SELECT * FROM patients');
 *   expect(rows).toHaveLength(1); // only locationA patients visible
 * });
 */
export async function withRlsContext(
  pool: Pool,
  ctx: RlsContext,
  fn: (client: PoolClient) => Promise<void>,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Switch to the non-superuser role so PostgreSQL enforces RLS.
    // FORCE ROW LEVEL SECURITY is applied to all PHI tables in migration 0001,
    // so policies apply even though POSTGRES_USER is a superuser.
    await client.query("SET LOCAL ROLE TO hospici_app");

    // Inject the three config values that every policy reads
    await client.query(
      "SELECT set_config('app.current_user_id', $1, true)",
      [ctx.userId],
    );
    await client.query(
      "SELECT set_config('app.current_location_id', $1, true)",
      [ctx.locationId],
    );
    await client.query(
      "SELECT set_config('app.current_role', $1, true)",
      [ctx.role],
    );

    await fn(client);

    await client.query("ROLLBACK");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
