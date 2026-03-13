/**
 * ClaimAuditService — T3-12
 *
 * Runs 12 CMS-compliance rule groups against a claim, persists the snapshot,
 * drives state transitions, and powers the Bill-Hold Dashboard.
 *
 * Socket.IO events emitted:
 *   billing:audit:failed       — audit engine found BLOCKs
 *   billing:hold:placed        — compliance hold placed via bulkHold
 *   billing:hold:released      — hold released via bulkReleaseHold
 *   billing:override:approved  — supervisor WARN override recorded
 */

import { db } from "@/db/client.js";
import {
  claimAuditSnapshots,
  type ClaimAuditSnapshotInsert,
  type ClaimAuditSnapshotRow,
} from "@/db/schema/claim-audit-snapshots.table.js";
import { billHolds, claimRevisions, claims } from "@/db/schema/claims.table.js";
import type { ClaimRow } from "@/db/schema/claims.table.js";
import { benefitPeriods } from "@/db/schema/benefit-periods.table.js";
import { carePlans } from "@/db/schema/care-plans.table.js";
import { idgMeetings } from "@/db/schema/idg-meetings.table.js";
import { noticesOfElection } from "@/db/schema/noe.table.js";
import { noticesOfTerminationRevocation } from "@/db/schema/notr.table.js";
import { complianceAlerts } from "@/db/schema/compliance-alerts.table.js";
import { logAudit } from "@/contexts/identity/services/audit.service.js";
import { ClaimService } from "./claim.service.js";
import type { HoldBody } from "../schemas/claim.schema.js";
import type { AuditFailure, AuditResult, OverrideTrailEntry } from "../schemas/claimAudit.schema.js";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { FastifyBaseLogger } from "fastify";

// ── Socket.IO event emitter ───────────────────────────────────────────────────

type AuditEventEmitter = {
  emit(event: string, data: unknown): void;
};
let _emitter: AuditEventEmitter | null = null;

export function setClaimAuditEventEmitter(e: AuditEventEmitter): void {
  _emitter = e;
}

function emitAuditEvent(event: string, data: unknown): void {
  _emitter?.emit(event, data);
}

// ── Rule checker return helpers ───────────────────────────────────────────────

function block(
  ruleGroup: string,
  ruleCode: string,
  message: string,
  sourceObject: string,
  remediationCTA: string,
  ownerRole: AuditFailure["ownerRole"],
  opts: { sourceObjectId?: string; sourceField?: string; claimBlocking?: boolean } = {},
): AuditFailure {
  const failure: AuditFailure = {
    ruleGroup,
    ruleCode,
    severity: "BLOCK",
    message,
    sourceObject,
    remediationCTA,
    ownerRole,
    claimBlocking: opts.claimBlocking ?? false,
  };
  if (opts.sourceObjectId !== undefined) failure.sourceObjectId = opts.sourceObjectId;
  if (opts.sourceField !== undefined) failure.sourceField = opts.sourceField;
  return failure;
}

function warn(
  ruleGroup: string,
  ruleCode: string,
  message: string,
  sourceObject: string,
  remediationCTA: string,
  ownerRole: AuditFailure["ownerRole"],
  opts: { sourceObjectId?: string; sourceField?: string } = {},
): AuditFailure {
  const failure: AuditFailure = {
    ruleGroup,
    ruleCode,
    severity: "WARN",
    message,
    sourceObject,
    remediationCTA,
    ownerRole,
    claimBlocking: false,
  };
  if (opts.sourceObjectId !== undefined) failure.sourceObjectId = opts.sourceObjectId;
  if (opts.sourceField !== undefined) failure.sourceField = opts.sourceField;
  return failure;
}

// ── Rule Group 1: Election and NOE ───────────────────────────────────────────

async function checkElectionAndNoe(claim: ClaimRow): Promise<AuditFailure[]> {
  const failures: AuditFailure[] = [];

  if (!claim.patientId) {
    failures.push(
      block(
        "ELECTION_AND_NOE",
        "NOE_PATIENT_ID_MISSING",
        "Claim is missing a patient reference.",
        "claims",
        "Associate a patient before submitting this claim.",
        "billing",
        { sourceField: "patient_id", claimBlocking: true },
      ),
    );
  }

  if (!claim.payerId || claim.payerId.trim() === "") {
    failures.push(
      block(
        "ELECTION_AND_NOE",
        "NOE_PAYER_ID_MISSING",
        "Claim payer ID is empty — cannot route to clearinghouse.",
        "claims",
        "Select the correct payer in claim settings.",
        "billing",
        { sourceField: "payer_id", claimBlocking: true },
      ),
    );
  }

  // Check if there is a claim-blocking NOE for this patient
  const noeRows = await db
    .select({ id: noticesOfElection.id, isClaimBlocking: noticesOfElection.isClaimBlocking })
    .from(noticesOfElection)
    .where(
      and(
        eq(noticesOfElection.patientId, claim.patientId),
        eq(noticesOfElection.isClaimBlocking, true),
      ),
    )
    .limit(1);

  if (noeRows.length > 0 && noeRows[0]) {
    failures.push(
      block(
        "ELECTION_AND_NOE",
        "NOE_IS_CLAIM_BLOCKING",
        "Patient's Notice of Election is in a claim-blocking state (late or rejected).",
        "notices_of_election",
        "Resolve NOE filing issues before submitting this claim.",
        "billing",
        { sourceObjectId: noeRows[0].id, claimBlocking: true },
      ),
    );
  }

  return failures;
}

// ── Rule Group 2: Benefit Period and Recertification ────────────────────────

async function checkBenefitPeriodAndRecert(claim: ClaimRow): Promise<AuditFailure[]> {
  const failures: AuditFailure[] = [];

  if (!claim.benefitPeriodId) {
    failures.push(
      block(
        "BENEFIT_PERIOD_AND_RECERT",
        "BENEFIT_PERIOD_MISSING",
        "Claim has no benefit period assigned.",
        "claims",
        "Assign a benefit period to this claim before auditing.",
        "billing",
        { sourceField: "benefit_period_id", claimBlocking: true },
      ),
    );
    return failures;
  }

  const periodRows = await db
    .select({
      id: benefitPeriods.id,
      status: benefitPeriods.status,
      recertStatus: benefitPeriods.recertStatus,
      billingRisk: benefitPeriods.billingRisk,
      billingRiskReason: benefitPeriods.billingRiskReason,
    })
    .from(benefitPeriods)
    .where(eq(benefitPeriods.id, claim.benefitPeriodId))
    .limit(1);

  const period = periodRows[0];
  if (!period) {
    failures.push(
      block(
        "BENEFIT_PERIOD_AND_RECERT",
        "BENEFIT_PERIOD_NOT_FOUND",
        "Referenced benefit period does not exist.",
        "benefit_periods",
        "Verify the benefit period ID and relink the claim.",
        "billing",
        { sourceObjectId: claim.benefitPeriodId, claimBlocking: true },
      ),
    );
    return failures;
  }

  if (period.status === "past_due" || period.status === "revoked") {
    failures.push(
      block(
        "BENEFIT_PERIOD_AND_RECERT",
        "BENEFIT_PERIOD_INVALID_STATUS",
        `Benefit period status is '${period.status}' — claim cannot be submitted.`,
        "benefit_periods",
        "Correct the benefit period status or void this claim.",
        "billing",
        { sourceObjectId: period.id, sourceField: "status", claimBlocking: true },
      ),
    );
  }

  if (period.recertStatus === "missed") {
    failures.push(
      block(
        "BENEFIT_PERIOD_AND_RECERT",
        "RECERT_STATUS_MISSED",
        "Benefit period recertification was missed — claim is blocked.",
        "benefit_periods",
        "Complete the recertification or discharge the patient.",
        "billing",
        { sourceObjectId: period.id, sourceField: "recert_status", claimBlocking: true },
      ),
    );
  } else if (period.recertStatus === "pending_physician") {
    failures.push(
      warn(
        "BENEFIT_PERIOD_AND_RECERT",
        "RECERT_PENDING_PHYSICIAN",
        "Recertification is awaiting physician signature.",
        "benefit_periods",
        "Follow up with the attending physician to complete recertification.",
        "clinician",
        { sourceObjectId: period.id, sourceField: "recert_status" },
      ),
    );
  }

  if (period.billingRisk) {
    failures.push(
      warn(
        "BENEFIT_PERIOD_AND_RECERT",
        "BENEFIT_PERIOD_BILLING_RISK",
        period.billingRiskReason ?? "Benefit period flagged as billing risk.",
        "benefit_periods",
        "Review billing risk reason and resolve before submitting.",
        "supervisor",
        { sourceObjectId: period.id, sourceField: "billing_risk" },
      ),
    );
  }

  return failures;
}

// ── Rule Group 3: F2F and Certification ──────────────────────────────────────

async function checkF2FAndCertification(claim: ClaimRow): Promise<AuditFailure[]> {
  const failures: AuditFailure[] = [];

  if (!claim.benefitPeriodId) return failures;

  const periodRows = await db
    .select({
      id: benefitPeriods.id,
      periodNumber: benefitPeriods.periodNumber,
      f2fRequired: benefitPeriods.f2fRequired,
      f2fStatus: benefitPeriods.f2fStatus,
    })
    .from(benefitPeriods)
    .where(eq(benefitPeriods.id, claim.benefitPeriodId))
    .limit(1);

  const period = periodRows[0];
  if (!period) return failures;

  // F2F is required only from period 3 onward
  if (period.periodNumber < 3) return failures;

  if (period.f2fRequired && period.f2fStatus === "missing") {
    failures.push(
      block(
        "F2F_AND_CERTIFICATION",
        "F2F_DOC_MISSING",
        "Face-to-face encounter documentation is required but missing for this benefit period.",
        "benefit_periods",
        "Document the face-to-face encounter before recertification.",
        "physician",
        { sourceObjectId: period.id, sourceField: "f2f_status", claimBlocking: true },
      ),
    );
  } else if (period.f2fRequired && period.f2fStatus === "invalid") {
    failures.push(
      block(
        "F2F_AND_CERTIFICATION",
        "F2F_DOC_INVALID",
        "Face-to-face encounter documentation failed CMS validity rules.",
        "benefit_periods",
        "Correct the F2F encounter date or provider — it must be within 30 days prior to recertification.",
        "physician",
        { sourceObjectId: period.id, sourceField: "f2f_status", claimBlocking: true },
      ),
    );
  } else if (period.f2fRequired && period.f2fStatus === "due_soon") {
    failures.push(
      warn(
        "F2F_AND_CERTIFICATION",
        "F2F_DUE_SOON",
        "Face-to-face encounter documentation is due soon.",
        "benefit_periods",
        "Schedule and document the face-to-face encounter promptly.",
        "clinician",
        { sourceObjectId: period.id, sourceField: "f2f_status" },
      ),
    );
  } else if (period.f2fRequired && period.f2fStatus === "recert_blocked") {
    failures.push(
      block(
        "F2F_AND_CERTIFICATION",
        "F2F_RECERT_BLOCKED",
        "Recertification is blocked pending valid face-to-face encounter.",
        "benefit_periods",
        "Provide valid F2F documentation before completing recertification.",
        "physician",
        { sourceObjectId: period.id, sourceField: "f2f_status", claimBlocking: true },
      ),
    );
  }

  return failures;
}

// ── Rule Group 4: Signed Orders and Plan of Care ─────────────────────────────

async function checkSignedOrdersAndPlanOfCare(claim: ClaimRow): Promise<AuditFailure[]> {
  const failures: AuditFailure[] = [];

  // Check care plan exists for this patient
  const carePlanRows = await db
    .select({ id: carePlans.id })
    .from(carePlans)
    .where(
      and(eq(carePlans.patientId, claim.patientId), eq(carePlans.locationId, claim.locationId)),
    )
    .limit(1);

  if (carePlanRows.length === 0) {
    failures.push(
      block(
        "SIGNED_ORDERS_AND_POC",
        "CARE_PLAN_MISSING",
        "No plan of care found for this patient.",
        "care_plans",
        "Create and complete the plan of care before submitting the claim.",
        "clinician",
        { claimBlocking: true },
      ),
    );
  }

  // Signed orders check — stub: orders domain not yet fully implemented
  // Future: query orders table for unsigned orders within claim statement period
  failures.push(
    warn(
      "SIGNED_ORDERS_AND_POC",
      "SIGNED_ORDERS_STUB",
      "Signed orders verification is pending orders module implementation.",
      "orders",
      "Manually verify that all orders covering this claim period are signed.",
      "clinician",
    ),
  );

  return failures;
}

// ── Rule Group 5: Visit Completeness ─────────────────────────────────────────

async function checkVisitCompleteness(claim: ClaimRow): Promise<AuditFailure[]> {
  const failures: AuditFailure[] = [];

  // Check IDG meeting occurred in the last 15 days
  const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);

  const idgRows = await db
    .select({ id: idgMeetings.id })
    .from(idgMeetings)
    .where(
      and(
        eq(idgMeetings.patientId, claim.patientId),
        eq(idgMeetings.locationId, claim.locationId),
        gte(idgMeetings.scheduledAt, fifteenDaysAgo),
      ),
    )
    .limit(1);

  if (idgRows.length === 0) {
    failures.push(
      warn(
        "VISIT_COMPLETENESS",
        "IDG_MEETING_OVERDUE",
        "No IDG meeting found within the last 15 days for this patient.",
        "idg_meetings",
        "Schedule and complete an IDG meeting to satisfy 42 CFR §418.56.",
        "clinician",
      ),
    );
  }

  return failures;
}

// ── Rule Group 6: Discharge and NOTR ─────────────────────────────────────────

async function checkDischargeAndNotr(claim: ClaimRow): Promise<AuditFailure[]> {
  const failures: AuditFailure[] = [];

  const notrRows = await db
    .select({
      id: noticesOfTerminationRevocation.id,
      isClaimBlocking: noticesOfTerminationRevocation.isClaimBlocking,
    })
    .from(noticesOfTerminationRevocation)
    .where(
      and(
        eq(noticesOfTerminationRevocation.patientId, claim.patientId),
        eq(noticesOfTerminationRevocation.isClaimBlocking, true),
      ),
    )
    .limit(1);

  if (notrRows.length > 0 && notrRows[0]) {
    failures.push(
      block(
        "DISCHARGE_AND_NOTR",
        "NOTR_IS_CLAIM_BLOCKING",
        "Patient has a claim-blocking Notice of Termination/Revocation.",
        "notices_of_termination_revocation",
        "Resolve NOTR filing issues before submitting claims for this patient.",
        "billing",
        { sourceObjectId: notrRows[0].id, claimBlocking: true },
      ),
    );
  }

  return failures;
}

// ── Rule Group 7: Claim Lines and Revenue Codes ───────────────────────────────

async function checkClaimLineAndRevenueCode(claim: ClaimRow): Promise<AuditFailure[]> {
  const failures: AuditFailure[] = [];

  const lines = claim.claimLines as Array<{ revenueCode?: string; lineCharge?: number }>;

  if (!Array.isArray(lines) || lines.length === 0) {
    failures.push(
      block(
        "CLAIM_LINE_AND_REVENUE_CODE",
        "CLAIM_LINES_EMPTY",
        "Claim has no line items — UB-04 requires at least one revenue code line.",
        "claims",
        "Add claim lines with valid revenue codes before submitting.",
        "billing",
        { sourceField: "claim_lines", claimBlocking: true },
      ),
    );
    return failures;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line?.revenueCode || line.revenueCode.trim() === "") {
      failures.push(
        block(
          "CLAIM_LINE_AND_REVENUE_CODE",
          "REVENUE_CODE_MISSING",
          `Claim line ${i + 1} is missing a revenue code.`,
          "claims",
          `Assign a 4-digit revenue code to line ${i + 1}.`,
          "billing",
          { sourceField: `claim_lines[${i}].revenueCode`, claimBlocking: true },
        ),
      );
    }
  }

  return failures;
}

// ── Rule Group 8: Level of Care and Continuous Care ──────────────────────────

async function checkLevelOfCareAndContinuousCare(claim: ClaimRow): Promise<AuditFailure[]> {
  const failures: AuditFailure[] = [];

  const totalCharge = Number.parseFloat(claim.totalCharge ?? "0");

  if (totalCharge <= 0) {
    failures.push(
      block(
        "LEVEL_OF_CARE_AND_CC",
        "TOTAL_CHARGE_ZERO",
        "Claim total charge is zero — UB-04 requires a non-zero total charge.",
        "claims",
        "Verify claim line charges sum to a positive amount.",
        "billing",
        { sourceField: "total_charge", claimBlocking: true },
      ),
    );
  }

  const lines = claim.claimLines as Array<{ levelOfCare?: string | null }>;
  if (Array.isArray(lines)) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line && line.levelOfCare === undefined) {
        failures.push(
          block(
            "LEVEL_OF_CARE_AND_CC",
            "LEVEL_OF_CARE_MISSING",
            `Claim line ${i + 1} is missing a level-of-care code.`,
            "claims",
            `Assign the appropriate level of care (routine, CHC, GIP, respite) to line ${i + 1}.`,
            "billing",
            { sourceField: `claim_lines[${i}].levelOfCare`, claimBlocking: true },
          ),
        );
      }
    }
  }

  return failures;
}

// ── Rule Group 9: Payer and Timely Filing ─────────────────────────────────────

async function checkPayerAndTimelyFiling(claim: ClaimRow): Promise<AuditFailure[]> {
  const failures: AuditFailure[] = [];

  if (!claim.payerId || claim.payerId.trim() === "") {
    failures.push(
      block(
        "PAYER_AND_TIMELY_FILING",
        "PAYER_ID_MISSING",
        "No payer ID assigned — cannot determine timely filing window.",
        "claims",
        "Select the payer before submitting.",
        "billing",
        { sourceField: "payer_id", claimBlocking: true },
      ),
    );
  }

  // Standard timely filing window is 365 days from statement from date
  if (claim.statementFromDate) {
    const fromDate = new Date(claim.statementFromDate);
    const now = new Date();
    const daysDiff = Math.floor((now.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));

    if (daysDiff > 365) {
      failures.push(
        block(
          "PAYER_AND_TIMELY_FILING",
          "TIMELY_FILING_EXCEEDED",
          `Statement from date is ${daysDiff} days ago — exceeds standard 365-day timely filing window.`,
          "claims",
          "Check payer-specific timely filing rules and obtain a timely filing exception if needed.",
          "billing",
          { sourceField: "statement_from_date", claimBlocking: true },
        ),
      );
    } else if (daysDiff > 300) {
      failures.push(
        warn(
          "PAYER_AND_TIMELY_FILING",
          "TIMELY_FILING_AT_RISK",
          `Statement from date is ${daysDiff} days ago — approaching 365-day timely filing limit.`,
          "claims",
          "Submit this claim promptly to avoid timely filing denial.",
          "billing",
          { sourceField: "statement_from_date" },
        ),
      );
    }
  }

  return failures;
}

// ── Rule Group 10: Duplicate and Sequential Billing ──────────────────────────

async function checkDuplicateAndSequentialBilling(claim: ClaimRow): Promise<AuditFailure[]> {
  const failures: AuditFailure[] = [];

  // Detect duplicate: same patient + overlapping statement dates + same location + not voided
  const duplicates = await db
    .select({ id: claims.id, state: claims.state })
    .from(claims)
    .where(
      and(
        eq(claims.patientId, claim.patientId),
        eq(claims.locationId, claim.locationId),
        sql`claims.state NOT IN ('VOIDED', 'DRAFT')`,
        sql`claims.id <> ${claim.id}`,
        // Overlapping date check: existingFrom <= claimTo AND existingTo >= claimFrom
        sql`claims.statement_from_date <= ${claim.statementToDate}`,
        sql`claims.statement_to_date >= ${claim.statementFromDate}`,
      ),
    )
    .limit(1);

  if (duplicates.length > 0 && duplicates[0]) {
    failures.push(
      block(
        "DUPLICATE_AND_SEQUENTIAL_BILLING",
        "DUPLICATE_CLAIM_DETECTED",
        `Duplicate claim detected — claim ${duplicates[0].id} covers the same patient and overlapping statement dates.`,
        "claims",
        "Void or correct the duplicate claim before submitting this one.",
        "billing",
        { sourceObjectId: duplicates[0].id, claimBlocking: true },
      ),
    );
  }

  return failures;
}

// ── Rule Group 11: CAP and Compliance Risk ────────────────────────────────────

async function checkCapAndComplianceRisk(claim: ClaimRow): Promise<AuditFailure[]> {
  const failures: AuditFailure[] = [];

  // Check for CAP_PROJECTED_OVERAGE alert for this location
  const capAlerts = await db
    .select({ id: complianceAlerts.id, type: complianceAlerts.type })
    .from(complianceAlerts)
    .where(
      and(
        eq(complianceAlerts.locationId, claim.locationId),
        eq(complianceAlerts.type, "CAP_PROJECTED_OVERAGE"),
        sql`compliance_alerts.status NOT IN ('resolved')`,
      ),
    )
    .limit(1);

  if (capAlerts.length > 0 && capAlerts[0]) {
    failures.push(
      warn(
        "CAP_AND_COMPLIANCE_RISK",
        "CAP_PROJECTED_OVERAGE_ACTIVE",
        "Location has an active CAP projected overage alert — review before billing.",
        "compliance_alerts",
        "Review cap utilization and consider whether to hold this claim pending cap analysis.",
        "supervisor",
        { sourceObjectId: capAlerts[0].id },
      ),
    );
  }

  // Check benefit period billing risk flag
  if (claim.benefitPeriodId) {
    const periodRows = await db
      .select({ id: benefitPeriods.id, billingRisk: benefitPeriods.billingRisk })
      .from(benefitPeriods)
      .where(eq(benefitPeriods.id, claim.benefitPeriodId))
      .limit(1);

    const period = periodRows[0];
    if (period?.billingRisk) {
      failures.push(
        warn(
          "CAP_AND_COMPLIANCE_RISK",
          "BENEFIT_PERIOD_BILLING_RISK_CAP",
          "Associated benefit period has a billing risk flag that may affect CAP compliance.",
          "benefit_periods",
          "Review CAP exposure before submitting.",
          "supervisor",
          { sourceObjectId: period.id },
        ),
      );
    }
  }

  return failures;
}

// ── Rule Group 12: Remittance / Denial Follow-up ─────────────────────────────

async function checkRemittanceOrDenialFollowUp(_claim: ClaimRow): Promise<AuditFailure[]> {
  // No-op until T3-7b ERA reconciliation data is available in the audit context.
  return [];
}

// ── ClaimAuditService ─────────────────────────────────────────────────────────

// biome-ignore lint/complexity/noStaticOnlyClass: service namespace pattern
export class ClaimAuditService {
  /**
   * Run all 12 rule groups against a claim, persist the snapshot,
   * trigger state transitions, and emit Socket.IO events.
   */
  static async runAudit(
    claimId: string,
    locationId: string,
    auditedBy: string,
    log: FastifyBaseLogger,
  ): Promise<AuditResult> {
    // 1. Fetch claim
    const claimRows = await db
      .select()
      .from(claims)
      .where(and(eq(claims.id, claimId), eq(claims.locationId, locationId)))
      .limit(1);

    const claim = claimRows[0];
    if (!claim) {
      throw Object.assign(new Error(`Claim ${claimId} not found`), { statusCode: 404 });
    }

    // 2. Run all 12 rule groups in parallel
    const [
      r1,
      r2,
      r3,
      r4,
      r5,
      r6,
      r7,
      r8,
      r9,
      r10,
      r11,
      r12,
    ] = await Promise.all([
      checkElectionAndNoe(claim),
      checkBenefitPeriodAndRecert(claim),
      checkF2FAndCertification(claim),
      checkSignedOrdersAndPlanOfCare(claim),
      checkVisitCompleteness(claim),
      checkDischargeAndNotr(claim),
      checkClaimLineAndRevenueCode(claim),
      checkLevelOfCareAndContinuousCare(claim),
      checkPayerAndTimelyFiling(claim),
      checkDuplicateAndSequentialBilling(claim),
      checkCapAndComplianceRisk(claim),
      checkRemittanceOrDenialFollowUp(claim),
    ]);

    const failures = [r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12].flat();

    const blockCount = failures.filter((f) => f.severity === "BLOCK").length;
    const warnCount = failures.filter((f) => f.severity === "WARN").length;
    const passed = blockCount === 0;

    log.info(
      { claimId, passed, blockCount, warnCount },
      "claim:audit:run",
    );

    // 3. Persist snapshot + optional revision in a transaction
    const snapshotId = crypto.randomUUID();

    await db.transaction(async (tx) => {
      const insertData: ClaimAuditSnapshotInsert = {
        id: snapshotId,
        claimId,
        claimRevisionId: null,
        locationId,
        passed,
        blockCount,
        warnCount,
        failures: failures as unknown as Record<string, unknown>[],
        overrideTrail: [],
        auditedBy,
      };

      await tx.insert(claimAuditSnapshots).values(insertData);

      await logAudit(
        "view",
        auditedBy,
        claim.patientId,
        {
          userRole: "billing",
          locationId,
          resourceType: "claim",
          resourceId: claimId,
          details: { action: "audit_run", passed, blockCount, warnCount },
        },
        tx,
      );
    });

    // 4. Place compliance holds for claimBlocking failures
    const claimBlockingFailures = failures.filter((f) => f.claimBlocking);
    if (claimBlockingFailures.length > 0 && !claim.isOnHold) {
      try {
        const holdBody: HoldBody = {
          reason: "COMPLIANCE_BLOCK",
          holdNote: `Audit engine: ${claimBlockingFailures.map((f) => f.ruleCode).join(", ")}`,
        };
        await ClaimService.holdClaim(claimId, holdBody, auditedBy, locationId);

        emitAuditEvent("billing:hold:placed", {
          claimId,
          patientId: claim.patientId,
          locationId,
          holdReason: "COMPLIANCE_BLOCK",
          placedBy: auditedBy,
        });
      } catch (err) {
        // Non-fatal: log and continue — hold may already be active
        log.warn({ claimId, err }, "claim:audit:hold:skipped");
      }
    }

    // 5. State transition
    try {
      if (!passed) {
        await ClaimService.transitionState(
          claimId,
          "AUDIT_FAILED",
          auditedBy,
          locationId,
          `Audit failed: ${blockCount} block(s)`,
          log,
        );
      } else {
        await ClaimService.transitionState(
          claimId,
          "READY_TO_SUBMIT",
          auditedBy,
          locationId,
          "Audit passed — all rule groups clear",
          log,
        );
      }
    } catch (err) {
      // Transition may be invalid from current state — log and continue
      log.warn({ claimId, passed, err }, "claim:audit:transition:skipped");
    }

    // 6. Emit event on failure
    if (!passed) {
      emitAuditEvent("billing:audit:failed", {
        claimId,
        patientId: claim.patientId,
        locationId,
        blockCount,
        warnCount,
      });
    }

    return {
      snapshotId,
      claimId,
      locationId,
      auditedAt: new Date().toISOString(),
      passed,
      blockCount,
      warnCount,
      failures,
    };
  }

  // ── getLatestSnapshot ──────────────────────────────────────────────────────

  static async getLatestSnapshot(
    claimId: string,
    locationId: string,
  ): Promise<ClaimAuditSnapshotRow | null> {
    const rows = await db
      .select()
      .from(claimAuditSnapshots)
      .where(
        and(
          eq(claimAuditSnapshots.claimId, claimId),
          eq(claimAuditSnapshots.locationId, locationId),
        ),
      )
      .orderBy(desc(claimAuditSnapshots.auditedAt))
      .limit(1);

    return rows[0] ?? null;
  }

  // ── getSnapshotHistory ─────────────────────────────────────────────────────

  static async getSnapshotHistory(
    claimId: string,
    locationId: string,
  ): Promise<ClaimAuditSnapshotRow[]> {
    return db
      .select()
      .from(claimAuditSnapshots)
      .where(
        and(
          eq(claimAuditSnapshots.claimId, claimId),
          eq(claimAuditSnapshots.locationId, locationId),
        ),
      )
      .orderBy(desc(claimAuditSnapshots.auditedAt));
  }

  // ── overrideWarn ───────────────────────────────────────────────────────────

  static async overrideWarn(
    snapshotId: string,
    ruleCode: string,
    reason: string,
    overriddenBy: string,
    claimId: string,
    locationId: string,
    log: FastifyBaseLogger,
  ): Promise<ClaimAuditSnapshotRow> {
    // Verify snapshot exists and belongs to this location
    const snapshotRows = await db
      .select()
      .from(claimAuditSnapshots)
      .where(
        and(
          eq(claimAuditSnapshots.id, snapshotId),
          eq(claimAuditSnapshots.locationId, locationId),
        ),
      )
      .limit(1);

    const snapshot = snapshotRows[0];
    if (!snapshot) {
      throw Object.assign(new Error(`Snapshot ${snapshotId} not found`), { statusCode: 404 });
    }

    const entry: OverrideTrailEntry = {
      ruleCode,
      reason,
      overriddenBy,
      overriddenAt: new Date().toISOString(),
    };

    const existingTrail = (snapshot.overrideTrail as OverrideTrailEntry[]) ?? [];
    const newTrail = [...existingTrail, entry];

    const updated = await db.transaction(async (tx) => {
      const rows = await tx
        .update(claimAuditSnapshots)
        .set({ overrideTrail: newTrail as unknown as Record<string, unknown>[] })
        .where(eq(claimAuditSnapshots.id, snapshotId))
        .returning();

      const row = rows[0];
      if (!row) throw new Error("Failed to update snapshot override trail");

      await logAudit(
        "update",
        overriddenBy,
        null,
        {
          userRole: "supervisor",
          locationId,
          resourceType: "claim_audit_snapshot",
          resourceId: snapshotId,
          details: { action: "warn_override", ruleCode, claimId },
        },
        tx,
      );

      return row;
    });

    log.info({ snapshotId, ruleCode, overriddenBy }, "claim:audit:override");

    emitAuditEvent("billing:override:approved", {
      claimId,
      patientId: snapshot.claimId,
      locationId,
      ruleCode,
      overriddenBy,
    });

    // Check if all remaining BLOCKs have been overridden — if so, transition to READY_TO_SUBMIT
    const failures = (snapshot.failures as AuditFailure[]) ?? [];
    const remainingBlockRuleCodes = failures
      .filter((f) => f.severity === "BLOCK")
      .map((f) => f.ruleCode);
    const overriddenRuleCodes = new Set(newTrail.map((t) => t.ruleCode));
    const allBlocksOverridden = remainingBlockRuleCodes.every((rc) => overriddenRuleCodes.has(rc));

    if (allBlocksOverridden && remainingBlockRuleCodes.length > 0) {
      try {
        await ClaimService.transitionState(
          claimId,
          "READY_TO_SUBMIT",
          overriddenBy,
          locationId,
          "All audit blocks overridden by supervisor",
          log,
        );
      } catch (err) {
        log.warn({ claimId, err }, "claim:audit:override:transition:skipped");
      }
    }

    return updated;
  }

  // ── bulkHold ──────────────────────────────────────────────────────────────

  static async bulkHold(
    claimIds: string[],
    holdReason: string,
    userId: string,
    locationId: string,
    log: FastifyBaseLogger,
  ): Promise<{ held: string[]; skipped: string[] }> {
    const held: string[] = [];
    const skipped: string[] = [];

    await db.transaction(async (tx) => {
      for (const claimId of claimIds) {
        const claimRows = await tx
          .select({ id: claims.id, patientId: claims.patientId, isOnHold: claims.isOnHold })
          .from(claims)
          .where(and(eq(claims.id, claimId), eq(claims.locationId, locationId)))
          .limit(1);

        const claim = claimRows[0];
        if (!claim || claim.isOnHold) {
          skipped.push(claimId);
          continue;
        }

        await tx.insert(billHolds).values({
          claimId,
          locationId,
          reason: "MANUAL_REVIEW",
          holdNote: holdReason,
          placedBy: userId,
        });

        await tx
          .update(claims)
          .set({ isOnHold: true, updatedAt: new Date() })
          .where(eq(claims.id, claimId));

        held.push(claimId);

        emitAuditEvent("billing:hold:placed", {
          claimId,
          patientId: claim.patientId,
          locationId,
          holdReason: "MANUAL_REVIEW",
          placedBy: userId,
        });
      }
    });

    log.info({ held: held.length, skipped: skipped.length }, "claim:bulk:hold");
    return { held, skipped };
  }

  // ── bulkReleaseHold ───────────────────────────────────────────────────────

  static async bulkReleaseHold(
    claimIds: string[],
    userId: string,
    locationId: string,
    log: FastifyBaseLogger,
  ): Promise<{ released: string[]; skipped: string[] }> {
    const released: string[] = [];
    const skipped: string[] = [];

    await db.transaction(async (tx) => {
      for (const claimId of claimIds) {
        const claimRows = await tx
          .select({ id: claims.id, patientId: claims.patientId, isOnHold: claims.isOnHold })
          .from(claims)
          .where(and(eq(claims.id, claimId), eq(claims.locationId, locationId)))
          .limit(1);

        const claim = claimRows[0];
        if (!claim || !claim.isOnHold) {
          skipped.push(claimId);
          continue;
        }

        const now = new Date();
        await tx
          .update(billHolds)
          .set({ releasedBy: userId, releasedAt: now })
          .where(
            and(
              eq(billHolds.claimId, claimId),
              eq(billHolds.locationId, locationId),
              isNull(billHolds.releasedAt),
            ),
          );

        await tx
          .update(claims)
          .set({ isOnHold: false, updatedAt: now })
          .where(eq(claims.id, claimId));

        released.push(claimId);

        emitAuditEvent("billing:hold:released", {
          claimId,
          patientId: claim.patientId,
          locationId,
          releasedBy: userId,
        });
      }
    });

    log.info({ released: released.length, skipped: skipped.length }, "claim:bulk:release:hold");
    return { released, skipped };
  }

  // ── getAuditDashboard ─────────────────────────────────────────────────────

  static async getAuditDashboard(locationId: string) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Section 1: Claim status summary
    const statusRows = await db
      .select({ state: claims.state, isOnHold: claims.isOnHold })
      .from(claims)
      .where(eq(claims.locationId, locationId));

    const claimStatusSummary = {
      readyToBill: 0,
      auditFailed: 0,
      onHold: 0,
      draft: 0,
      queued: 0,
      submitted: 0,
    };
    for (const row of statusRows) {
      if (row.isOnHold) claimStatusSummary.onHold++;
      if (row.state === "READY_TO_SUBMIT") claimStatusSummary.readyToBill++;
      else if (row.state === "AUDIT_FAILED") claimStatusSummary.auditFailed++;
      else if (row.state === "DRAFT") claimStatusSummary.draft++;
      else if (row.state === "QUEUED") claimStatusSummary.queued++;
      else if (row.state === "SUBMITTED") claimStatusSummary.submitted++;
    }

    // Section 2: Aging by rule group (from JSONB failures)
    const snapshotRows = await db
      .select({
        failures: claimAuditSnapshots.failures,
        auditedAt: claimAuditSnapshots.auditedAt,
      })
      .from(claimAuditSnapshots)
      .where(
        and(
          eq(claimAuditSnapshots.locationId, locationId),
          eq(claimAuditSnapshots.passed, false),
        ),
      );

    const ruleGroupMap = new Map<
      string,
      { claimCount: number; d0_2: number; d3_7: number; d8_14: number; d14plus: number }
    >();

    for (const snap of snapshotRows) {
      const failures = (snap.failures as AuditFailure[]) ?? [];
      const ageMs = now.getTime() - new Date(snap.auditedAt).getTime();
      const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));

      const seenGroups = new Set<string>();
      for (const f of failures) {
        if (seenGroups.has(f.ruleGroup)) continue;
        seenGroups.add(f.ruleGroup);

        if (!ruleGroupMap.has(f.ruleGroup)) {
          ruleGroupMap.set(f.ruleGroup, { claimCount: 0, d0_2: 0, d3_7: 0, d8_14: 0, d14plus: 0 });
        }
        const entry = ruleGroupMap.get(f.ruleGroup)!;
        entry.claimCount++;
        if (ageDays <= 2) entry.d0_2++;
        else if (ageDays <= 7) entry.d3_7++;
        else if (ageDays <= 14) entry.d8_14++;
        else entry.d14plus++;
      }
    }

    const agingByRuleGroup = Array.from(ruleGroupMap.entries()).map(([ruleGroup, v]) => ({
      ruleGroup,
      claimCount: v.claimCount,
      aging: { d0_2: v.d0_2, d3_7: v.d3_7, d8_14: v.d8_14, d14plus: v.d14plus },
    }));

    // Section 3: Aging by hold reason
    const holdRows = await db
      .select({ reason: billHolds.reason, placedAt: billHolds.placedAt })
      .from(billHolds)
      .where(and(eq(billHolds.locationId, locationId), isNull(billHolds.releasedAt)));

    const holdReasonMap = new Map<
      string,
      { claimCount: number; d0_2: number; d3_7: number; d8_14: number; d14plus: number }
    >();

    for (const hold of holdRows) {
      const ageMs = now.getTime() - new Date(hold.placedAt).getTime();
      const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
      const reason = hold.reason;

      if (!holdReasonMap.has(reason)) {
        holdReasonMap.set(reason, { claimCount: 0, d0_2: 0, d3_7: 0, d8_14: 0, d14plus: 0 });
      }
      const entry = holdReasonMap.get(reason)!;
      entry.claimCount++;
      if (ageDays <= 2) entry.d0_2++;
      else if (ageDays <= 7) entry.d3_7++;
      else if (ageDays <= 14) entry.d8_14++;
      else entry.d14plus++;
    }

    const agingByHoldReason = Array.from(holdReasonMap.entries()).map(([reason, v]) => ({
      reason,
      claimCount: v.claimCount,
      aging: { d0_2: v.d0_2, d3_7: v.d3_7, d8_14: v.d8_14, d14plus: v.d14plus },
    }));

    // Section 4: Aging by branch (locationId)
    // For a single-location context this is a single entry; kept for multi-location API consumers
    const branchClaimRows = await db
      .select({ locationId: claims.locationId, createdAt: claims.createdAt })
      .from(claims)
      .where(and(eq(claims.locationId, locationId), sql`claims.state NOT IN ('VOIDED', 'PAID')`));

    const branchMap = new Map<
      string,
      { claimCount: number; d0_2: number; d3_7: number; d8_14: number; d14plus: number }
    >();

    for (const row of branchClaimRows) {
      const ageMs = now.getTime() - new Date(row.createdAt).getTime();
      const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
      const loc = row.locationId;

      if (!branchMap.has(loc)) {
        branchMap.set(loc, { claimCount: 0, d0_2: 0, d3_7: 0, d8_14: 0, d14plus: 0 });
      }
      const entry = branchMap.get(loc)!;
      entry.claimCount++;
      if (ageDays <= 2) entry.d0_2++;
      else if (ageDays <= 7) entry.d3_7++;
      else if (ageDays <= 14) entry.d8_14++;
      else entry.d14plus++;
    }

    const agingByBranch = Array.from(branchMap.entries()).map(([locId, v]) => ({
      locationId: locId,
      claimCount: v.claimCount,
      aging: { d0_2: v.d0_2, d3_7: v.d3_7, d8_14: v.d8_14, d14plus: v.d14plus },
    }));

    // Section 5: Owner lane queue (from JSONB failures, group by ownerRole)
    const ownerRoleMap = new Map<
      string,
      { claimCount: number; oldestAuditedAt: Date | null }
    >();

    for (const snap of snapshotRows) {
      const failures = (snap.failures as AuditFailure[]) ?? [];
      const auditedAt = new Date(snap.auditedAt);

      const seenRoles = new Set<string>();
      for (const f of failures) {
        if (seenRoles.has(f.ownerRole)) continue;
        seenRoles.add(f.ownerRole);

        if (!ownerRoleMap.has(f.ownerRole)) {
          ownerRoleMap.set(f.ownerRole, { claimCount: 0, oldestAuditedAt: null });
        }
        const entry = ownerRoleMap.get(f.ownerRole)!;
        entry.claimCount++;
        if (!entry.oldestAuditedAt || auditedAt < entry.oldestAuditedAt) {
          entry.oldestAuditedAt = auditedAt;
        }
      }
    }

    const ownerLaneQueue = Array.from(ownerRoleMap.entries()).map(([ownerRole, v]) => ({
      ownerRole,
      claimCount: v.claimCount,
      oldestAuditedAt: v.oldestAuditedAt?.toISOString() ?? null,
    }));

    // Section 6: Top denial drivers — deferred to T3-7b
    const topDenialDrivers = { data: [], availableAfter: "T3-7b" };

    // Section 7: Warn override volume — last 30 days, daily buckets
    const overrideSnapshotRows = await db
      .select({
        overrideTrail: claimAuditSnapshots.overrideTrail,
        auditedAt: claimAuditSnapshots.auditedAt,
      })
      .from(claimAuditSnapshots)
      .where(
        and(
          eq(claimAuditSnapshots.locationId, locationId),
          gte(claimAuditSnapshots.auditedAt, thirtyDaysAgo),
        ),
      );

    const overrideDayMap = new Map<string, number>();

    for (const snap of overrideSnapshotRows) {
      const trail = (snap.overrideTrail as OverrideTrailEntry[]) ?? [];
      for (const entry of trail) {
        const day = entry.overriddenAt.slice(0, 10); // YYYY-MM-DD
        overrideDayMap.set(day, (overrideDayMap.get(day) ?? 0) + 1);
      }
    }

    const warnOverrideVolume = Array.from(overrideDayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, count]) => ({ date, count }));

    return {
      claimStatusSummary,
      agingByRuleGroup,
      agingByHoldReason,
      agingByBranch,
      ownerLaneQueue,
      topDenialDrivers,
      warnOverrideVolume,
    };
  }
}
