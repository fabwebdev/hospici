// seeds/vendor-seed.ts
// T3-8: Pre-populate all known PHI-touching vendors with correct BAA metadata.
// Run once: pnpm --filter @hospici/backend tsx src/seeds/vendor-seed.ts

import { db } from "@/db/client.js";
import { locations, vendors } from "@/db/schema/index.js";
import { eq } from "drizzle-orm";

const KNOWN_VENDORS = [
  {
    vendorName: "Anthropic (Claude API)",
    serviceCategory: "AI_ML",
    description:
      "Claude API used by VantageChart for narrative generation. PHI is stripped before any API call (T2-7).",
    phiExposureLevel: "INDIRECT",
    transmitsPhi: false,
    storesPhi: false,
    subprocessor: true,
    baaRequired: true,
    baaStatus: "PENDING",
    notes:
      "PHI stripped before API call per T2-7 implementation. baaRequired=true; baaStatus=PENDING until Anthropic BAA signed.",
  },
  {
    vendorName: "PostgreSQL Database Host",
    serviceCategory: "INFRASTRUCTURE",
    description: "Primary database server hosting all PHI at rest.",
    phiExposureLevel: "STORES_PHI",
    transmitsPhi: false,
    storesPhi: true,
    subprocessor: true,
    baaRequired: true,
    baaStatus: "PENDING",
    notes: "PHI encrypted via pgcrypto AES-256 at rest. Hosting provider BAA required.",
  },
  {
    vendorName: "Valkey / Redis Host",
    serviceCategory: "INFRASTRUCTURE",
    description: "In-memory cache and BullMQ job queue. PHI must never be cached.",
    phiExposureLevel: "NONE",
    transmitsPhi: false,
    storesPhi: false,
    subprocessor: false,
    baaRequired: false,
    baaStatus: "NOT_REQUIRED",
    notes: "PHI must never be stored in Valkey (enforced by code). No BAA required.",
  },
  {
    vendorName: "SMTP Email Provider",
    serviceCategory: "COMMUNICATION",
    description: "Outbound email for alerts and notifications.",
    phiExposureLevel: "INDIRECT",
    transmitsPhi: false,
    storesPhi: false,
    subprocessor: true,
    baaRequired: true,
    baaStatus: "PENDING",
    notes: "Email content must not include PHI. BAA required per HIPAA §164.314(a).",
  },
  {
    vendorName: "Backup / DR Provider",
    serviceCategory: "STORAGE",
    description: "Database backup and disaster recovery storage.",
    phiExposureLevel: "STORES_PHI",
    transmitsPhi: true,
    storesPhi: true,
    subprocessor: true,
    baaRequired: true,
    baaStatus: "PENDING",
    notes:
      "Backups are encrypted. BAA required. Review data residency for HIPAA compliance.",
  },
  {
    vendorName: "Clearinghouse (Availity / Change Healthcare)",
    serviceCategory: "BILLING",
    description: "EDI clearinghouse for 837I claim submission and 835 ERA receipt.",
    phiExposureLevel: "DIRECT",
    transmitsPhi: true,
    storesPhi: false,
    subprocessor: true,
    baaRequired: true,
    baaStatus: "PENDING",
    notes: "T3-7a/T3-7b integration. BAA required per HIPAA transaction standards.",
  },
  {
    vendorName: "OpenFDA API",
    serviceCategory: "CLINICAL",
    description: "Drug labeling and interaction data for medication management (T2-6).",
    phiExposureLevel: "NONE",
    transmitsPhi: false,
    storesPhi: false,
    subprocessor: false,
    baaRequired: false,
    baaStatus: "NOT_REQUIRED",
    notes: "Public FDA API. No PHI transmitted. No BAA required.",
  },
  {
    vendorName: "Cloud Hosting Provider (AWS / GCP / Azure)",
    serviceCategory: "INFRASTRUCTURE",
    description: "Compute, networking, and managed services for the Hospici platform.",
    phiExposureLevel: "STORES_PHI",
    transmitsPhi: true,
    storesPhi: true,
    subprocessor: true,
    baaRequired: true,
    baaStatus: "PENDING",
    notes:
      "HIPAA Business Associate Agreement available from all major cloud providers. Must be signed before go-live.",
  },
] as const;

async function seedVendors() {
  const [defaultLocation] = await db.select({ id: locations.id }).from(locations).limit(1);

  if (!defaultLocation) {
    throw new Error("No locations found. Run the main seed first.");
  }

  const locationId = defaultLocation.id;

  for (const v of KNOWN_VENDORS) {
    const existing = await db
      .select({ id: vendors.id })
      .from(vendors)
      .where(eq(vendors.vendorName, v.vendorName))
      .limit(1);

    if (existing.length > 0) {
      process.stdout.write(`[seed] Skipping existing vendor: ${v.vendorName}\n`);
      continue;
    }

    await db.insert(vendors).values({
      locationId,
      vendorName: v.vendorName,
      serviceCategory: v.serviceCategory as never,
      description: v.description,
      phiExposureLevel: v.phiExposureLevel as never,
      transmitsPhi: v.transmitsPhi,
      storesPhi: v.storesPhi,
      subprocessor: v.subprocessor,
      baaRequired: v.baaRequired,
      baaStatus: v.baaStatus as never,
      notes: v.notes,
    });
    process.stdout.write(`[seed] Created vendor: ${v.vendorName}\n`);
  }

  process.stdout.write("[seed] Vendor seed complete.\n");
  process.exit(0);
}

seedVendors().catch((err: unknown) => {
  process.stderr.write(`[seed] Error: ${String(err)}\n`);
  process.exit(1);
});
