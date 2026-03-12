/**
 * AuditService — HIPAA-compliant append-only audit log.
 *
 * RULES (enforced by CI):
 *  1. Only db.insert() is ever called against audit_logs — no update, no delete.
 *  2. Every PHI-accessing route must call AuditService.log() in its handler.
 *  3. Never write directly to audit_logs outside this service.
 *
 * HIPAA §164.312(b): Hardware, software, and procedural mechanisms that record
 * and examine activity in information systems containing PHI.
 */

import { db } from "@/db/client.js";
import { auditLogs } from "@/db/schema/audit-logs.table.js";
import type { AuditAction } from "../schemas/audit.schema.js";

/** Duck-typed DB context — satisfied by both `db` and any Drizzle transaction `tx` */
type AuditDbCtx = { insert: (typeof db)["insert"] };

export type AuditLogMetadata = {
  /** Role of the user performing the action */
  userRole: string;
  /** Location context for RLS scoping */
  locationId: string;
  /** The type of resource being acted upon (e.g. "patient", "hope_assessment") */
  resourceType: string;
  /**
   * UUID of the resource being acted upon.
   * Defaults to userId when patientId is null (e.g. for login/logout events).
   */
  resourceId?: string;
  /** Client IP address from the Fastify request */
  ipAddress?: string;
  /** User-Agent header from the Fastify request */
  userAgent?: string;
  /** Additional structured details attached to the log entry */
  details?: Record<string, unknown>;
};

export class AuditService {
  /**
   * Append one audit log entry.
   *
   * @param action    - The action being audited
   * @param userId    - UUID of the authenticated user performing the action
   * @param patientId - UUID of the affected patient, or null for non-patient actions
   * @param metadata  - Role, location, resource context, and optional details
   */
  static async log(
    action: AuditAction,
    userId: string,
    patientId: string | null,
    metadata: AuditLogMetadata,
    /** Optional Drizzle transaction — pass when logging within a db.transaction() for atomicity */
    tx?: AuditDbCtx,
  ): Promise<void> {
    // For non-patient events (login, logout, break-glass) the resource is the user themselves.
    const resourceId = patientId ?? metadata.resourceId ?? userId;
    const dbCtx = tx ?? db;

    await dbCtx.insert(auditLogs).values({
      userId,
      userRole: metadata.userRole,
      locationId: metadata.locationId,
      action,
      resourceType: metadata.resourceType,
      resourceId,
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent,
      details: metadata.details ?? null,
    });
  }
}
