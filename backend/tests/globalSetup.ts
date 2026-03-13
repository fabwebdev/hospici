import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
/**
 * Vitest globalSetup — runs once in the main process before any test workers start.
 * Applies migrations to the test database exactly once so parallel test suites
 * do not race each other to apply the same DDL.
 */
import { config } from "dotenv";
import { Pool } from "pg";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function setup() {
  config({ path: join(__dirname, "../.env.test"), override: false });
  config({ path: join(__dirname, "../.env"), override: false });

  const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
  if (!url) return; // no test DB configured — skip (unit-only run)

  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    // Advisory lock so concurrent CI shards can't race
    await pool.query("SELECT pg_advisory_lock(987654321)");

    // Track applied migrations to avoid re-running (CREATE POLICY has no IF NOT EXISTS)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS _test_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const migrationsDir = join(__dirname, "../database/migrations/drizzle");
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

    const { rows: applied } = await pool.query<{ name: string }>(
      "SELECT name FROM _test_migrations",
    );
    const appliedSet = new Set(applied.map((r) => r.name));

    // Bootstrap: if tracking table is empty but schema already exists (e.g. from a prior
    // run before this tracking was added), pre-populate without re-running the SQL.
    if (appliedSet.size === 0) {
      const { rows: existing } = await pool.query<{ exists: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'locations') AS exists",
      );
      if (existing[0]?.exists) {
        for (const file of files) {
          await pool.query(
            "INSERT INTO _test_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING",
            [file],
          );
          appliedSet.add(file);
        }
      }
    }

    for (const file of files) {
      if (appliedSet.has(file)) continue;
      const sql = await readFile(join(migrationsDir, file), "utf8");
      await pool.query(sql);
      await pool.query("INSERT INTO _test_migrations (name) VALUES ($1)", [file]);
    }
  } finally {
    await pool.query("SELECT pg_advisory_unlock(987654321)").catch(() => {});
    await pool.end();
  }
}

export async function teardown() {
  // Nothing to tear down — test DB is tmpfs and is wiped on container restart
}
