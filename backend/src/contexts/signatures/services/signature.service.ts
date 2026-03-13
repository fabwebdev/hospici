import { eq, and, desc, sql, count, lt } from "drizzle-orm";
import { createHash, randomUUID } from "crypto";
import type { Db } from "@/db/client.js";
import type * as schema from "@/db/schema/index.js";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type {
  CreateSignatureRequestBody,
  SignDocumentBody,
  CountersignBody,
  RejectSignatureBody,
  VoidSignatureBody,
  MarkExceptionBody,
  SignatureVerificationResult,
  SignatureRequestWithSignatures,
  OutstandingSignaturesResponse,
  SignatureListQuery,
  SignatureListResponse,
} from "../schemas/signature.schema.js";
import {
  signatureRequests,
  electronicSignatures,
  signatureEvents,
} from "../../../db/schema/signature-requests.table.js";
import { logAudit } from "../../identity/services/audit.service.js";
import { patients } from "../../../db/schema/patients.table.js";

type SignatureRequestStatus = (typeof signatureRequests.$inferSelect)["status"];

/** Duck type satisfied by both `db` and any Drizzle transaction `tx` */
type DbOrTx =
  | Db
  | PgTransaction<NodePgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

// Custom error classes
export class SignatureError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 400,
  ) {
    super(message);
    this.name = "SignatureError";
  }
}

export class SignatureAlreadyExistsError extends SignatureError {
  constructor() {
    super("Document already has an active signature request", "SIGNATURE_ALREADY_EXISTS", 409);
  }
}

export class SignatureAlreadySignedError extends SignatureError {
  constructor() {
    super("Document is already signed", "SIGNATURE_ALREADY_SIGNED", 409);
  }
}

export class InvalidSignatureTransitionError extends SignatureError {
  constructor(from: string, to: string) {
    super(`Invalid signature transition from ${from} to ${to}`, "INVALID_SIGNATURE_TRANSITION", 400);
  }
}

export class SignatureNotFoundError extends SignatureError {
  constructor() {
    super("Signature request not found", "SIGNATURE_NOT_FOUND", 404);
  }
}

export class UnauthorizedSignerError extends SignatureError {
  constructor() {
    super("Unauthorized to sign this document", "UNAUTHORIZED_SIGNER", 403);
  }
}

// Valid status transitions
const VALID_TRANSITIONS: Record<SignatureRequestStatus, SignatureRequestStatus[]> = {
  DRAFT: ["READY_FOR_SIGNATURE", "VOIDED", "NO_SIGNATURE_REQUIRED"],
  READY_FOR_SIGNATURE: ["SENT_FOR_SIGNATURE", "VOIDED", "NO_SIGNATURE_REQUIRED"],
  SENT_FOR_SIGNATURE: ["VIEWED", "PARTIALLY_SIGNED", "SIGNED", "REJECTED", "EXPIRED"],
  VIEWED: ["PARTIALLY_SIGNED", "SIGNED", "REJECTED", "EXPIRED"],
  PARTIALLY_SIGNED: ["SIGNED", "REJECTED", "EXPIRED"],
  SIGNED: [], // Terminal state
  REJECTED: ["READY_FOR_SIGNATURE", "VOIDED"],
  VOIDED: [], // Terminal state
  NO_SIGNATURE_REQUIRED: [], // Terminal state
  EXPIRED: ["READY_FOR_SIGNATURE", "VOIDED"],
};

export interface SignatureServiceDeps {
  db: Db;
}

export class SignatureService {
  private db: Db;

  constructor(deps: SignatureServiceDeps) {
    this.db = deps.db;
  }

  // ── Core Hash Functions ─────────────────────────────────────────────────────

  /**
   * Compute SHA-256 hash of content
   */
  static computeHash(content: string | Buffer): string {
    return createHash("sha256").update(content).digest("hex");
  }

  /**
   * Compute canonical content hash for a document
   */
  static computeContentHash(documentType: string, documentId: string, content: unknown): string {
    const canonical = JSON.stringify({
      type: documentType,
      id: documentId,
      content,
      version: "1.0",
    });
    return SignatureService.computeHash(canonical);
  }

  /**
   * Compute signature hash for tamper evidence
   */
  private computeSignatureHash(signatureData: {
    requestId: string;
    signerType: string;
    signerName: string;
    contentHash: string;
    signedAt: Date;
  }): string {
    const canonical = JSON.stringify({
      requestId: signatureData.requestId,
      signerType: signatureData.signerType,
      signerName: signatureData.signerName,
      contentHash: signatureData.contentHash,
      signedAt: signatureData.signedAt.toISOString(),
    });
    return SignatureService.computeHash(canonical);
  }

  // ── Signature Request Lifecycle ─────────────────────────────────────────────

  /**
   * Create a new signature request
   */
  async createSignatureRequest(
    input: CreateSignatureRequestBody,
    requestedByUserId: string,
    locationId: string,
  ): Promise<SignatureRequestWithSignatures> {
    return this.db.transaction(async (tx) => {
      // Check for existing active signature request
      const existing = await tx.query.signatureRequests.findFirst({
        where: and(
          eq(signatureRequests.documentType, input.documentType),
          eq(signatureRequests.documentId, input.documentId),
          sql`${signatureRequests.status} NOT IN ('SIGNED', 'VOIDED', 'NO_SIGNATURE_REQUIRED')`,
        ),
      });

      if (existing) {
        throw new SignatureAlreadyExistsError();
      }

      // Create the signature request
      const [request] = await tx
        .insert(signatureRequests)
        .values({
          locationId,
          patientId: input.patientId,
          documentType: input.documentType,
          documentId: input.documentId,
          status: "DRAFT",
          contentHash: input.contentHash,
          requireCountersign: input.requireCountersign ?? false,
          requirePatientSignature: input.requirePatientSignature ?? false,
          requireSignatureTime: input.requireSignatureTime ?? false,
          allowGrouping: input.allowGrouping ?? false,
          deliveryMethod: input.deliveryMethod ?? "portal",
          expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
          requestedBy: requestedByUserId,
        })
        .returning();

      if (!request) throw new Error("Failed to create signature request");

      // Log event
      await tx.insert(signatureEvents).values({
        signatureRequestId: request.id,
        eventType: "created",
        eventData: { contentHash: input.contentHash },
        actorUserId: requestedByUserId,
      });

      // Audit log
      await logAudit(
        "create",
        requestedByUserId,
        input.patientId,
        {
          userRole: "clinician",
          locationId,
          resourceType: "signature_request",
          resourceId: request.id,
          details: { documentType: input.documentType, documentId: input.documentId },
        },
        tx,
      );

      return {
        ...this.mapToResponse(request),
        signatures: [],
        events: [
          {
            id: randomUUID(),
            signatureRequestId: request.id,
            eventType: "created",
            eventData: { contentHash: input.contentHash },
            actorUserId: requestedByUserId,
            createdAt: request.createdAt.toISOString(),
          },
        ],
      };
    });
  }

  /**
   * Get a signature request by ID with all signatures and events
   */
  async getSignatureRequest(
    requestId: string,
    locationId: string,
  ): Promise<SignatureRequestWithSignatures> {
    const request = await this.db.query.signatureRequests.findFirst({
      where: and(
        eq(signatureRequests.id, requestId),
        eq(signatureRequests.locationId, locationId),
      ),
      with: {
        signatures: true,
        events: {
          orderBy: [desc(signatureEvents.createdAt)],
        },
      },
    });

    if (!request) {
      throw new SignatureNotFoundError();
    }

    return {
      ...this.mapToResponse(request),
      signatures: request.signatures.map((s) => this.mapSignatureToResponse(s)),
      events: request.events.map((e) => this.mapEventToResponse(e)),
    };
  }

  /**
   * Send signature request to signer
   */
  async sendForSignature(
    requestId: string,
    userId: string,
    locationId: string,
  ): Promise<SignatureRequestWithSignatures> {
    return this.db.transaction(async (tx) => {
      const request = await this.getRequestForUpdate(tx, requestId, locationId);

      if (request.status !== "DRAFT" && request.status !== "READY_FOR_SIGNATURE") {
        throw new InvalidSignatureTransitionError(request.status, "SENT_FOR_SIGNATURE");
      }

      const [updated] = await tx
        .update(signatureRequests)
        .set({
          status: "SENT_FOR_SIGNATURE",
          sentForSignatureAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(signatureRequests.id, requestId))
        .returning();

      await tx.insert(signatureEvents).values({
        signatureRequestId: requestId,
        eventType: "sent",
        eventData: {},
        actorUserId: userId,
      });

      await logAudit(
        "update",
        userId,
        request.patientId,
        {
          userRole: "clinician",
          locationId,
          resourceType: "signature_request",
          resourceId: requestId,
        },
        tx,
      );

      return this.getSignatureRequest(requestId, locationId);
    });
  }

  /**
   * Mark signature request as viewed
   */
  async markViewed(
    requestId: string,
    userId: string,
    locationId: string,
  ): Promise<SignatureRequestWithSignatures> {
    return this.db.transaction(async (tx) => {
      const request = await this.getRequestForUpdate(tx, requestId, locationId);

      if (request.status !== "SENT_FOR_SIGNATURE") {
        throw new InvalidSignatureTransitionError(request.status, "VIEWED");
      }

      await tx
        .update(signatureRequests)
        .set({
          status: "VIEWED",
          viewedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(signatureRequests.id, requestId));

      await tx.insert(signatureEvents).values({
        signatureRequestId: requestId,
        eventType: "viewed",
        eventData: {},
        actorUserId: userId,
      });

      return this.getSignatureRequest(requestId, locationId);
    });
  }

  /**
   * Sign a document
   */
  async signDocument(
    requestId: string,
    input: SignDocumentBody,
    userId: string | null,
    locationId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<SignatureRequestWithSignatures> {
    return this.db.transaction(async (tx) => {
      const request = await this.getRequestForUpdate(tx, requestId, locationId);

      // Check valid states for signing
      if (!["SENT_FOR_SIGNATURE", "VIEWED", "PARTIALLY_SIGNED"].includes(request.status)) {
        throw new InvalidSignatureTransitionError(request.status, "SIGNED");
      }

      // Check if already signed by this signer type (unless countersign)
      const existingSignatures = await tx.query.electronicSignatures.findMany({
        where: eq(electronicSignatures.signatureRequestId, requestId),
      });

      if (
        !input.countersignsSignatureId &&
        existingSignatures.some((s) => s.signerType === input.signerType && !s.countersignsSignatureId)
      ) {
        throw new SignatureAlreadySignedError();
      }

      // Compute signature hash
      const signedAt = new Date();
      const signatureHash = this.computeSignatureHash({
        requestId,
        signerType: input.signerType,
        signerName: input.signerName,
        contentHash: request.contentHash,
        signedAt,
      });

      // Create signature record
      const [signature] = await tx
        .insert(electronicSignatures)
        .values({
          signatureRequestId: requestId,
          locationId,
          signerType: input.signerType,
          signerUserId: userId,
          signerName: input.signerName,
          signerLegalName: input.signerLegalName ?? null,
          signerNpi: input.signerNpi ?? null,
          attestationAccepted: true,
          attestationText: input.attestationText,
          documentedSignedAt: input.documentedSignedAt ? new Date(input.documentedSignedAt) : null,
          signedAt,
          ipAddress: ipAddress ?? null,
          userAgent: userAgent ?? null,
          signatureData: input.signatureData ?? null,
          typedName: input.typedName ?? null,
          contentHashAtSign: request.contentHash,
          signatureHash,
          representativeRelationship: input.representativeRelationship ?? null,
          patientUnableReason: input.patientUnableReason ?? null,
          countersignsSignatureId: input.countersignsSignatureId ?? null,
        })
        .returning();

      if (!signature) throw new Error("Failed to create electronic signature");

      // Determine new status
      const signatureCount = existingSignatures.length + 1;
      let newStatus: SignatureRequestStatus = "PARTIALLY_SIGNED";

      const requiredSignatures = this.calculateRequiredSignatures(request);
      const hasAllRequiredSignatures = signatureCount >= requiredSignatures;

      if (hasAllRequiredSignatures) {
        newStatus = "SIGNED";
      }

      // Update request
      const [updated] = await tx
        .update(signatureRequests)
        .set({
          status: newStatus,
          completedAt: newStatus === "SIGNED" ? signedAt : null,
          documentedSignedAt: input.documentedSignedAt ? new Date(input.documentedSignedAt) : null,
          updatedAt: new Date(),
        })
        .where(eq(signatureRequests.id, requestId))
        .returning();

      // Log event
      await tx.insert(signatureEvents).values({
        signatureRequestId: requestId,
        eventType: "signed",
        eventData: {
          signatureId: signature.id,
          signerType: input.signerType,
          signerName: input.signerName,
        },
        actorUserId: userId,
      });

      // Audit log
      await logAudit(
        "sign",
        userId ?? "anonymous",
        request.patientId,
        {
          userRole: "clinician",
          locationId,
          resourceType: "signature_request",
          resourceId: requestId,
          details: { signatureId: signature.id, signerType: input.signerType },
        },
        tx,
      );

      return this.getSignatureRequest(requestId, locationId);
    });
  }

  /**
   * Add a countersignature to an existing signature
   */
  async countersignDocument(
    requestId: string,
    input: CountersignBody,
    userId: string,
    locationId: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<SignatureRequestWithSignatures> {
    return this.signDocument(
      requestId,
      {
        signerType: "AGENCY_REP",
        signerName: input.signerName,
        attestationText: input.attestationText,
        countersignsSignatureId: input.originalSignatureId,
      },
      userId,
      locationId,
      ipAddress,
      userAgent,
    );
  }

  /**
   * Reject a signature request
   */
  async rejectSignature(
    requestId: string,
    input: RejectSignatureBody,
    userId: string,
    locationId: string,
  ): Promise<SignatureRequestWithSignatures> {
    return this.db.transaction(async (tx) => {
      const request = await this.getRequestForUpdate(tx, requestId, locationId);

      if (!["SENT_FOR_SIGNATURE", "VIEWED", "PARTIALLY_SIGNED"].includes(request.status)) {
        throw new InvalidSignatureTransitionError(request.status, "REJECTED");
      }

      await tx
        .update(signatureRequests)
        .set({
          status: "REJECTED",
          rejectedAt: new Date(),
          rejectedBy: userId,
          rejectionReason: input.reason,
          updatedAt: new Date(),
        })
        .where(eq(signatureRequests.id, requestId));

      await tx.insert(signatureEvents).values({
        signatureRequestId: requestId,
        eventType: "rejected",
        eventData: { reason: input.reason },
        actorUserId: userId,
      });

      await logAudit(
        "update",
        userId,
        request.patientId,
        {
          userRole: "clinician",
          locationId,
          resourceType: "signature_request",
          resourceId: requestId,
          details: { reason: input.reason },
        },
        tx,
      );

      return this.getSignatureRequest(requestId, locationId);
    });
  }

  /**
   * Void a signature request
   */
  async voidSignature(
    requestId: string,
    input: VoidSignatureBody,
    userId: string,
    locationId: string,
  ): Promise<SignatureRequestWithSignatures> {
    return this.db.transaction(async (tx) => {
      const request = await this.getRequestForUpdate(tx, requestId, locationId);

      if (request.status === "SIGNED" || request.status === "VOIDED") {
        throw new InvalidSignatureTransitionError(request.status, "VOIDED");
      }

      await tx
        .update(signatureRequests)
        .set({
          status: "VOIDED",
          voidedAt: new Date(),
          voidedBy: userId,
          voidReason: input.reason,
          updatedAt: new Date(),
        })
        .where(eq(signatureRequests.id, requestId));

      await tx.insert(signatureEvents).values({
        signatureRequestId: requestId,
        eventType: "voided",
        eventData: { reason: input.reason },
        actorUserId: userId,
      });

      await logAudit(
        "delete",
        userId,
        request.patientId,
        {
          userRole: "clinician",
          locationId,
          resourceType: "signature_request",
          resourceId: requestId,
          details: { reason: input.reason },
        },
        tx,
      );

      return this.getSignatureRequest(requestId, locationId);
    });
  }

  /**
   * Mark signature request as no signature required (exception)
   */
  async markNoSignatureRequired(
    requestId: string,
    input: MarkExceptionBody,
    userId: string,
    locationId: string,
  ): Promise<SignatureRequestWithSignatures> {
    return this.db.transaction(async (tx) => {
      const request = await this.getRequestForUpdate(tx, requestId, locationId);

      if (request.status === "SIGNED" || request.status === "VOIDED") {
        throw new InvalidSignatureTransitionError(request.status, "NO_SIGNATURE_REQUIRED");
      }

      await tx
        .update(signatureRequests)
        .set({
          status: "NO_SIGNATURE_REQUIRED",
          exceptionType: input.exceptionType,
          exceptionReason: input.reason,
          exceptionApprovedBy: userId,
          exceptionApprovedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(signatureRequests.id, requestId));

      await tx.insert(signatureEvents).values({
        signatureRequestId: requestId,
        eventType: "exception_marked",
        eventData: { exceptionType: input.exceptionType, reason: input.reason },
        actorUserId: userId,
      });

      await logAudit(
        "update",
        userId,
        request.patientId,
        {
          userRole: "clinician",
          locationId,
          resourceType: "signature_request",
          resourceId: requestId,
          details: { exceptionType: input.exceptionType, reason: input.reason },
        },
        tx,
      );

      return this.getSignatureRequest(requestId, locationId);
    });
  }

  /**
   * Verify a signature's integrity
   */
  async verifySignature(
    signatureId: string,
    locationId: string,
  ): Promise<SignatureVerificationResult> {
    const signature = await this.db.query.electronicSignatures.findFirst({
      where: and(
        eq(electronicSignatures.id, signatureId),
        eq(electronicSignatures.locationId, locationId),
      ),
      with: {
        signatureRequest: true,
      },
    });

    if (!signature) {
      throw new SignatureNotFoundError();
    }

    const request = signature.signatureRequest;

    // Verify content hash matches current document
    const contentHashMatch = signature.contentHashAtSign === request.contentHash;

    // Recompute signature hash to verify it hasn't been tampered
    const recomputedHash = this.computeSignatureHash({
      requestId: signature.signatureRequestId,
      signerType: signature.signerType,
      signerName: signature.signerName,
      contentHash: signature.contentHashAtSign,
      signedAt: signature.signedAt,
    });

    const signatureHashMatch = signature.signatureHash === recomputedHash;

    return {
      isValid: contentHashMatch && signatureHashMatch,
      signatureId: signature.id,
      requestId: signature.signatureRequestId,
      documentType: request.documentType,
      documentId: request.documentId,
      signerName: signature.signerName,
      signedAt: signature.signedAt.toISOString(),
      contentHashMatch,
      signatureHashMatch,
      currentContentHash: request.contentHash,
      message: contentHashMatch && signatureHashMatch
        ? "Signature is valid and document has not been modified"
        : !contentHashMatch
          ? "Document content has been modified since signature"
          : "Signature record has been tampered with",
    };
  }

  /**
   * List signature requests with filters
   */
  async listSignatures(
    query: SignatureListQuery,
    locationId: string,
  ): Promise<SignatureListResponse> {
    const { status, documentType, patientId, overdue, page = 1, limit = 25 } = query;

    const conditions = [eq(signatureRequests.locationId, locationId)];

    if (status) {
      conditions.push(eq(signatureRequests.status, status));
    }

    if (documentType) {
      conditions.push(eq(signatureRequests.documentType, documentType));
    }

    if (patientId) {
      conditions.push(eq(signatureRequests.patientId, patientId));
    }

    if (overdue) {
      conditions.push(
        and(
          eq(signatureRequests.status, "SENT_FOR_SIGNATURE"),
          lt(signatureRequests.expiresAt, new Date()),
        )!,
      );
    }

    const whereClause = and(...conditions);

    // Get total count
    const countResult = await this.db
      .select({ count: count() })
      .from(signatureRequests)
      .where(whereClause);
    const total = countResult[0]?.count ?? 0;

    // Get paginated results
    const requests = await this.db.query.signatureRequests.findMany({
      where: whereClause,
      with: {
        signatures: true,
        events: {
          orderBy: [desc(signatureEvents.createdAt)],
          limit: 1,
        },
      },
      orderBy: [desc(signatureRequests.createdAt)],
      limit,
      offset: (page - 1) * limit,
    });

    return {
      items: requests.map((r) => ({
        ...this.mapToResponse(r),
        signatures: r.signatures.map((s) => this.mapSignatureToResponse(s)),
        events: r.events.map((e) => this.mapEventToResponse(e)),
      })),
      total: Number(total),
      page,
    };
  }

  /**
   * Get outstanding signature workbench data
   */
  async getOutstandingSignatures(locationId: string): Promise<OutstandingSignaturesResponse> {
    const now = new Date();

    // Get all active signature requests with patient info
    const requests = await this.db.query.signatureRequests.findMany({
      where: and(
        eq(signatureRequests.locationId, locationId),
        sql`${signatureRequests.status} IN ('READY_FOR_SIGNATURE', 'SENT_FOR_SIGNATURE', 'VIEWED', 'PARTIALLY_SIGNED')`,
      ),
      with: {
        signatures: true,
        patient: true,
      },
    });

    const pending: OutstandingSignaturesResponse["pending"] = [];
    const sent: OutstandingSignaturesResponse["sent"] = [];
    const overdue: OutstandingSignaturesResponse["overdue"] = [];
    const exception: OutstandingSignaturesResponse["exception"] = [];

    for (const request of requests) {
      const daysOutstanding = Math.floor(
        (now.getTime() - new Date(request.createdAt).getTime()) / (1000 * 60 * 60 * 24),
      );

      const item = {
        id: request.id,
        patientId: request.patientId,
        patientName: request.patient ? this.decryptPatientName(request.patient as typeof patients.$inferSelect) : "Unknown",
        documentType: request.documentType,
        documentId: request.documentId,
        status: request.status,
        requestedAt: request.createdAt.toISOString(),
        sentAt: request.sentForSignatureAt?.toISOString() ?? null,
        daysOutstanding,
        requireCountersign: request.requireCountersign,
        signatureCount: request.signatures.length,
      };

      if (request.expiresAt && request.expiresAt < now) {
        overdue.push(item);
      } else if (request.status === "READY_FOR_SIGNATURE") {
        pending.push(item);
      } else if (request.status === "SENT_FOR_SIGNATURE" || request.status === "VIEWED") {
        sent.push(item);
      } else if (request.status === "PARTIALLY_SIGNED") {
        exception.push(item);
      }
    }

    return { pending, sent, overdue, exception };
  }

  // ── Helper Methods ──────────────────────────────────────────────────────────

  private async getRequestForUpdate(
    tx: DbOrTx,
    requestId: string,
    locationId: string,
  ) {
    const request = await tx.query.signatureRequests.findFirst({
      where: and(
        eq(signatureRequests.id, requestId),
        eq(signatureRequests.locationId, locationId),
      ),
    });

    if (!request) {
      throw new SignatureNotFoundError();
    }

    return request;
  }

  private calculateRequiredSignatures(request: { requireCountersign: boolean; requirePatientSignature: boolean }): number {
    let count = 1; // At minimum one signature required
    if (request.requireCountersign) count++;
    if (request.requirePatientSignature) count++;
    return count;
  }

  private decryptPatientName(patient: typeof patients.$inferSelect): string {
    // Extract name from FHIR data jsonb — no dedicated name columns on patients table
    const pData = patient.data as Record<string, unknown> | null;
    const humanName = (pData?.name as Array<{ given?: string[]; family?: string }> | undefined)?.[0];
    if (!humanName) return "[unknown]";
    return `${humanName.given?.join(" ") ?? ""} ${humanName.family ?? ""}`.trim() || "[unknown]";
  }

  private mapToResponse(request: typeof signatureRequests.$inferSelect): Omit<SignatureRequestWithSignatures, "signatures" | "events"> {
    return {
      ...request,
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
      documentedSignedAt: request.documentedSignedAt?.toISOString() ?? null,
      sentForSignatureAt: request.sentForSignatureAt?.toISOString() ?? null,
      viewedAt: request.viewedAt?.toISOString() ?? null,
      completedAt: request.completedAt?.toISOString() ?? null,
      expiresAt: request.expiresAt?.toISOString() ?? null,
      exceptionApprovedAt: request.exceptionApprovedAt?.toISOString() ?? null,
      rejectedAt: request.rejectedAt?.toISOString() ?? null,
      voidedAt: request.voidedAt?.toISOString() ?? null,
      priorRevisionHash: request.priorRevisionHash ?? null,
      exceptionType: request.exceptionType ?? null,
      exceptionReason: request.exceptionReason ?? null,
      rejectionReason: request.rejectionReason ?? null,
      voidReason: request.voidReason ?? null,
    } as unknown as Omit<SignatureRequestWithSignatures, "signatures" | "events">;
  }

  private mapSignatureToResponse(
    signature: typeof electronicSignatures.$inferSelect,
  ): SignatureRequestWithSignatures["signatures"][number] {
    return {
      ...signature,
      id: signature.id,
      signatureRequestId: signature.signatureRequestId,
      locationId: signature.locationId,
      signerUserId: signature.signerUserId,
      countersignsSignatureId: signature.countersignsSignatureId,
      createdAt: signature.createdAt.toISOString(),
      signedAt: signature.signedAt.toISOString(),
      documentedSignedAt: signature.documentedSignedAt?.toISOString() ?? null,
      ipAddress: signature.ipAddress ?? null,
      userAgent: signature.userAgent ?? null,
      signatureData: signature.signatureData ?? null,
      typedName: signature.typedName ?? null,
      signerLegalName: signature.signerLegalName ?? null,
      signerNpi: signature.signerNpi ?? null,
      representativeRelationship: signature.representativeRelationship ?? null,
      patientUnableReason: signature.patientUnableReason ?? null,
    };
  }

  private mapEventToResponse(
    event: typeof signatureEvents.$inferSelect,
  ): SignatureRequestWithSignatures["events"][number] {
    return {
      ...event,
      eventData: (event.eventData ?? {}) as Record<string, unknown>,
      actorUserId: event.actorUserId,
      actorName: event.actorName,
      createdAt: event.createdAt.toISOString(),
    };
  }
}
