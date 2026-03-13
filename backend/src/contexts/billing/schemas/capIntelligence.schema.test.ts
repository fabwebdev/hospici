import { TypeCompiler } from "@sinclair/typebox/compiler";
import { describe, expect, it } from "vitest";
import {
  CapPatientListQuerySchema,
  CapSummaryResponseSchema,
  RecalculateCapResponseSchema,
} from "./capIntelligence.schema.js";

const SummaryValidator = TypeCompiler.Compile(CapSummaryResponseSchema);
const QueryValidator = TypeCompiler.Compile(CapPatientListQuerySchema);
const RecalcValidator = TypeCompiler.Compile(RecalculateCapResponseSchema);

describe("CapSummaryResponseSchema", () => {
  it("accepts a valid summary", () => {
    const valid = {
      capYear: 2025,
      capYearStart: "2025-11-01",
      capYearEnd: "2026-10-31",
      daysRemainingInYear: 180,
      utilizationPercent: 72.5,
      projectedYearEndPercent: 85.3,
      estimatedLiability: 0,
      patientCount: 12,
      lastCalculatedAt: "2026-03-12T06:00:00.000Z",
      thresholdAlerts: [{ type: "CAP_THRESHOLD_70", firedAt: "2026-03-12T06:00:00.000Z" }],
      priorYearUtilizationPercent: 68.2,
    };
    expect(SummaryValidator.Check(valid)).toBe(true);
  });

  it("accepts null priorYearUtilizationPercent", () => {
    const valid = {
      capYear: 2025,
      capYearStart: "2025-11-01",
      capYearEnd: "2026-10-31",
      daysRemainingInYear: 180,
      utilizationPercent: 0,
      projectedYearEndPercent: 0,
      estimatedLiability: 0,
      patientCount: 0,
      lastCalculatedAt: null,
      thresholdAlerts: [],
      priorYearUtilizationPercent: null,
    };
    expect(SummaryValidator.Check(valid)).toBe(true);
  });

  it("rejects missing required fields", () => {
    expect(SummaryValidator.Check({ capYear: 2025 })).toBe(false);
  });
});

describe("CapPatientListQuerySchema", () => {
  it("accepts empty query", () => {
    expect(QueryValidator.Check({})).toBe(true);
  });

  it("accepts valid query", () => {
    expect(
      QueryValidator.Check({
        sortBy: "contribution",
        limit: 25,
        losMin: 30,
        highUtilizationOnly: true,
      }),
    ).toBe(true);
  });

  it("rejects invalid sortBy", () => {
    expect(QueryValidator.Check({ sortBy: "invalid" })).toBe(false);
  });

  it("rejects limit > 200", () => {
    expect(QueryValidator.Check({ limit: 201 })).toBe(false);
  });
});

describe("RecalculateCapResponseSchema", () => {
  it("accepts valid response", () => {
    expect(RecalcValidator.Check({ jobId: "abc123", message: "enqueued" })).toBe(true);
  });

  it("rejects missing jobId", () => {
    expect(RecalcValidator.Check({ message: "enqueued" })).toBe(false);
  });
});
