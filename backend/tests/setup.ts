import { config } from "dotenv";

// Load test environment — falls back to .env if .env.test not present
config({ path: ".env.test", override: false });
config({ path: ".env", override: false });

// Ensure test DB is used in integration tests
if (!process.env.DATABASE_URL?.includes("test")) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
}
