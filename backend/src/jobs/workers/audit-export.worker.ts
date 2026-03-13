// jobs/workers/audit-export.worker.ts
// T3-10: ADR / TPE / Survey Record Packet Export — BullMQ worker.
//
// Processes one export job at a time. Steps:
//  1. Mark export GENERATING
//  2. Fetch all patient data for selected sections within date range
//  3. Build section buffers, compute SHA-256 per section
//  4. Write section files to ./export-storage/{exportId}/sections/
//  5. Write merged file (all sections concatenated)
//  6. Build manifest + compute exportHash
//  7. Update row: READY + all storage keys + manifest + completedAt
//  8. Publish export:ready via complianceEvents
//  9. On error: set FAILED + errorMessage

import { env } from "@/config/env.js";
import { createLoggingConfig } from "@/config/logging.config.js";
import { db } from "@/db/client.js";
import { auditRecordExports } from "@/db/schema/audit-record-exports.table.js";
import { auditLogs } from "@/db/schema/audit-logs.table.js"; // used for AUDIT_LOG section query
import { benefitPeriods } from "@/db/schema/benefit-periods.table.js";
import { carePlans } from "@/db/schema/care-plans.table.js";
import { encounters } from "@/db/schema/encounters.table.js";
import { hopeAssessments } from "@/db/schema/hope-assessments.table.js";
import { idgMeetings } from "@/db/schema/idg-meetings.table.js";
import { medicationAdministrations } from "@/db/schema/medication-administrations.table.js";
import { medications } from "@/db/schema/medications.table.js";
import { noticesOfElection } from "@/db/schema/noe.table.js";
import { noticesOfTerminationRevocation } from "@/db/schema/notr.table.js";
import { orders } from "@/db/schema/orders.table.js";
import { patients } from "@/db/schema/patients.table.js";
import { signatureRequests } from "@/db/schema/signature-requests.table.js";
import { complianceEvents } from "@/events/compliance-events.js";
import { Worker } from "bullmq";
import { and, eq, gte, lte } from "drizzle-orm";
import type Valkey from "iovalkey";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import pino from "pino";
import { QUEUE_NAMES, createBullMQConnection } from "../queue.js";
import type { AuditRecordExportManifestType } from "@/contexts/compliance/schemas/auditExport.schema.js";

const log = pino(createLoggingConfig({ logLevel: env.logLevel, isDev: env.isDev }));

// ── Canonical section order ───────────────────────────────────────────────────

const CANONICAL_SECTION_ORDER = [
  "DEMOGRAPHICS",
  "NOE_NOTR",
  "BENEFIT_PERIODS",
  "HOPE_ASSESSMENTS",
  "CARE_PLAN",
  "ENCOUNTERS",
  "ORDERS",
  "IDG",
  "MEDICATIONS_MAR",
  "CONSENTS",
  "AUDIT_LOG",
  "COMPLETENESS_SUMMARY",
] as const;

type SectionKey = (typeof CANONICAL_SECTION_ORDER)[number];

// ── Section labels for manifest ───────────────────────────────────────────────

const SECTION_LABELS: Record<SectionKey, string> = {
  DEMOGRAPHICS: "Patient Demographics & Admission",
  NOE_NOTR: "Notices of Election & Termination",
  BENEFIT_PERIODS: "Benefit Periods",
  HOPE_ASSESSMENTS: "HOPE Assessments",
  CARE_PLAN: "Care Plan",
  ENCOUNTERS: "Encounter / Visit Notes",
  ORDERS: "Physician Orders",
  IDG: "IDG Meeting Records",
  MEDICATIONS_MAR: "Medications & MAR",
  CONSENTS: "Consents & Signature Records",
  AUDIT_LOG: "Audit Log",
  COMPLETENESS_SUMMARY: "Completeness Summary",
};

// ── Section data fetcher ──────────────────────────────────────────────────────

async function fetchSectionData(
  section: SectionKey,
  patientId: string,
  locationId: string,
  dateFrom: Date,
  dateTo: Date,
  includeAuditLog: boolean,
): Promise<unknown[]> {
  switch (section) {
    case "DEMOGRAPHICS": {
      const rows = await db
        .select()
        .from(patients)
        .where(eq(patients.id, patientId));
      return rows;
    }

    case "NOE_NOTR": {
      const noeRows = await db
        .select()
        .from(noticesOfElection)
        .where(
          and(
            eq(noticesOfElection.patientId, patientId),
            eq(noticesOfElection.locationId, locationId),
            gte(noticesOfElection.createdAt, dateFrom),
            lte(noticesOfElection.createdAt, dateTo),
          ),
        );
      const notrRows = await db
        .select()
        .from(noticesOfTerminationRevocation)
        .where(
          and(
            eq(noticesOfTerminationRevocation.patientId, patientId),
            eq(noticesOfTerminationRevocation.locationId, locationId),
            gte(noticesOfTerminationRevocation.createdAt, dateFrom),
            lte(noticesOfTerminationRevocation.createdAt, dateTo),
          ),
        );
      return [...noeRows, ...notrRows];
    }

    case "BENEFIT_PERIODS": {
      const rows = await db
        .select()
        .from(benefitPeriods)
        .where(
          and(
            eq(benefitPeriods.patientId, patientId),
            eq(benefitPeriods.locationId, locationId),
            gte(benefitPeriods.createdAt, dateFrom),
            lte(benefitPeriods.createdAt, dateTo),
          ),
        );
      return rows;
    }

    case "HOPE_ASSESSMENTS": {
      const rows = await db
        .select()
        .from(hopeAssessments)
        .where(
          and(
            eq(hopeAssessments.patientId, patientId),
            eq(hopeAssessments.locationId, locationId),
            gte(hopeAssessments.createdAt, dateFrom),
            lte(hopeAssessments.createdAt, dateTo),
          ),
        );
      return rows;
    }

    case "CARE_PLAN": {
      const rows = await db
        .select()
        .from(carePlans)
        .where(
          and(
            eq(carePlans.patientId, patientId),
            eq(carePlans.locationId, locationId),
            gte(carePlans.createdAt, dateFrom),
            lte(carePlans.createdAt, dateTo),
          ),
        );
      return rows;
    }

    case "ENCOUNTERS": {
      const rows = await db
        .select()
        .from(encounters)
        .where(
          and(
            eq(encounters.patientId, patientId),
            eq(encounters.locationId, locationId),
            gte(encounters.createdAt, dateFrom),
            lte(encounters.createdAt, dateTo),
          ),
        );
      return rows;
    }

    case "ORDERS": {
      const rows = await db
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.patientId, patientId),
            eq(orders.locationId, locationId),
            gte(orders.createdAt, dateFrom),
            lte(orders.createdAt, dateTo),
          ),
        );
      return rows;
    }

    case "IDG": {
      const rows = await db
        .select()
        .from(idgMeetings)
        .where(
          and(
            eq(idgMeetings.patientId, patientId),
            eq(idgMeetings.locationId, locationId),
            gte(idgMeetings.scheduledAt, dateFrom),
            lte(idgMeetings.scheduledAt, dateTo),
          ),
        );
      return rows;
    }

    case "MEDICATIONS_MAR": {
      const meds = await db
        .select()
        .from(medications)
        .where(
          and(
            eq(medications.patientId, patientId),
            eq(medications.locationId, locationId),
          ),
        );
      const mars = await db
        .select()
        .from(medicationAdministrations)
        .where(
          and(
            eq(medicationAdministrations.patientId, patientId),
            gte(medicationAdministrations.administeredAt, dateFrom),
            lte(medicationAdministrations.administeredAt, dateTo),
          ),
        );
      return [...meds, ...mars];
    }

    case "CONSENTS": {
      const rows = await db
        .select()
        .from(signatureRequests)
        .where(
          and(
            eq(signatureRequests.patientId, patientId),
            eq(signatureRequests.locationId, locationId),
            gte(signatureRequests.createdAt, dateFrom),
            lte(signatureRequests.createdAt, dateTo),
          ),
        );
      return rows;
    }

    case "AUDIT_LOG": {
      if (!includeAuditLog) return [];
      const rows = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.resourceId, patientId),
            gte(auditLogs.timestamp, dateFrom),
            lte(auditLogs.timestamp, dateTo),
          ),
        );
      return rows;
    }

    case "COMPLETENESS_SUMMARY": {
      // Stub: completeness summary generated at export time
      return [{ note: "Completeness summary — generated at export time", generatedAt: new Date().toISOString() }];
    }

    default:
      return [];
  }
}

// ── Worker factory ────────────────────────────────────────────────────────────

export function createAuditExportWorker(_valkey?: Valkey): Worker {
  const worker = new Worker(
    QUEUE_NAMES.AUDIT_EXPORT,
    async (job) => {
      const { exportId, patientId, locationId, userId } = job.data as {
        exportId: string;
        patientId: string;
        locationId: string;
        userId: string;
      };

      log.info({ exportId }, "audit-export job started");

      // ── Step 1: Fetch export row ──────────────────────────────────────────

      const [exportRow] = await db
        .select()
        .from(auditRecordExports)
        .where(eq(auditRecordExports.id, exportId));

      if (!exportRow) {
        throw new Error(`Export record not found: ${exportId}`);
      }

      // ── Step 2: Mark GENERATING ───────────────────────────────────────────

      await db
        .update(auditRecordExports)
        .set({ status: "GENERATING", generationStartedAt: new Date(), updatedAt: new Date() })
        .where(eq(auditRecordExports.id, exportId));

      try {
        const dateFrom = new Date(exportRow.dateRangeFrom);
        const dateTo = new Date(`${exportRow.dateRangeTo}T23:59:59.999Z`);

        const selectedSections = exportRow.selectedSections as string[];
        const includeAuditLog = exportRow.includeAuditLog;
        const includeCompletenessSummary = exportRow.includeCompletenessSummary;

        // ── Step 3: Create output directory ────────────────────────────────

        const exportDir = path.resolve("./export-storage", exportId, "sections");
        await fs.mkdir(exportDir, { recursive: true });

        // ── Step 4: Build sections in canonical order ───────────────────────

        const includedSections: AuditRecordExportManifestType["includedSections"] = [];
        const omittedSections: AuditRecordExportManifestType["omittedSections"] = [];
        const sectionBuffers: Buffer[] = [];

        for (const sectionKey of CANONICAL_SECTION_ORDER) {
          const label = SECTION_LABELS[sectionKey];

          // Handle AUDIT_LOG and COMPLETENESS_SUMMARY gating
          if (sectionKey === "AUDIT_LOG" && !includeAuditLog) {
            omittedSections.push({ name: label, reason: "not selected" });
            continue;
          }
          if (sectionKey === "COMPLETENESS_SUMMARY" && !includeCompletenessSummary) {
            omittedSections.push({ name: label, reason: "not selected" });
            continue;
          }

          if (!selectedSections.includes(sectionKey) && sectionKey !== "AUDIT_LOG" && sectionKey !== "COMPLETENESS_SUMMARY") {
            omittedSections.push({ name: label, reason: "not selected" });
            continue;
          }

          const data = await fetchSectionData(
            sectionKey,
            patientId,
            locationId,
            dateFrom,
            dateTo,
            includeAuditLog,
          );

          if (data.length === 0 && sectionKey !== "DEMOGRAPHICS" && sectionKey !== "COMPLETENESS_SUMMARY") {
            omittedSections.push({ name: label, reason: "no records in date range" });
            continue;
          }

          // Build section text buffer
          const sectionHeader = `=== ${label.toUpperCase()} ===\nExport ID: ${exportId}\nPatient ID: ${patientId}\nDate Range: ${exportRow.dateRangeFrom} to ${exportRow.dateRangeTo}\nGenerated: ${new Date().toISOString()}\n\n`;
          const sectionBody = data.map((item) => JSON.stringify(item)).join("\n");
          const sectionContent = `${sectionHeader}${sectionBody}\n`;
          const sectionBuffer = Buffer.from(sectionContent, "utf-8");

          // Compute SHA-256 of section bytes
          const sectionHash = crypto
            .createHash("sha256")
            .update(sectionBuffer)
            .digest("hex");

          // Write section file
          const sectionFilePath = path.join(exportDir, `${sectionKey.toLowerCase()}.txt`);
          await fs.writeFile(sectionFilePath, sectionBuffer);

          includedSections.push({
            name: label,
            documentCount: data.length,
            hash: sectionHash,
          });

          sectionBuffers.push(sectionBuffer);
        }

        // ── Step 5: Write merged PDF (concatenated sections) ───────────────

        const mergedContent = sectionBuffers.reduce<Buffer>(
          (acc, buf) => Buffer.concat([acc, buf]),
          Buffer.alloc(0),
        );

        const exportRootDir = path.resolve("./export-storage", exportId);
        const pdfPath = path.join(exportRootDir, "export.pdf.txt");
        await fs.writeFile(pdfPath, mergedContent);

        // Write ZIP (flat archive: write all section files to a manifest + concatenate)
        const zipLines: string[] = [`ZIP-ARCHIVE: ${exportId}`, `Created: ${new Date().toISOString()}`, "---"];
        for (const section of includedSections) {
          zipLines.push(`SECTION: ${section.name} | docs: ${section.documentCount} | hash: ${section.hash}`);
        }
        zipLines.push("---");
        zipLines.push(mergedContent.toString("utf-8"));
        const zipContent = Buffer.from(zipLines.join("\n"), "utf-8");
        const zipPath = path.join(exportRootDir, "export.zip.txt");
        await fs.writeFile(zipPath, zipContent);

        // ── Step 6: Build manifest ────────────────────────────────────────

        const totalDocuments = includedSections.reduce((sum, s) => sum + s.documentCount, 0);
        const generatedAt = new Date().toISOString();

        const manifest: AuditRecordExportManifestType = {
          exportId,
          patientId,
          purpose: exportRow.purpose,
          requestedAt: exportRow.createdAt.toISOString(),
          requestedBy: exportRow.requestedByUserId,
          dateRange: {
            from: exportRow.dateRangeFrom,
            to: exportRow.dateRangeTo,
          },
          includedSections,
          omittedSections,
          totalDocuments,
          exportHash: "", // filled below
          generatedAt,
        };

        // ── Step 7: Compute exportHash = SHA-256 of manifest JSON ─────────

        const manifestJson = JSON.stringify(manifest);
        const exportHash = crypto
          .createHash("sha256")
          .update(manifestJson)
          .digest("hex");

        manifest.exportHash = exportHash;

        // ── Step 8: Update DB row to READY ────────────────────────────────

        await db
          .update(auditRecordExports)
          .set({
            status: "READY",
            exportHash,
            manifestJson: manifest,
            pdfStorageKey: pdfPath,
            zipStorageKey: zipPath,
            generationCompletedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(auditRecordExports.id, exportId));

        // ── Step 9: Emit export:ready via Socket.IO ───────────────────────

        complianceEvents.emit("export:ready", {
          exportId,
          patientId,
          locationId,
          purpose: exportRow.purpose,
          generatedAt,
        });

        log.info(
          { exportId, totalDocuments, includedCount: includedSections.length },
          "audit-export generation completed",
        );

        return { exportId, totalDocuments, status: "READY" };
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);

        log.error({ exportId, err }, "audit-export generation failed");

        await db
          .update(auditRecordExports)
          .set({
            status: "FAILED",
            errorMessage,
            updatedAt: new Date(),
          })
          .where(eq(auditRecordExports.id, exportId));

        // Audit log the failure (use logAudit — never write to audit_logs directly)
        try {
          const { logAudit } = await import("@/contexts/identity/services/audit.service.js");
          await logAudit("update", userId, patientId, {
            userRole: "compliance_officer",
            locationId,
            resourceType: "audit_export",
            resourceId: exportId,
            details: { action: "ADR_EXPORT_FAILED", errorMessage },
          });
        } catch {
          // best-effort — do not let audit failure mask the original error
        }

        complianceEvents.emit("export:failed", {
          exportId,
          patientId,
          locationId,
          errorMessage,
        });

        throw err;
      }
    },
    {
      connection: createBullMQConnection(),
      concurrency: 1,
    },
  );

  worker.on("completed", (job, result) => {
    log.info({ jobId: job.id, result }, "audit-export worker job completed");
  });

  worker.on("failed", (job, err) => {
    log.error({ jobId: job?.id, err }, "audit-export worker job failed");
  });

  return worker;
}
