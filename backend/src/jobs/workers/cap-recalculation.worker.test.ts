/**
 * cap-recalculation.worker unit tests
 *
 * Key coverage:
 * - capRecalculationHandler returns expected shape with correct cap year label
 * - getCapYear from business-days: Nov 2 triggers new cap year (Nov 1 start)
 * - calculateCapLiability threshold logic (80% alert boundary)
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation((name: string) => ({
    name,
    close: vi.fn(),
    add: vi.fn().mockResolvedValue({}),
  })),
  Worker: vi.fn().mockImplementation((name: string) => ({
    name,
    close: vi.fn(),
    on: vi.fn(),
  })),
}));

vi.mock("@/config/env.js", () => ({
  env: {
    valkeyHost: "localhost",
    valkeyPort: 6379,
    valkeyPassword: "",
    logLevel: "silent",
    isDev: true,
  },
}));

vi.mock("@/config/logging.config.js", () => ({
  createLoggingConfig: () => ({ level: "silent" }),
}));

describe("capRecalculationHandler()", () => {
  it("returns a result with the correct cap year and zero counts when valkey not set", async () => {
    const { capRecalculationHandler } = await import("./cap-recalculation.worker.js");
    const mockJob = { data: {} } as Parameters<typeof capRecalculationHandler>[0];
    const result = await capRecalculationHandler(mockJob);

    expect(result.capYear).toBeTypeOf("number");
    expect(result.capYear).toBeGreaterThan(2000);
    expect(result.locationsChecked).toBe(0);
    expect(result.locationsAtThreshold).toBe(0);
    expect(result.locationsOverCap).toBe(0);
    expect(result.recalculatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

describe("getCapYear() — Nov 2 triggers new cap year", () => {
  it("Nov 2 is in the new cap year starting Nov 1", async () => {
    const { getCapYear } = await import("@/utils/business-days.js");
    const nov2 = new Date(Date.UTC(2026, 10, 2)); // Nov 2, 2026
    const capYear = getCapYear(nov2);

    expect(capYear.label).toBe("2026-2027");
    expect(capYear.year).toBe(2026);
  });

  it("Oct 31 is still in the prior cap year", async () => {
    const { getCapYear } = await import("@/utils/business-days.js");
    const oct31 = new Date(Date.UTC(2026, 9, 31)); // Oct 31, 2026
    const capYear = getCapYear(oct31);

    expect(capYear.label).toBe("2025-2026");
    expect(capYear.year).toBe(2025);
  });

  it("Nov 1 starts a new cap year", async () => {
    const { getCapYear } = await import("@/utils/business-days.js");
    const nov1 = new Date(Date.UTC(2026, 10, 1)); // Nov 1, 2026
    const capYear = getCapYear(nov1);

    expect(capYear.label).toBe("2026-2027");
  });
});

describe("calculateCapLiability() — 80% alert threshold", () => {
  it("returns at_threshold when utilization equals 80%", async () => {
    const { calculateCapLiability } = await import(
      "@/contexts/billing/schemas/hospiceCap.schema.js"
    );
    const result = calculateCapLiability({
      actualReimbursement: 80,
      aggregateCapAmount: 100,
      alertThreshold: 0.8,
    });

    expect(result.status).toBe("at_threshold");
    expect(result.utilizationPercent).toBe(0.8);
    expect(result.liability).toBe(0);
  });

  it("returns under_cap when utilization is below 80%", async () => {
    const { calculateCapLiability } = await import(
      "@/contexts/billing/schemas/hospiceCap.schema.js"
    );
    const result = calculateCapLiability({
      actualReimbursement: 79,
      aggregateCapAmount: 100,
      alertThreshold: 0.8,
    });

    expect(result.status).toBe("under_cap");
  });

  it("returns overage when actualReimbursement exceeds cap", async () => {
    const { calculateCapLiability } = await import(
      "@/contexts/billing/schemas/hospiceCap.schema.js"
    );
    const result = calculateCapLiability({
      actualReimbursement: 110,
      aggregateCapAmount: 100,
      alertThreshold: 0.8,
    });

    expect(result.status).toBe("overage");
    expect(result.liability).toBe(10);
  });
});
