import { env } from "@/config/env.ts";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index.ts";

const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  // Pool errors are logged by the Fastify logger via plugin
  // Do NOT use console.log here — this is handled in the db plugin
  process.stderr.write(`[pg pool error] ${err.message}\n`);
});

export const db = drizzle(pool, { schema });

export type Db = typeof db;
export { pool };
