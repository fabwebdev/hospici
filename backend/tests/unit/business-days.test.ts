import { describe, it, expect } from "vitest";
import { addBusinessDays, getCapYear } from "@/utils/business-days.ts";

describe("addBusinessDays", () => {
  it("adds 5 business days from a Monday", () => {
    // Monday 2026-03-02 → Friday 2026-03-06
    const result = addBusinessDays(new Date("2026-03-02"), 5);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-09");
  });

  it("NOE Friday edge case — election on Friday skips to next Friday", () => {
    // Friday 2026-03-06 + 5 business days = Friday 2026-03-13
    const result = addBusinessDays(new Date("2026-03-06"), 5);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-13");
  });

  it("skips weekends", () => {
    // Friday 2026-03-06 + 1 business day = Monday 2026-03-09
    const result = addBusinessDays(new Date("2026-03-06"), 1);
    expect(result.toISOString().slice(0, 10)).toBe("2026-03-09");
  });

  it("skips Thanksgiving (4th Thursday Nov)", () => {
    // 2026: Thanksgiving = Nov 26
    // Wednesday Nov 25 + 1 business day = Friday Nov 27 (Thursday skipped)
    const result = addBusinessDays(new Date("2026-11-25"), 1);
    expect(result.toISOString().slice(0, 10)).toBe("2026-11-27");
  });

  it("skips Christmas (Dec 25)", () => {
    // Wed Dec 23 2026 + 2 = Mon Dec 28 (Dec 25 skipped)
    const result = addBusinessDays(new Date("2026-12-23"), 2);
    expect(result.toISOString().slice(0, 10)).toBe("2026-12-28");
  });
});

describe("getCapYear", () => {
  it("returns correct cap year for date in November (start of new cap year)", () => {
    const result = getCapYear(new Date("2026-11-15"));
    expect(result.label).toBe("2026-2027");
    expect(result.start.toISOString().slice(0, 10)).toBe("2026-11-01");
    expect(result.end.toISOString().slice(0, 10)).toBe("2027-10-31");
  });

  it("returns correct cap year for date in October (end of cap year)", () => {
    const result = getCapYear(new Date("2026-10-15"));
    expect(result.label).toBe("2025-2026");
    expect(result.start.toISOString().slice(0, 10)).toBe("2025-11-01");
    expect(result.end.toISOString().slice(0, 10)).toBe("2026-10-31");
  });

  it("cap year boundary: Oct 31 is end of cap year", () => {
    const result = getCapYear(new Date("2026-10-31"));
    expect(result.label).toBe("2025-2026");
  });

  it("cap year boundary: Nov 1 is start of new cap year", () => {
    const result = getCapYear(new Date("2026-11-01"));
    expect(result.label).toBe("2026-2027");
  });
});
