/**
 * BullMQ queue unit tests.
 * Validates queue name constants and connection config without a live Valkey.
 */

import { describe, expect, it, vi } from "vitest";

// Mock BullMQ — no live connections in unit tests
vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation((name: string) => ({ name, close: vi.fn() })),
  Worker: vi.fn().mockImplementation((name: string) => ({ name, close: vi.fn(), on: vi.fn() })),
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

describe("QUEUE_NAMES", () => {
  it("defines noe-deadline-check", async () => {
    const { QUEUE_NAMES } = await import("./queue.js");
    expect(QUEUE_NAMES.NOE_DEADLINE_CHECK).toBe("noe-deadline-check");
  });

  it("defines aide-supervision-check", async () => {
    const { QUEUE_NAMES } = await import("./queue.js");
    expect(QUEUE_NAMES.AIDE_SUPERVISION_CHECK).toBe("aide-supervision-check");
  });

  it("defines hope-submission", async () => {
    const { QUEUE_NAMES } = await import("./queue.js");
    expect(QUEUE_NAMES.HOPE_SUBMISSION).toBe("hope-submission");
  });

  it("defines hope-submission-dlq", async () => {
    const { QUEUE_NAMES } = await import("./queue.js");
    expect(QUEUE_NAMES.HOPE_SUBMISSION_DLQ).toBe("hope-submission-dlq");
  });

  it("defines hope-deadline-check", async () => {
    const { QUEUE_NAMES } = await import("./queue.js");
    expect(QUEUE_NAMES.HOPE_DEADLINE_CHECK).toBe("hope-deadline-check");
  });

  it("defines hqrp-period-close", async () => {
    const { QUEUE_NAMES } = await import("./queue.js");
    expect(QUEUE_NAMES.HQRP_PERIOD_CLOSE).toBe("hqrp-period-close");
  });

  it("defines cap-recalculation (Nov 2 annual job)", async () => {
    const { QUEUE_NAMES } = await import("./queue.js");
    expect(QUEUE_NAMES.CAP_RECALCULATION).toBe("cap-recalculation");
  });
});

describe("createBullMQConnection()", () => {
  it("returns options with maxRetriesPerRequest: null (required by BullMQ)", async () => {
    const { createBullMQConnection } = await import("./queue.js");
    const opts = createBullMQConnection();
    expect(opts).toMatchObject({ maxRetriesPerRequest: null });
  });

  it("returns options with host and port from env", async () => {
    const { createBullMQConnection } = await import("./queue.js");
    const opts = createBullMQConnection();
    expect(opts).toMatchObject({ host: "localhost", port: 6379 });
  });

  it("omits password when VALKEY_PASSWORD is empty", async () => {
    const { createBullMQConnection } = await import("./queue.js");
    const opts = createBullMQConnection() as Record<string, unknown>;
    expect(opts.password).toBeUndefined();
  });
});

describe("getClosingQuarter() — HQRP quarterly cron mapping", () => {
  it("Aug 15 closes Q1 of the same year", async () => {
    const { getClosingQuarter } = await import("./workers/hqrp-period-close.worker.js");
    const result = getClosingQuarter(new Date(Date.UTC(2026, 7, 15))); // Aug 15
    expect(result).toEqual({ year: 2026, quarter: 1 });
  });

  it("Nov 15 closes Q2 of the same year", async () => {
    const { getClosingQuarter } = await import("./workers/hqrp-period-close.worker.js");
    const result = getClosingQuarter(new Date(Date.UTC(2026, 10, 15))); // Nov 15
    expect(result).toEqual({ year: 2026, quarter: 2 });
  });

  it("Feb 15 closes Q3 of the prior year", async () => {
    const { getClosingQuarter } = await import("./workers/hqrp-period-close.worker.js");
    const result = getClosingQuarter(new Date(Date.UTC(2027, 1, 15))); // Feb 15, 2027
    expect(result).toEqual({ year: 2026, quarter: 3 });
  });

  it("May 15 closes Q4 of the prior year", async () => {
    const { getClosingQuarter } = await import("./workers/hqrp-period-close.worker.js");
    const result = getClosingQuarter(new Date(Date.UTC(2027, 4, 15))); // May 15, 2027
    expect(result).toEqual({ year: 2026, quarter: 4 });
  });
});
