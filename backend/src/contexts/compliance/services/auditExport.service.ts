// contexts/compliance/services/auditExport.service.ts
// T3-10: ADR / TPE / Survey Record Packet Export — service layer.

import { db } from "@/db/client.js";
import { auditRecordExports } from "@/db/schema/audit-record-exports.table.js";
import { logAudit } from "@/contexts/identity/services/audit.service.js";
import { auditExportQueue } from "@/jobs/queue.js";
import { and, count, desc, eq, sql } from "drizzle-orm";
import crypto from "node:crypto";
import type { AuditRecordExportManifestType, AuditRecordExportType } from "../schemas/auditExport.schema.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type CreateExportInput = {
  purpose: string;
  dateRangeFrom: string;
  dateRangeTo: string;
  selectedSections: string[];
  includeAuditLog: boolean;
  includeCompletenessSummary: boolean;
};

type DrizzleDb = typeof db;

// ── Custom errors ─────────────────────────────────────────────────────────────

export class AuditExportNotFoundError extends Error {
  readonly statusCode = 404;
  constructor(exportId: string) {
    super(`Audit export not found: ${exportId}`);
    this.name = "AuditExportNotFoundError";
  }
}

export class AuditExportNotReadyError extends Error {
  readonly statusCode = 400;
  readonly code = "EXPORT_NOT_READY";
  constructor(status: string) {
    super(`Export is not ready for download (current status: ${status})`);
    this.name = "AuditExportNotReadyError";
  }
}

// ── Row mapper ────────────────────────────────────────────────────────────────

type ExportRow = typeof auditRecordExports.$inferSelect;

function mapExportRow(row: ExportRow): AuditRecordExportType {
  return {
    id: row.id,
    patientId: row.patientId,
    locationId: row.locationId,
    requestedByUserId: row.requestedByUserId,
    purpose: row.purpose,
    status: row.status,
    dateRangeFrom: row.dateRangeFrom,
    dateRangeTo: row.dateRangeTo,
    selectedSections: row.selectedSections ?? [],
    includeAuditLog: row.includeAuditLog,
    includeCompletenessSummary: row.includeCompletenessSummary,
    exportHash: row.exportHash ?? null,
    manifestJson: (row.manifestJson as AuditRecordExportManifestType | null) ?? null,
    pdfStorageKey: row.pdfStorageKey ?? null,
    zipStorageKey: row.zipStorageKey ?? null,
    generationStartedAt: row.generationStartedAt?.toISOString() ?? null,
    generationCompletedAt: row.generationCompletedAt?.toISOString() ?? null,
    exportedAt: row.exportedAt?.toISOString() ?? null,
    errorMessage: row.errorMessage ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ── AuditExportService ────────────────────────────────────────────────────────

export class AuditExportService {
  /**
   * Creates a new export record with REQUESTED status, enqueues the BullMQ job,
   * and logs ADR_EXPORT_REQUESTED to the audit log.
   */
  static async createExport(
    dbCtx: DrizzleDb,
    patientId: string,
    userId: string,
    locationId: string,
    input: CreateExportInput,
  ): Promise<{ exportId: string }> {
    await dbCtx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    await dbCtx.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);

    const [row] = await dbCtx
      .insert(auditRecordExports)
      .values({
        patientId,
        locationId,
        requestedByUserId: userId,
        purpose: input.purpose as "ADR" | "TPE" | "SURVEY" | "LEGAL" | "PAYER_REQUEST",
        status: "REQUESTED",
        dateRangeFrom: input.dateRangeFrom,
        dateRangeTo: input.dateRangeTo,
        selectedSections: input.selectedSections,
        includeAuditLog: input.includeAuditLog,
        includeCompletenessSummary: input.includeCompletenessSummary,
      })
      .returning();

    if (!row) {
      throw new Error("Failed to create audit export record");
    }

    // Enqueue BullMQ job — event-driven, not scheduled
    await auditExportQueue.add(
      "generate-export",
      { exportId: row.id, patientId, locationId, userId },
      { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
    );

    await logAudit("create", userId, patientId, {
      userRole: "compliance_officer",
      locationId,
      resourceType: "audit_export",
      resourceId: row.id,
      details: {
        action: "ADR_EXPORT_REQUESTED",
        purpose: input.purpose,
        dateRangeFrom: input.dateRangeFrom,
        dateRangeTo: input.dateRangeTo,
        selectedSections: input.selectedSections,
      },
    });

    return { exportId: row.id };
  }

  /**
   * Returns a single export row. Throws 404 if not found within the given scope.
   */
  static async getExport(
    dbCtx: DrizzleDb,
    exportId: string,
    patientId: string,
    locationId: string,
  ): Promise<AuditRecordExportType> {
    await dbCtx.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);

    const [row] = await dbCtx
      .select()
      .from(auditRecordExports)
      .where(
        and(
          eq(auditRecordExports.id, exportId),
          eq(auditRecordExports.patientId, patientId),
          eq(auditRecordExports.locationId, locationId),
        ),
      );

    if (!row) {
      throw new AuditExportNotFoundError(exportId);
    }

    return mapExportRow(row);
  }

  /**
   * Returns export history for a patient, most recent first.
   */
  static async listExports(
    dbCtx: DrizzleDb,
    patientId: string,
    locationId: string,
    pagination: { limit: number; offset: number },
  ): Promise<{ exports: AuditRecordExportType[]; total: number }> {
    await dbCtx.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);

    const condition = and(
      eq(auditRecordExports.patientId, patientId),
      eq(auditRecordExports.locationId, locationId),
    );

    const [totalResult, rows] = await Promise.all([
      dbCtx
        .select({ count: count() })
        .from(auditRecordExports)
        .where(condition),
      dbCtx
        .select()
        .from(auditRecordExports)
        .where(condition)
        .orderBy(desc(auditRecordExports.createdAt))
        .limit(pagination.limit)
        .offset(pagination.offset),
    ]);

    return {
      exports: rows.map(mapExportRow),
      total: totalResult[0]?.count ?? 0,
    };
  }

  /**
   * Generates a time-limited download token, sets exportedAt on first download,
   * and returns the download URL.
   */
  static async getDownloadUrl(
    dbCtx: DrizzleDb,
    exportId: string,
    patientId: string,
    locationId: string,
    format: "pdf" | "zip",
    userId: string,
  ): Promise<{ downloadUrl: string; format: string; expiresAt: string }> {
    await dbCtx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    await dbCtx.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);

    const [row] = await dbCtx
      .select()
      .from(auditRecordExports)
      .where(
        and(
          eq(auditRecordExports.id, exportId),
          eq(auditRecordExports.patientId, patientId),
          eq(auditRecordExports.locationId, locationId),
        ),
      );

    if (!row) {
      throw new AuditExportNotFoundError(exportId);
    }

    if (row.status !== "READY" && row.status !== "EXPORTED") {
      throw new AuditExportNotReadyError(row.status);
    }

    // Generate time-limited token (15 min TTL)
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Set exportedAt on first download
    if (!row.exportedAt) {
      await dbCtx
        .update(auditRecordExports)
        .set({ exportedAt: new Date(), status: "EXPORTED", updatedAt: new Date() })
        .where(eq(auditRecordExports.id, exportId));
    }

    await logAudit("view", userId, patientId, {
      userRole: "compliance_officer",
      locationId,
      resourceType: "audit_export",
      resourceId: exportId,
      details: {
        action: "ADR_EXPORT_DOWNLOADED",
        format,
        exportedAt: new Date().toISOString(),
      },
    });

    const downloadUrl = `/api/v1/patients/${patientId}/audit-exports/${exportId}/file?format=${format}&token=${token}`;

    return {
      downloadUrl,
      format,
      expiresAt: expiresAt.toISOString(),
    };
  }
}
