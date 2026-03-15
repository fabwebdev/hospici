// seeds/dev-user-seed.ts
// Creates a dev user for local development using Better Auth's internal API.
// Run: pnpm --filter @hospici/backend tsx -r dotenv/config src/seeds/dev-user-seed.ts

import { randomUUID } from "node:crypto";
import { db } from "../db/client.js";
import { sql } from "drizzle-orm";
import { auth } from "../config/auth.config.js";

const DEV_EMAIL = "dev@hospici.dev";
const DEV_PASSWORD = "DevPassword1234!";
const DEV_NAME = "Dr. Dev Smith";
const DEV_LOCATION_ID = "a1a1a1a1-0000-0000-0000-000000000001";

async function main() {
  // ── Ensure the dev location exists (CMS requires a facility/home location) ──
  const locExists = await db.execute<{ id: string }>(
    sql`SELECT id FROM locations WHERE id = ${DEV_LOCATION_ID}::uuid LIMIT 1`,
  );

  if (locExists.rows.length === 0) {
    const address = JSON.stringify({
      line: ["1234 Palm Valley Blvd", "Suite 200"],
      city: "Scottsdale",
      state: "AZ",
      postalCode: "85260",
      country: "US",
    });

    await db.execute(
      sql`INSERT INTO locations (id, name, npi, taxid, address, phone, isactive)
          VALUES (
            ${DEV_LOCATION_ID}::uuid,
            'Palm Valley Hospice',
            '1234567890',
            '123456789',
            ${address}::jsonb,
            '(480) 555-0100',
            true
          )`,
    );
    console.log("Dev location created: Palm Valley Hospice");
  } else {
    console.log("Dev location already exists: Palm Valley Hospice");
  }

  // Check if user already exists
  const existing = await db.execute<{ id: string }>(
    sql`SELECT id FROM users WHERE email = ${DEV_EMAIL} LIMIT 1`,
  );

  if (existing.rows.length > 0) {
    console.log(`Dev user already exists: ${DEV_EMAIL} (id: ${existing.rows[0]!.id})`);
    console.log(`Credentials: ${DEV_EMAIL} / ${DEV_PASSWORD}`);
    process.exit(0);
  }

  // Resolve the context to access the password hasher
  const ctx = await auth.$context;
  const hashedPassword = await ctx.password.hash(DEV_PASSWORD);
  const userId = randomUUID();
  const accountId = randomUUID();

  const abacJson = JSON.stringify({
    locationIds: [DEV_LOCATION_ID],
    role: "super_admin",
    permissions: ["*"],
  });

  await db.execute(
    sql`INSERT INTO users (id, name, email, email_verified, abac_attributes, is_active, two_factor_enabled)
        VALUES (${userId}, ${DEV_NAME}, ${DEV_EMAIL}, true, ${abacJson}::jsonb, true, true)`,
  );

  await db.execute(
    sql`INSERT INTO accounts (id, account_id, provider_id, user_id, password)
        VALUES (${accountId}, ${userId}, 'credential', ${userId}, ${hashedPassword})`,
  );

  console.log("Dev user created successfully!");
  console.log(`  Email:    ${DEV_EMAIL}`);
  console.log(`  Password: ${DEV_PASSWORD}`);
  console.log(`  User ID:  ${userId}`);
  console.log(`  Role:     super_admin`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to create dev user:", err);
  process.exit(1);
});
