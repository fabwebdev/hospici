import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  process.stderr.write("Missing DATABASE_URL\n");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const db = drizzle(pool);

try {
  process.stdout.write("Running migrations...\n");
  await migrate(db, {
    migrationsFolder: join(__dirname, "../../database/migrations/drizzle"),
  });
  process.stdout.write("✅ Migrations complete\n");
} catch (err) {
  process.stderr.write(`❌ Migration failed: ${(err as Error).message}\n`);
  process.exit(1);
} finally {
  await pool.end();
}
