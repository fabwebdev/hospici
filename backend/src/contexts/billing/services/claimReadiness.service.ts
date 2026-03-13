/**
 * ClaimReadinessService — T3-7a
 *
 * Evaluates whether a claim is ready for submission by checking 7 clinical/
 * compliance prerequisites. Returns { ready: boolean; blockers: { code, message }[] }.
 *
 * Called by:
 *   - ClaimService.createClaim() — initial assessment on DRAFT creation
 *   - ClaimService.transitionToReadyForAudit() — reassessment before audit
 */

import { db } from "@/db/client.js";
import { benefitPeriods } from "@/db/schema/benefit-periods.table.js";
import type { ClaimRow } from "@/db/schema/claims.table.js";
import { noticesOfElection } from "@/db/schema/noe.table.js";
import { and, asc, eq } from "drizzle-orm";
import type { ClaimReadinessResult } from "../schemas/claim.schema.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface Blocker {
  code: string;
  message: string;
}

/**
 * Check 1 — BENEFIT_PERIOD_BILLING_RISK
 * Block if the associated benefit period has billingRisk === true.
 */
async function checkBenefitPeriodBillingRisk(claim: ClaimRow): Promise<Blocker[]> {
  if (!claim.benefitPeriodId) {
    return [];
  }

  const [period] = await db
    .select({ billingRisk: benefitPeriods.billingRisk })
    .from(benefitPeriods)
    .where(eq(benefitPeriods.id, claim.benefitPeriodId))
    .limit(1);

  if (period?.billingRisk === true) {
    return [
      {
        code: "BENEFIT_PERIOD_BILLING_RISK",
        message:
          "The associated benefit period is flagged as a billing risk. Resolve the risk before submitting.",
      },
    ];
  }

  return [];
}

/**
 * Check 2 — NOE_CLAIM_BLOCKING
 * Block if the Notice of Election for the patient/benefit period has isClaimBlocking === true.
 */
async function checkNoeClaimBlocking(claim: ClaimRow): Promise<Blocker[]> {
  if (!claim.benefitPeriodId) {
    return [];
  }

  // NOE is linked by patientId only — find the most recent accepted NOE for this patient
  const [noe] = await db
    .select({ isClaimBlocking: noticesOfElection.isClaimBlocking })
    .from(noticesOfElection)
    .where(eq(noticesOfElection.patientId, claim.patientId))
    .orderBy(asc(noticesOfElection.createdAt))
    .limit(1);

  if (noe?.isClaimBlocking === true) {
    return [
      {
        code: "NOE_CLAIM_BLOCKING",
        message:
          "The Notice of Election is flagged as claim-blocking. Resolve the NOE issue before submitting.",
      },
    ];
  }

  return [];
}

/**
 * Check 3 — VISIT_FREQUENCY_INCOMPLETE
 * Stub — T2-10 not yet wired. Always returns no blockers.
 *
 * TODO(T2-10): Wire up visit frequency checks once the visit-frequency
 * service is available. Query the visit schedule and compare against
 * the plan of care frequency requirements for statementFromDate–statementToDate.
 */
function checkVisitFrequencyIncomplete(_claim: ClaimRow): Blocker[] {
  return [];
}

/**
 * Check 4 — UNSIGNED_ORDERS
 * Stub — exact orders table schema not confirmed.
 *
 * TODO(T3-7a): Implement fully once orders table schema is verified.
 * Should query orders where patientId = claim.patientId and
 * serviceDate BETWEEN statementFromDate AND statementToDate
 * and signedAt IS NULL, then return a blocker if any rows found.
 */
function checkUnsignedOrders(_claim: ClaimRow): Blocker[] {
  return [];
}

/**
 * Check 5 — F2F_NOT_DOCUMENTED
 * Block if the claim's benefit period number is 3 or higher and the NOE
 * f2fStatus is not 'documented'.
 *
 * Face-to-face documentation is required starting with the 3rd benefit period
 * per CMS hospice conditions of participation.
 */
async function checkF2fNotDocumented(claim: ClaimRow): Promise<Blocker[]> {
  if (!claim.benefitPeriodId) {
    return [];
  }

  // F2F status is stored on the benefit period row, not on NOE
  const [period] = await db
    .select({
      periodNumber: benefitPeriods.periodNumber,
      f2fRequired: benefitPeriods.f2fRequired,
      f2fStatus: benefitPeriods.f2fStatus,
    })
    .from(benefitPeriods)
    .where(eq(benefitPeriods.id, claim.benefitPeriodId))
    .limit(1);

  if (!period || period.periodNumber < 3 || !period.f2fRequired) {
    return [];
  }

  if (period.f2fStatus !== "documented") {
    return [
      {
        code: "F2F_NOT_DOCUMENTED",
        message: `Face-to-face encounter documentation is required for benefit period ${period.periodNumber} (period 3+) but is not yet recorded as documented.`,
      },
    ];
  }

  return [];
}

/**
 * Check 6 — HARD_BLOCK_ALERT
 * Stub — exact complianceAlerts table schema not confirmed.
 *
 * TODO(T3-7a): Implement fully once compliance-alerts table schema is verified.
 * Should query complianceAlerts where patientId = claim.patientId
 * and severity = 'HARD_BLOCK' and status = 'active',
 * then return a blocker if any rows found.
 */
function checkHardBlockAlert(_claim: ClaimRow): Blocker[] {
  return [];
}

/**
 * Check 7 — ON_MANUAL_HOLD
 * Block if the claim itself has isOnHold === true.
 */
function checkOnManualHold(claim: ClaimRow): Blocker[] {
  if (claim.isOnHold === true) {
    return [
      {
        code: "ON_MANUAL_HOLD",
        message: "This claim is on manual hold. Remove the hold before submitting.",
      },
    ];
  }

  return [];
}

// ---------------------------------------------------------------------------
// Public service class
// ---------------------------------------------------------------------------

// biome-ignore lint/complexity/noStaticOnlyClass: service namespace pattern
export class ClaimReadinessService {
  /**
   * Evaluates all 7 readiness checks for the given claim row.
   * Returns a ClaimReadinessResult with ready=true only when blockers is empty.
   */
  static async check(claim: ClaimRow): Promise<ClaimReadinessResult> {
    const [benefitPeriodRiskBlockers, noeBlockers, f2fBlockers] = await Promise.all([
      checkBenefitPeriodBillingRisk(claim),
      checkNoeClaimBlocking(claim),
      checkF2fNotDocumented(claim),
    ]);

    // Synchronous checks
    const visitFrequencyBlockers = checkVisitFrequencyIncomplete(claim);
    const unsignedOrdersBlockers = checkUnsignedOrders(claim);
    const hardBlockAlertBlockers = checkHardBlockAlert(claim);
    const manualHoldBlockers = checkOnManualHold(claim);

    const blockers: Blocker[] = [
      ...benefitPeriodRiskBlockers, // Check 1
      ...noeBlockers, // Check 2
      ...visitFrequencyBlockers, // Check 3 (stub)
      ...unsignedOrdersBlockers, // Check 4 (stub)
      ...f2fBlockers, // Check 5
      ...hardBlockAlertBlockers, // Check 6 (stub)
      ...manualHoldBlockers, // Check 7
    ];

    return {
      ready: blockers.length === 0,
      blockers,
    };
  }
}
