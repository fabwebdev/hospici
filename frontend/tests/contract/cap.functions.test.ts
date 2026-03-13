// tests/contract/cap.functions.test.ts

import {
  fetchCapPatients,
  fetchCapSnapshot,
  fetchCapSummary,
  fetchCapTrends,
  postCapRecalculate,
} from "@/functions/cap.functions.js";
import { describe, expect, it, vi } from "vitest";

const COOKIE = "session=test-session";
const BASE = process.env.VITE_API_URL ?? "http://localhost:3001";

describe("fetchCapSummary", () => {
  it("calls /api/v1/cap/summary and returns JSON", async () => {
    const mockData = {
      capYear: 2025,
      capYearStart: "2025-11-01",
      capYearEnd: "2026-10-31",
      daysRemainingInYear: 180,
      utilizationPercent: 72.5,
      projectedYearEndPercent: 85.0,
      estimatedLiability: 0,
      patientCount: 10,
      lastCalculatedAt: null,
      thresholdAlerts: [],
      priorYearUtilizationPercent: null,
    };
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockData,
    }) as unknown as typeof fetch;

    const result = await fetchCapSummary(COOKIE, 2025);
    expect(result.capYear).toBe(2025);
    expect(result.utilizationPercent).toBe(72.5);
  });

  it("throws on non-OK response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { message: "Unauthorized" } }),
    }) as unknown as typeof fetch;

    await expect(fetchCapSummary(COOKIE)).rejects.toThrow("Unauthorized");
  });
});

describe("fetchCapPatients", () => {
  it("calls /api/v1/cap/patients with query params", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [], total: 0, snapshotId: null }),
    }) as unknown as typeof fetch;

    const result = await fetchCapPatients(COOKIE, { limit: 10, sortBy: "contribution" });
    expect(result.total).toBe(0);
    const callArg = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(callArg).toContain("limit=10");
    expect(callArg).toContain("sortBy=contribution");
  });
});

describe("fetchCapTrends", () => {
  it("returns trend data", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ months: [], branchComparison: [] }),
    }) as unknown as typeof fetch;

    const result = await fetchCapTrends(COOKIE);
    expect(result.months).toEqual([]);
    expect(result.branchComparison).toEqual([]);
  });
});

describe("fetchCapSnapshot", () => {
  it("calls the correct snapshot endpoint", async () => {
    const id = "00000000-0000-0000-0000-000000000001";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id,
        locationId: id,
        capYear: 2025,
        calculatedAt: "2026-03-12T06:00:00.000Z",
        utilizationPercent: 72.5,
        projectedYearEndPercent: 85.0,
        estimatedLiability: 0,
        patientCount: 10,
        formulaVersion: "1.0.0",
        inputHash: "abc",
        triggeredBy: "scheduled",
        triggeredByUserId: null,
        contributions: [],
      }),
    }) as unknown as typeof fetch;

    const result = await fetchCapSnapshot(COOKIE, id);
    expect(result.id).toBe(id);
    const callArg = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(callArg).toContain(`/cap/snapshots/${id}`);
  });
});

describe("postCapRecalculate", () => {
  it("POSTs to /api/v1/cap/recalculate", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobId: "job-1", message: "enqueued" }),
    }) as unknown as typeof fetch;

    const result = await postCapRecalculate(COOKIE);
    expect(result.jobId).toBe("job-1");
    const [, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(opts.method).toBe("POST");
  });
});
