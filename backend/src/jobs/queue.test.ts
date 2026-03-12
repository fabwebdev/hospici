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
