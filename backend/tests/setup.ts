import { config } from "dotenv";
import { FormatRegistry } from "@sinclair/typebox";

// Load test environment — falls back to .env if .env.test not present
config({ path: ".env.test", override: false });
config({ path: ".env", override: false });

// Ensure test DB is used in integration tests
if (!process.env.DATABASE_URL?.includes("test")) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
}

// Register TypeBox format validators required by AOT-compiled schemas
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

FormatRegistry.Set("uuid", (v) => UUID_RE.test(v));
FormatRegistry.Set("date", (v) => DATE_RE.test(v));
FormatRegistry.Set("date-time", (v) => DATE_TIME_RE.test(v));
