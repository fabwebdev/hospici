// claim.schema.test.ts — T3-7a unit tests
// Tests TypeBox schemas for claim lifecycle without a DB connection.

import { TypeCompiler } from "@sinclair/typebox/compiler";
import { describe, expect, it } from "vitest";
import {
  BillHoldSchema,
  BulkSubmitBodySchema,
  ClaimLineSchema,
  ClaimListQuerySchema,
  ClaimReadinessResultSchema,
  ClaimSchema,
  ClaimStateSchema,
  CreateClaimBodySchema,
  HoldBodySchema,
  ReplaceClaimBodySchema,
} from "./claim.schema.js";

// ── AOT compile for O(1) validation in tests ──────────────────────────────────

const validateClaimLine = TypeCompiler.Compile(ClaimLineSchema);
const validateCreateClaimBody = TypeCompiler.Compile(CreateClaimBodySchema);
const validateClaimState = TypeCompiler.Compile(ClaimStateSchema);
const validateClaim = TypeCompiler.Compile(ClaimSchema);
const validateHoldBody = TypeCompiler.Compile(HoldBodySchema);
const validateReplaceClaimBody = TypeCompiler.Compile(ReplaceClaimBodySchema);
const validateBulkSubmit = TypeCompiler.Compile(BulkSubmitBodySchema);
const validateClaimListQuery = TypeCompiler.Compile(ClaimListQuerySchema);
const validateReadinessResult = TypeCompiler.Compile(ClaimReadinessResultSchema);
const validateBillHold = TypeCompiler.Compile(BillHoldSchema);

// ── ClaimState ─────────────────────────────────────────────────────────────────

describe("ClaimStateSchema", () => {
  it("accepts all 12 valid states", () => {
    const states = [
      "DRAFT",
      "NOT_READY",
      "READY_FOR_AUDIT",
      "AUDIT_FAILED",
      "READY_TO_SUBMIT",
      "QUEUED",
      "SUBMITTED",
      "ACCEPTED",
      "REJECTED",
      "DENIED",
      "PAID",
      "VOIDED",
    ];
    for (const s of states) {
      expect(validateClaimState.Check(s), `state ${s} should be valid`).toBe(true);
    }
  });

  it("rejects unknown states", () => {
    expect(validateClaimState.Check("PENDING")).toBe(false);
    expect(validateClaimState.Check("APPROVED")).toBe(false);
    expect(validateClaimState.Check("draft")).toBe(false); // case-sensitive
  });
});

// ── ClaimLine ──────────────────────────────────────────────────────────────────

describe("ClaimLineSchema", () => {
  const validLine = {
    revenueCode: "0651",
    hcpcsCode: null,
    serviceDate: "2026-01-15",
    units: 1,
    unitCharge: 202.49,
    lineCharge: 202.49,
    levelOfCare: "routine_home_care",
  };

  it("accepts a valid routine home care line", () => {
    expect(validateClaimLine.Check(validLine)).toBe(true);
  });

  it("accepts null hcpcsCode and levelOfCare", () => {
    expect(validateClaimLine.Check({ ...validLine, levelOfCare: null })).toBe(true);
  });

  it("rejects revenue code shorter than 4 chars", () => {
    expect(validateClaimLine.Check({ ...validLine, revenueCode: "065" })).toBe(false);
  });

  it("rejects revenue code longer than 4 chars", () => {
    expect(validateClaimLine.Check({ ...validLine, revenueCode: "06512" })).toBe(false);
  });

  it("rejects negative units", () => {
    expect(validateClaimLine.Check({ ...validLine, units: -1 })).toBe(false);
  });

  it("rejects negative lineCharge", () => {
    expect(validateClaimLine.Check({ ...validLine, lineCharge: -10 })).toBe(false);
  });

  it("accepts zero units (adjustment lines)", () => {
    expect(validateClaimLine.Check({ ...validLine, units: 0 })).toBe(true);
  });
});

// ── CreateClaimBody ────────────────────────────────────────────────────────────

describe("CreateClaimBodySchema", () => {
  const validBody = {
    patientId: "550e8400-e29b-41d4-a716-446655440000",
    payerId: "MEDICARE-A",
    statementFromDate: "2026-01-01",
    statementToDate: "2026-01-31",
    claimLines: [
      {
        revenueCode: "0651",
        hcpcsCode: null,
        serviceDate: "2026-01-01",
        units: 31,
        unitCharge: 202.49,
        lineCharge: 6277.19,
        levelOfCare: "routine_home_care",
      },
    ],
  };

  it("accepts a valid create claim body", () => {
    expect(validateCreateClaimBody.Check(validBody)).toBe(true);
  });

  it("accepts optional benefitPeriodId", () => {
    expect(
      validateCreateClaimBody.Check({
        ...validBody,
        benefitPeriodId: "550e8400-e29b-41d4-a716-446655440001",
      }),
    ).toBe(true);
  });

  it("rejects missing patientId", () => {
    const { patientId: _p, ...rest } = validBody;
    expect(validateCreateClaimBody.Check(rest)).toBe(false);
  });

  it("rejects empty claimLines array", () => {
    expect(validateCreateClaimBody.Check({ ...validBody, claimLines: [] })).toBe(false);
  });

  it("rejects empty payerId", () => {
    expect(validateCreateClaimBody.Check({ ...validBody, payerId: "" })).toBe(false);
  });

  it("rejects invalid patientId UUID", () => {
    expect(validateCreateClaimBody.Check({ ...validBody, patientId: "not-a-uuid" })).toBe(false);
  });
});

// ── HoldBody ───────────────────────────────────────────────────────────────────

describe("HoldBodySchema", () => {
  it("accepts all valid hold reasons", () => {
    const reasons = [
      "MANUAL_REVIEW",
      "COMPLIANCE_BLOCK",
      "MISSING_DOCUMENTATION",
      "PAYER_INQUIRY",
      "INTERNAL_AUDIT",
      "SUPERVISOR_REVIEW",
    ];
    for (const reason of reasons) {
      expect(validateHoldBody.Check({ reason }), `reason ${reason} should be valid`).toBe(true);
    }
  });

  it("accepts optional holdNote", () => {
    expect(
      validateHoldBody.Check({ reason: "MANUAL_REVIEW", holdNote: "Reviewing discrepancy" }),
    ).toBe(true);
  });

  it("rejects unknown reason", () => {
    expect(validateHoldBody.Check({ reason: "UNKNOWN_REASON" })).toBe(false);
  });

  it("rejects holdNote exceeding 2000 chars", () => {
    expect(validateHoldBody.Check({ reason: "MANUAL_REVIEW", holdNote: "x".repeat(2001) })).toBe(
      false,
    );
  });
});

// ── ReplaceClaimBody ───────────────────────────────────────────────────────────

describe("ReplaceClaimBodySchema", () => {
  it("accepts minimal replacement (reason only)", () => {
    expect(validateReplaceClaimBody.Check({ replacementReason: "Incorrect revenue code" })).toBe(
      true,
    );
  });

  it("accepts full replacement body", () => {
    expect(
      validateReplaceClaimBody.Check({
        replacementReason: "Incorrect dates",
        statementFromDate: "2026-01-01",
        statementToDate: "2026-01-31",
        payerId: "MEDICARE-A",
      }),
    ).toBe(true);
  });

  it("rejects empty replacementReason", () => {
    expect(validateReplaceClaimBody.Check({ replacementReason: "" })).toBe(false);
  });
});

// ── BulkSubmit ─────────────────────────────────────────────────────────────────

describe("BulkSubmitBodySchema", () => {
  it("accepts a valid bulk submit request", () => {
    expect(
      validateBulkSubmit.Check({
        claimIds: ["550e8400-e29b-41d4-a716-446655440000"],
      }),
    ).toBe(true);
  });

  it("rejects empty claimIds array", () => {
    expect(validateBulkSubmit.Check({ claimIds: [] })).toBe(false);
  });

  it("rejects non-UUID claimId", () => {
    expect(validateBulkSubmit.Check({ claimIds: ["not-a-uuid"] })).toBe(false);
  });
});

// ── ClaimListQuery ─────────────────────────────────────────────────────────────

describe("ClaimListQuerySchema", () => {
  it("accepts empty query (all defaults)", () => {
    expect(validateClaimListQuery.Check({})).toBe(true);
  });

  it("accepts full query", () => {
    expect(
      validateClaimListQuery.Check({
        state: "DRAFT",
        payerId: "MEDICARE-A",
        fromDate: "2026-01-01",
        toDate: "2026-01-31",
        isOnHold: false,
        patientId: "550e8400-e29b-41d4-a716-446655440000",
        page: 2,
        limit: 50,
      }),
    ).toBe(true);
  });

  it("rejects limit above 100", () => {
    expect(validateClaimListQuery.Check({ limit: 101 })).toBe(false);
  });

  it("rejects page below 1", () => {
    expect(validateClaimListQuery.Check({ page: 0 })).toBe(false);
  });
});

// ── ClaimReadinessResult ───────────────────────────────────────────────────────

describe("ClaimReadinessResultSchema", () => {
  it("accepts ready=true with empty blockers", () => {
    expect(validateReadinessResult.Check({ ready: true, blockers: [] })).toBe(true);
  });

  it("accepts not ready with blockers", () => {
    expect(
      validateReadinessResult.Check({
        ready: false,
        blockers: [{ code: "NOE_CLAIM_BLOCKING", message: "NOE is claim-blocking" }],
      }),
    ).toBe(true);
  });

  it("rejects blocker without code", () => {
    expect(
      validateReadinessResult.Check({
        ready: false,
        blockers: [{ message: "missing code" }],
      }),
    ).toBe(false);
  });
});

// ── BillHold ───────────────────────────────────────────────────────────────────

describe("BillHoldSchema", () => {
  const validHold = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    claimId: "550e8400-e29b-41d4-a716-446655440001",
    reason: "MANUAL_REVIEW" as const,
    holdNote: null,
    placedBy: "550e8400-e29b-41d4-a716-446655440002",
    placedAt: "2026-01-15T10:00:00Z",
    releasedBy: null,
    releasedAt: null,
  };

  it("accepts a valid active hold", () => {
    expect(validateBillHold.Check(validHold)).toBe(true);
  });

  it("accepts a released hold", () => {
    expect(
      validateBillHold.Check({
        ...validHold,
        releasedBy: "550e8400-e29b-41d4-a716-446655440003",
        releasedAt: "2026-01-16T10:00:00Z",
      }),
    ).toBe(true);
  });

  it("rejects invalid reason", () => {
    expect(validateBillHold.Check({ ...validHold, reason: "UNKNOWN" })).toBe(false);
  });
});

// ── Full Claim schema ──────────────────────────────────────────────────────────

describe("ClaimSchema", () => {
  const validClaim = {
    id: "550e8400-e29b-41d4-a716-446655440000",
    patientId: "550e8400-e29b-41d4-a716-446655440001",
    locationId: "550e8400-e29b-41d4-a716-446655440002",
    payerId: "MEDICARE-A",
    benefitPeriodId: null,
    billType: "original" as const,
    statementFromDate: "2026-01-01",
    statementToDate: "2026-01-31",
    totalCharge: "6277.19",
    state: "DRAFT" as const,
    isOnHold: false,
    correctedFromId: null,
    claimLines: [],
    payloadHash: null,
    x12Hash: null,
    clearinghouseIcn: null,
    createdBy: "550e8400-e29b-41d4-a716-446655440003",
    createdAt: "2026-01-15T10:00:00Z",
    updatedAt: "2026-01-15T10:00:00Z",
  };

  it("accepts a valid DRAFT claim", () => {
    expect(validateClaim.Check(validClaim)).toBe(true);
  });

  it("accepts a PAID claim with clearinghouse ICN", () => {
    expect(
      validateClaim.Check({
        ...validClaim,
        state: "PAID",
        clearinghouseIcn: "ICN20260115001",
        x12Hash: "abc123def456abc123def456abc123def456abc123def456abc123def456abc1",
      }),
    ).toBe(true);
  });

  it("rejects missing required field", () => {
    const { payerId: _p, ...rest } = validClaim;
    expect(validateClaim.Check(rest)).toBe(false);
  });
});
