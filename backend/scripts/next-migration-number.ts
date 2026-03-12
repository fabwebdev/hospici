/**
 * Prints the next available migration number by scanning drizzle/migrations/.
 * Usage: pnpm db:next-migration-number
 */
import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, "../database/migrations/drizzle");

let files: string[] = [];
try {
  files = readdirSync(migrationsDir).filter((f) => /^\d{4}_/.test(f));
} catch {
  // Empty migrations directory
}

const numbers = files
  .map((f) => Number(f.slice(0, 4)))
  .filter((n) => !Number.isNaN(n));

const next = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
const padded = String(next).padStart(4, "0");

process.stdout.write(`${padded}\n`);
