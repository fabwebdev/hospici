import { env } from "@/config/env.ts";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index.ts";

const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
  statement_timeout: 30_000,
  idle_in_transaction_session_timeout: 10_000,
});

pool.on("error", (err) => {
  // Pool errors are logged by the Fastify logger via plugin
  // Do NOT use console.log here — this is handled in the db plugin
  process.stderr.write(`[pg pool error] ${err.message}\n`);
});

pool.on("acquire", () => {
  const active = pool.totalCount - pool.idleCount;
  if (active > 15) {
    process.stderr.write(
      `[pg pool warn] High active connections: ${active}/${pool.options.max ?? 20}\n`
    );
  }
});

export const db = drizzle(pool, { schema });

export type Db = typeof db;
export { pool };
