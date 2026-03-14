/**
 * DocumentService — patient document management.
 *
 * Features:
 *   - List documents by patient (all statuses, ordered newest first)
 *   - Upload document record with stub S3/R2 key generation
 *   - Patch document (status change, signature recording)
 *
 * RLS: every operation runs inside db.transaction() with applyRlsContext().
 * PHI: logAudit() on every read/write.
 */

import { logAudit } from "@/contexts/identity/services/audit.service.js";
import { db } from "@/db/client.js";
import { patientDocuments } from "@/db/schema/patient-documents.table.js";
import { and, count, desc, eq, sql } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type {
  CreateDocumentBody,
  DocumentListResponse,
  DocumentResponse,
  PatchDocumentBody,
} from "../schemas/document.schema.js";

type UserCtx = NonNullable<FastifyRequest["user"]>;
type AuditDbCtx = { insert: (typeof db)["insert"] };

async function applyRlsContext(
  tx: { execute: (typeof db)["execute"] },
  user: UserCtx,
): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.current_user_id', ${user.id}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_location_id', ${user.locationId}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_role', ${user.role}, true)`);
}

// ── Row → response mapper ─────────────────────────────────────────────────────

function toDocumentResponse(row: typeof patientDocuments.$inferSelect): DocumentResponse {
  const base: DocumentResponse = {
    id: row.id,
    patientId: row.patientId,
    locationId: row.locationId,
    name: row.name,
    category: row.category as DocumentResponse["category"],
    status: row.status as DocumentResponse["status"],
    signed: row.signed,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
  if (row.storageKey != null) base.storageKey = row.storageKey;
  if (row.mimeType != null) base.mimeType = row.mimeType;
  if (row.sizeBytes != null) base.sizeBytes = row.sizeBytes;
  if (row.uploadedByUserId != null) base.uploadedByUserId = row.uploadedByUserId;
  if (row.signedAt != null) base.signedAt = row.signedAt.toISOString();
  if (row.signedByUserId != null) base.signedByUserId = row.signedByUserId;
  return base;
}

// ── CRUD operations ───────────────────────────────────────────────────────────

export async function listDocuments(
  patientId: string,
  user: UserCtx,
): Promise<DocumentListResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const [rows, countRows] = await Promise.all([
      tx
        .select()
        .from(patientDocuments)
        .where(eq(patientDocuments.patientId, patientId))
        .orderBy(desc(patientDocuments.createdAt)),
      tx
        .select({ value: count() })
        .from(patientDocuments)
        .where(eq(patientDocuments.patientId, patientId)),
    ]);

    await logAudit(
      "view",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "document_list",
        details: { count: rows.length },
      },
      tx as unknown as AuditDbCtx,
    );

    return {
      documents: rows.map(toDocumentResponse),
      total: Number(countRows[0]?.value ?? 0),
    };
  });
}

export async function uploadDocument(
  patientId: string,
  body: CreateDocumentBody,
  user: UserCtx,
): Promise<DocumentResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    // Stub object-storage key — real implementation wires to S3/R2 presigned upload
    const storageKey = `patients/${patientId}/documents/${crypto.randomUUID()}`;

    const rows = await tx
      .insert(patientDocuments)
      .values({
        patientId,
        locationId: user.locationId,
        name: body.name,
        category: body.category as typeof patientDocuments.$inferInsert["category"],
        storageKey,
        mimeType: body.mimeType,
        sizeBytes: body.sizeBytes,
        status: "ACTIVE",
        uploadedByUserId: user.id,
        signed: false,
      })
      .returning();

    const row = rows[0];
    if (!row) throw new Error("Insert returned no rows");

    await logAudit(
      "create",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "patient_document",
        resourceId: row.id,
        details: {
          name: body.name,
          category: body.category,
          mimeType: body.mimeType,
          sizeBytes: body.sizeBytes,
        },
      },
      tx as unknown as AuditDbCtx,
    );

    return toDocumentResponse(row);
  });
}

export async function patchDocument(
  patientId: string,
  docId: string,
  body: PatchDocumentBody,
  user: UserCtx,
): Promise<DocumentResponse> {
  return db.transaction(async (tx) => {
    await applyRlsContext(tx, user);

    const updates: Partial<typeof patientDocuments.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (body.status !== undefined)
      updates.status = body.status as typeof patientDocuments.$inferInsert["status"];

    // Record signature when signed transitions to true
    if (body.signed === true) {
      updates.signed = true;
      updates.signedAt = new Date();
      updates.signedByUserId = user.id;
    }

    const rows = await tx
      .update(patientDocuments)
      .set(updates)
      .where(and(eq(patientDocuments.id, docId), eq(patientDocuments.patientId, patientId)))
      .returning();

    const row = rows[0];
    if (!row) {
      throw Object.assign(new Error("Document not found"), { statusCode: 404 });
    }

    await logAudit(
      "update",
      user.id,
      patientId,
      {
        userRole: user.role,
        locationId: user.locationId,
        resourceType: "patient_document",
        resourceId: docId,
        details: { fields: Object.keys(body) },
      },
      tx as unknown as AuditDbCtx,
    );

    return toDocumentResponse(row);
  });
}

export const DocumentService = {
  listDocuments,
  uploadDocument,
  patchDocument,
};
