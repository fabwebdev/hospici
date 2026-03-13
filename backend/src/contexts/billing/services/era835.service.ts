/**
 * ERA835Service — T3-7b
 *
 * Handles 835 Electronic Remittance Advice ingestion, CLP-loop matching,
 * auto-posting, and exception-queue management.
 *
 * Matching strategy (in priority order):
 *  1. Exact ICN match — REF*EA / REF*1K after CLP vs claims.clearinghouse_icn
 *  2. Patient control-number lookup (CLP01) vs claim control numbers
 *
 * Auto-post threshold: exact ICN match only.
 * Partial match → unmatched_remittances exception queue.
 */

import { createHash } from "node:crypto";
import { db } from "@/db/client.js";
import { type ClaimRevisionInsert, claims, claimRevisions } from "@/db/schema/claims.table.js";
import {
  remittancePostings,
  remittances835,
  unmatchedRemittances,
} from "@/db/schema/remittances.table.js";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";
import type {
  IngestERABody,
  ManualMatchBody,
  RemittanceListQuery,
} from "../schemas/era835.schema.js";

// ── Socket.IO event emitter ───────────────────────────────────────────────────

type EventEmitter = { emit(event: string, data: unknown): void };
let _emitter: EventEmitter | null = null;
export function setERAEventEmitter(e: EventEmitter): void {
  _emitter = e;
}
function emitEvent(event: string, data: unknown): void {
  _emitter?.emit(event, data);
}

// ── 835 Parser ────────────────────────────────────────────────────────────────

interface ParsedClpLoop {
  patientControlNumber: string;    // CLP01
  claimStatusCode: string;         // CLP02
  totalChargeAmount: number;       // CLP03
  paidAmount: number;              // CLP04
  patientResponsibility: number;   // CLP05
  payerClaimNumber: string | null; // CLP07
  icn: string | null;              // REF*EA or REF*1K
  adjustments: Array<{ groupCode: string; reasonCode: string; amount: number; quantity?: number }>;
  svcLoops: Array<{
    serviceDate?: string;
    procedureCode?: string;
    submittedAmount: number;
    paidAmount: number;
    adjustments: Array<{ groupCode: string; reasonCode: string; amount: number; quantity?: number }>;
  }>;
}

interface Parsed835 {
  payerName: string;
  payerId: string | null;
  checkNumber: string | null;
  eftNumber: string | null;
  paymentDate: string | null;
  totalPaymentAmount: number | null;
  clpLoops: ParsedClpLoop[];
}

/**
 * Minimal X12 835 parser.
 * Splits on segment terminators, then element separators.
 * Handles standard ISA (element sep = ISA[3], segment term = last char of ISA).
 */
export function parse835(raw: string): Parsed835 {
  // Detect element separator and segment terminator from ISA header
  const elementSep = raw[3] ?? "*";
  const segmentTerm = raw.trimEnd().slice(-1) === "~" ? "~" : raw[105] ?? "~";

  const segments = raw
    .split(segmentTerm)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.split(elementSep));

  let payerName = "";
  let payerId: string | null = null;
  let checkNumber: string | null = null;
  let eftNumber: string | null = null;
  let paymentDate: string | null = null;
  let totalPaymentAmount: number | null = null;
  const clpLoops: ParsedClpLoop[] = [];
  let currentClp: ParsedClpLoop | null = null;
  let inClp = false;

  // Track current N1 context for payer identification
  let n1Context = "";

  for (const seg of segments) {
    const id = seg[0];

    // BPR — Financial Information (payment amount, method)
    if (id === "BPR") {
      totalPaymentAmount = Number(seg[2]) || null;
      const paymentMethod = seg[4]; // CHK or ACH
      if (paymentMethod === "CHK") {
        checkNumber = seg[15] ?? null;
      } else if (paymentMethod === "ACH") {
        eftNumber = seg[9] ?? null;
      }
      continue;
    }

    // TRN — Trace Number (check/EFT reference)
    if (id === "TRN") {
      if (!checkNumber && !eftNumber) {
        checkNumber = seg[2] ?? null;
      }
      continue;
    }

    // DTM — Date (405 = statement date used as payment date reference)
    if (id === "DTM" && seg[1] === "405") {
      const raw8 = seg[2] ?? "";
      if (raw8.length === 8) {
        paymentDate = `${raw8.slice(0, 4)}-${raw8.slice(4, 6)}-${raw8.slice(6, 8)}`;
      } else {
        paymentDate = raw8 || null;
      }
      continue;
    }

    // N1 — Entity Name (PR = payer, PE = payee)
    if (id === "N1") {
      n1Context = seg[1] ?? "";
      if (n1Context === "PR") {
        payerName = seg[2] ?? "";
        payerId = seg[4] ?? null;
      }
      continue;
    }

    // CLP — Claim-Level Payment Info — starts a new CLP loop
    if (id === "CLP") {
      // Save previous CLP loop
      if (currentClp) {
        clpLoops.push(currentClp);
      }
      currentClp = {
        patientControlNumber: seg[1] ?? "",
        claimStatusCode: seg[2] ?? "",
        totalChargeAmount: Number(seg[3]) || 0,
        paidAmount: Number(seg[4]) || 0,
        patientResponsibility: Number(seg[5]) || 0,
        payerClaimNumber: seg[7] ?? null,
        icn: null,
        adjustments: [],
        svcLoops: [],
      };
      inClp = true;
      continue;
    }

    // REF — Reference Identification (after CLP — ICN lookup)
    if (id === "REF" && inClp && currentClp) {
      // EA = Claim Adjustment Reason Code / ICN, 1K = Payer Claim Control Number
      if (seg[1] === "EA" || seg[1] === "1K" || seg[1] === "F8") {
        currentClp.icn = seg[2] ?? null;
      }
      continue;
    }

    // CAS — Claim Adjustment (after CLP, before SVC)
    if (id === "CAS" && inClp && currentClp) {
      // CAS can have up to 6 triplets (groupCode, reasonCode, amount, qty)
      let i = 1;
      while (i + 1 < seg.length) {
        const groupCode = seg[i];
        const reasonCode = seg[i + 1];
        const amount = Number(seg[i + 2]) || 0;
        const qty = seg[i + 3] ? Number(seg[i + 3]) : undefined;
        if (groupCode && reasonCode) {
          currentClp.adjustments.push(
            qty !== undefined
              ? { groupCode, reasonCode, amount, quantity: qty }
              : { groupCode, reasonCode, amount },
          );
        }
        i += 4;
      }
      continue;
    }

    // SVC — Service (line-level payment detail)
    if (id === "SVC" && inClp && currentClp) {
      const procCode = seg[1]?.split(":")?.[1];
      const svc: ParsedClpLoop["svcLoops"][number] = {
        submittedAmount: Number(seg[2]) || 0,
        paidAmount: Number(seg[3]) || 0,
        adjustments: [],
        ...(procCode !== undefined ? { procedureCode: procCode } : {}),
      };
      currentClp.svcLoops.push(svc);
      continue;
    }

    // CAS after SVC — attach to latest SVC
    if (id === "CAS" && inClp && currentClp && currentClp.svcLoops.length > 0) {
      const lastSvc = currentClp.svcLoops[currentClp.svcLoops.length - 1];
      if (!lastSvc) continue;
      let i = 1;
      while (i + 1 < seg.length) {
        const groupCode = seg[i];
        const reasonCode = seg[i + 1];
        const amount = Number(seg[i + 2]) || 0;
        const qty = seg[i + 3] ? Number(seg[i + 3]) : undefined;
        if (groupCode && reasonCode) {
          lastSvc.adjustments.push(
            qty !== undefined
              ? { groupCode, reasonCode, amount, quantity: qty }
              : { groupCode, reasonCode, amount },
          );
        }
        i += 4;
      }
      continue;
    }

    // DTM after SVC — service date
    if (id === "DTM" && inClp && currentClp && currentClp.svcLoops.length > 0) {
      const lastSvc = currentClp.svcLoops[currentClp.svcLoops.length - 1];
      if (!lastSvc) continue;
      const raw8 = seg[2] ?? "";
      if (raw8.length === 8) {
        lastSvc.serviceDate = `${raw8.slice(0, 4)}-${raw8.slice(4, 6)}-${raw8.slice(6, 8)}`;
      }
      continue;
    }

    // SE — Transaction Set Trailer — end of 835
    if (id === "SE") {
      if (currentClp) {
        clpLoops.push(currentClp);
        currentClp = null;
      }
      inClp = false;
      continue;
    }
  }

  // Flush last CLP if SE wasn't encountered
  if (currentClp) {
    clpLoops.push(currentClp);
  }

  return { payerName, payerId, checkNumber, eftNumber, paymentDate, totalPaymentAmount, clpLoops };
}

// ── Match helpers ─────────────────────────────────────────────────────────────

type MatchResult =
  | { type: "icn"; claimId: string; locationId: string }
  | { type: "none"; reason: string };

async function findClaimByIcn(
  icn: string,
  locationId: string,
): Promise<{ id: string; locationId: string; state: string; totalCharge: string } | null> {
  const [row] = await db
    .select({ id: claims.id, locationId: claims.locationId, state: claims.state, totalCharge: claims.totalCharge })
    .from(claims)
    .where(and(eq(claims.clearinghouseIcn, icn), eq(claims.locationId, locationId)))
    .limit(1);
  return row ?? null;
}

async function matchClp(
  clp: ParsedClpLoop,
  locationId: string,
): Promise<MatchResult> {
  // Strategy 1: ICN match
  if (clp.icn) {
    const claim = await findClaimByIcn(clp.icn, locationId);
    if (claim) {
      return { type: "icn", claimId: claim.id, locationId: claim.locationId };
    }
  }

  // Strategy 2: payer claim number as ICN fallback
  if (clp.payerClaimNumber) {
    const claim = await findClaimByIcn(clp.payerClaimNumber, locationId);
    if (claim) {
      return { type: "icn", claimId: claim.id, locationId: claim.locationId };
    }
  }

  return {
    type: "none",
    reason: `No ICN match for ICN=${clp.icn ?? "null"} payerClaimNumber=${clp.payerClaimNumber ?? "null"}`,
  };
}

// ── ERA835Service ─────────────────────────────────────────────────────────────

export class ERA835Service {
  constructor(private readonly log: FastifyBaseLogger) {}

  /**
   * Full ingestion pipeline:
   *  1. Decode base64 → raw 835 text
   *  2. SHA-256 hash for dedup
   *  3. Parse 835
   *  4. Create remittances_835 row (RECEIVED)
   *  5. For each CLP loop: match → auto-post or exception queue
   *  6. Update remittance status
   */
  async ingestERA(
    body: IngestERABody,
    userId: string,
  ): Promise<{ remittanceId: string; matched: number; unmatched: number }> {
    // Decode
    const rawText = Buffer.from(body.raw835, "base64").toString("utf-8");
    const rawFileHash = createHash("sha256").update(rawText).digest("hex");

    // Parse
    let parsed: Parsed835;
    try {
      parsed = parse835(rawText);
    } catch (err) {
      this.log.error({ err }, "era835: parse failure");
      throw new ERA835ParseError("Failed to parse 835 file");
    }

    // Insert remittances_835 header row
    const [remRow] = await db
      .insert(remittances835)
      .values({
        locationId: body.locationId,
        payerName: parsed.payerName || body.payerName,
        payerId: parsed.payerId,
        checkNumber: parsed.checkNumber,
        eftNumber: parsed.eftNumber,
        paymentDate: parsed.paymentDate,
        totalPaymentAmount: parsed.totalPaymentAmount?.toFixed(2) ?? null,
        rawFileHash,
        status: "PARSED",
      })
      .returning();

    if (!remRow) throw new ERA835IngestError("Failed to create remittance record");

    const remittanceId = remRow.id;
    let matched = 0;
    let unmatched = 0;

    // Process each CLP loop
    for (const clp of parsed.clpLoops) {
      const matchResult = await matchClp(clp, body.locationId);

      if (matchResult.type === "icn") {
        await this._autoPost(remittanceId, clp, matchResult.claimId, matchResult.locationId, userId);
        matched++;
      } else {
        await this._routeToExceptionQueue(remittanceId, clp, body.locationId, matchResult.reason);
        emitEvent("claim:remittance:unmatched", {
          remittanceId,
          locationId: body.locationId,
          patientControlNumber: clp.patientControlNumber,
          payerClaimNumber: clp.payerClaimNumber,
          reason: matchResult.reason,
        });
        unmatched++;
      }
    }

    // Update remittance status
    const finalStatus =
      unmatched === 0 ? "POSTED"
      : matched === 0 ? "PARTIAL"
      : "PARTIAL";

    await db
      .update(remittances835)
      .set({ status: finalStatus })
      .where(eq(remittances835.id, remittanceId));

    this.log.info({ remittanceId, matched, unmatched }, "era835: ingestion complete");
    return { remittanceId, matched, unmatched };
  }

  private async _autoPost(
    remittanceId: string,
    clp: ParsedClpLoop,
    claimId: string,
    locationId: string,
    _userId: string,
  ): Promise<void> {
    // Compute contractual adjustment (CO group codes)
    const contractualAdj = clp.adjustments
      .filter((a) => a.groupCode === "CO")
      .reduce((sum, a) => sum + a.amount, 0);
    const otherAdj = clp.adjustments
      .filter((a) => a.groupCode !== "CO" && a.groupCode !== "PR")
      .reduce((sum, a) => sum + a.amount, 0);

    // Write posting row
    await db.insert(remittancePostings).values({
      remittanceId,
      claimId,
      locationId,
      claimIcn: clp.icn,
      payerClaimNumber: clp.payerClaimNumber,
      patientControlNumber: clp.patientControlNumber,
      paidAmount: clp.paidAmount.toFixed(2),
      contractualAdjustment: contractualAdj.toFixed(2),
      patientResponsibility: clp.patientResponsibility.toFixed(2),
      otherAdjustment: otherAdj.toFixed(2),
      adjustmentReasonCodes: clp.adjustments,
      svcLoops: clp.svcLoops,
      postingState: "APPLIED",
      postedAt: new Date(),
    });

    // Determine new claim state
    // If paid amount > 0 and covers the balance → PAID; otherwise stay ACCEPTED
    const [claimRow] = await db
      .select({ state: claims.state, totalCharge: claims.totalCharge })
      .from(claims)
      .where(eq(claims.id, claimId))
      .limit(1);

    if (!claimRow) return;

    const shouldPay =
      clp.paidAmount > 0 &&
      claimRow.state !== "PAID" &&
      claimRow.state !== "VOIDED";

    if (shouldPay) {
      // Transition claim → PAID with revision record
      await db
        .update(claims)
        .set({ state: "PAID", updatedAt: new Date() })
        .where(eq(claims.id, claimId));

      const revisionRow: ClaimRevisionInsert = {
        claimId,
        locationId,
        fromState: claimRow.state,
        toState: "PAID",
        reason: `ERA 835 auto-post: paid $${clp.paidAmount.toFixed(2)}`,
        snapshot: { remittanceId, paidAmount: clp.paidAmount },
      };
      await db.insert(claimRevisions).values(revisionRow);
    }

    emitEvent("claim:remittance:posted", {
      claimId,
      remittanceId,
      paidAmount: clp.paidAmount,
      locationId,
    });
  }

  private async _routeToExceptionQueue(
    remittanceId: string,
    clp: ParsedClpLoop,
    locationId: string,
    reason: string,
  ): Promise<void> {
    await db.insert(unmatchedRemittances).values({
      remittanceId,
      locationId,
      rawClpData: clp as unknown as Record<string, unknown>,
      matchAttemptDetails: { reason, icnAttempted: clp.icn, payerClaimNumber: clp.payerClaimNumber },
      patientControlNumber: clp.patientControlNumber,
      payerClaimNumber: clp.payerClaimNumber,
      paidAmount: clp.paidAmount.toFixed(2),
    });
  }

  // ── List ────────────────────────────────────────────────────────────────────

  async listRemittances(locationId: string, query: RemittanceListQuery) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const offset = (page - 1) * pageSize;

    const conditions = [eq(remittances835.locationId, locationId)];
    if (query.status) conditions.push(eq(remittances835.status, query.status));

    const [rows, [countRow]] = await Promise.all([
      db
        .select()
        .from(remittances835)
        .where(and(...conditions))
        .orderBy(desc(remittances835.ingestedAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(remittances835)
        .where(and(...conditions)),
    ]);

    return { data: rows, total: countRow?.count ?? 0 };
  }

  // ── Detail ──────────────────────────────────────────────────────────────────

  async getRemittanceDetail(id: string, locationId: string) {
    const [row] = await db
      .select()
      .from(remittances835)
      .where(and(eq(remittances835.id, id), eq(remittances835.locationId, locationId)))
      .limit(1);

    if (!row) return null;

    const [postings, unmatchedItems] = await Promise.all([
      db
        .select()
        .from(remittancePostings)
        .where(eq(remittancePostings.remittanceId, id))
        .orderBy(desc(remittancePostings.createdAt)),
      db
        .select()
        .from(unmatchedRemittances)
        .where(eq(unmatchedRemittances.remittanceId, id))
        .orderBy(desc(unmatchedRemittances.createdAt)),
    ]);

    return { ...row, postings, unmatchedItems };
  }

  // ── Unmatched exception queue ───────────────────────────────────────────────

  async listUnmatched(locationId: string, page = 1, pageSize = 25) {
    const offset = (page - 1) * pageSize;
    const condition = and(
      eq(unmatchedRemittances.locationId, locationId),
      isNull(unmatchedRemittances.resolvedAt),
    );

    const [rows, [countRow]] = await Promise.all([
      db
        .select()
        .from(unmatchedRemittances)
        .where(condition)
        .orderBy(desc(unmatchedRemittances.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(unmatchedRemittances)
        .where(condition),
    ]);

    return { data: rows, total: countRow?.count ?? 0 };
  }

  // ── Manual match ────────────────────────────────────────────────────────────

  async manualMatch(
    unmatchedId: string,
    locationId: string,
    body: ManualMatchBody,
    userId: string,
  ): Promise<void> {
    const [row] = await db
      .select()
      .from(unmatchedRemittances)
      .where(
        and(
          eq(unmatchedRemittances.id, unmatchedId),
          eq(unmatchedRemittances.locationId, locationId),
          isNull(unmatchedRemittances.resolvedAt),
        ),
      )
      .limit(1);

    if (!row) throw new UnmatchedRemittanceNotFoundError(unmatchedId);

    // Verify the target claim exists and belongs to this location
    const [claimRow] = await db
      .select({ id: claims.id, locationId: claims.locationId })
      .from(claims)
      .where(and(eq(claims.id, body.claimId), eq(claims.locationId, locationId)))
      .limit(1);

    if (!claimRow) throw new ClaimNotFoundForMatchError(body.claimId);

    await db
      .update(unmatchedRemittances)
      .set({
        matchedClaimId: body.claimId,
        assignedTo: userId,
        updatedAt: new Date(),
      })
      .where(eq(unmatchedRemittances.id, unmatchedId));
  }

  // ── Manual post ─────────────────────────────────────────────────────────────

  async manualPost(
    unmatchedId: string,
    locationId: string,
    userId: string,
  ): Promise<void> {
    const [row] = await db
      .select()
      .from(unmatchedRemittances)
      .where(
        and(
          eq(unmatchedRemittances.id, unmatchedId),
          eq(unmatchedRemittances.locationId, locationId),
          isNull(unmatchedRemittances.resolvedAt),
        ),
      )
      .limit(1);

    if (!row) throw new UnmatchedRemittanceNotFoundError(unmatchedId);
    if (!row.matchedClaimId) throw new UnmatchedNotYetMatchedError(unmatchedId);

    // Reconstruct a minimal CLP-like structure from stored raw data
    const clp = row.rawClpData as ParsedClpLoop;

    await this._autoPost(row.remittanceId, clp, row.matchedClaimId, locationId, userId);

    await db
      .update(unmatchedRemittances)
      .set({
        resolvedAt: new Date(),
        resolvedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(unmatchedRemittances.id, unmatchedId));
  }

  // ── Claim remittance view ───────────────────────────────────────────────────

  async getClaimRemittance(claimId: string, locationId: string) {
    const postings = await db
      .select()
      .from(remittancePostings)
      .where(
        and(
          eq(remittancePostings.claimId, claimId),
          eq(remittancePostings.locationId, locationId),
        ),
      )
      .orderBy(desc(remittancePostings.createdAt));

    const totalPaid = postings.reduce((s, p) => s + Number(p.paidAmount), 0);
    const totalContractual = postings.reduce((s, p) => s + Number(p.contractualAdjustment), 0);
    const totalPatient = postings.reduce((s, p) => s + Number(p.patientResponsibility), 0);

    return {
      postings,
      totalPaid: totalPaid.toFixed(2),
      totalContractualAdjustment: totalContractual.toFixed(2),
      totalPatientResponsibility: totalPatient.toFixed(2),
    };
  }

  // ── Daily reconciliation scan ───────────────────────────────────────────────

  /**
   * Flags remittances ingested >48h ago that still have unresolved items.
   * Called by the era-reconciliation BullMQ worker (cron 0 7 * * *).
   */
  async reconciliationScan(): Promise<{ flagged: number }> {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

    // Find remittances with outstanding unmatched items older than 48h
    const staleRows = await db
      .select({ id: unmatchedRemittances.remittanceId, locationId: unmatchedRemittances.locationId })
      .from(unmatchedRemittances)
      .where(
        and(
          isNull(unmatchedRemittances.resolvedAt),
          sql`${unmatchedRemittances.createdAt} < ${cutoff.toISOString()}`,
        ),
      );

    for (const row of staleRows) {
      emitEvent("claim:remittance:stale", {
        remittanceId: row.id,
        locationId: row.locationId,
        message: "Unmatched remittance items older than 48h",
      });
    }

    this.log.info({ flagged: staleRows.length }, "era835: reconciliation scan complete");
    return { flagged: staleRows.length };
  }
}

// ── Custom errors ─────────────────────────────────────────────────────────────

export class ERA835ParseError extends Error {
  readonly statusCode = 422;
  constructor(message: string) {
    super(message);
    this.name = "ERA835ParseError";
  }
}

export class ERA835IngestError extends Error {
  readonly statusCode = 500;
  constructor(message: string) {
    super(message);
    this.name = "ERA835IngestError";
  }
}

export class UnmatchedRemittanceNotFoundError extends Error {
  readonly statusCode = 404;
  constructor(id: string) {
    super(`Unmatched remittance not found: ${id}`);
    this.name = "UnmatchedRemittanceNotFoundError";
  }
}

export class UnmatchedNotYetMatchedError extends Error {
  readonly statusCode = 409;
  constructor(id: string) {
    super(`Unmatched remittance ${id} has no matched claim — run manual match first`);
    this.name = "UnmatchedNotYetMatchedError";
  }
}

export class ClaimNotFoundForMatchError extends Error {
  readonly statusCode = 404;
  constructor(claimId: string) {
    super(`Claim not found for manual match: ${claimId}`);
    this.name = "ClaimNotFoundForMatchError";
  }
}
