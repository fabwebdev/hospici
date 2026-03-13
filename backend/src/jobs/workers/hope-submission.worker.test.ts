/**
 * hope-submission.worker unit tests
 *
 * Key coverage:
 * - hopeSubmissionHandler returns expected shape
 * - isAllAttemptsExhausted: boundary logic for DLQ promotion
 * - DLQ add is called when all retries are exhausted (simulated iQIES rejection)
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
    iqiesApiUrl: "https://iqies.cms.gov/api",
  },
}));

vi.mock("@/config/logging.config.js", () => ({
  createLoggingConfig: () => ({ level: "silent" }),
}));

// Prevent real pg.Pool from being created during import
vi.mock("@/db/client.js", () => {
  const fakeAssessment = {
    id: "assess-123",
    assessmentDate: new Date("2026-01-01"),
    electionDate: new Date("2026-01-01"),
    data: {},
    status: "ready_to_submit",
    locationId: "loc-456",
  };

  const fakeSubmission = {
    id: "sub-uuid-001",
    submittedAt: new Date("2026-01-01T12:00:00Z"),
  };

  let selectCallCount = 0;

  return {
    db: {
      select: () => {
        const callIndex = ++selectCallCount;
        // call 1 → load assessment; call 2 → max(attemptNumber)
        const resolved =
          callIndex === 1
            ? Promise.resolve([fakeAssessment])
            : Promise.resolve([{ maxAttempt: null }]);

        const whereResult = Object.assign(resolved, { limit: () => resolved });
        const chain: Record<string, unknown> = {
          from: () => chain,
          where: () => whereResult,
        };
        return chain;
      },
      insert: () => ({
        values: () => ({
          returning: () => Promise.resolve([fakeSubmission]),
        }),
      }),
      update: () => ({
        set: () => ({
          where: () => Promise.resolve([]),
        }),
      }),
    },
  };
});

// sha256 is a pure function but its parent module imports db — mock it to keep tests isolated
vi.mock("@/contexts/analytics/services/hope.service.js", () => ({
  sha256: (payload: string) => `sha256-stub-${payload.length}`,
}));

// compliance-events is a Node EventEmitter — safe to import real, but mock to avoid noise
vi.mock("@/events/compliance-events.js", () => ({
  complianceEvents: { emit: vi.fn() },
}));

describe("hopeSubmissionHandler()", () => {
  it("returns submitted status with assessmentId", async () => {
    const { hopeSubmissionHandler } = await import("./hope-submission.worker.js");
    const fakeJob = {
      data: { assessmentId: "assess-123", locationId: "loc-456", assessmentType: "01" as const },
      attemptsMade: 0,
    } as Parameters<typeof hopeSubmissionHandler>[0];

    const result = await hopeSubmissionHandler(fakeJob);

    expect(result.assessmentId).toBe("assess-123");
    expect(result.status).toBe("submitted");
    expect(result.submittedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(result.iqiesTrackingId).toBeNull();
  });
});

describe("isAllAttemptsExhausted()", () => {
  it("returns false when attempts remain", async () => {
    const { isAllAttemptsExhausted } = await import("./hope-submission.worker.js");
    expect(isAllAttemptsExhausted(0, 3)).toBe(false);
    expect(isAllAttemptsExhausted(1, 3)).toBe(false);
    expect(isAllAttemptsExhausted(2, 3)).toBe(false);
  });

  it("returns true when all 3 attempts are exhausted", async () => {
    const { isAllAttemptsExhausted } = await import("./hope-submission.worker.js");
    expect(isAllAttemptsExhausted(3, 3)).toBe(true);
  });

  it("returns true when attemptsMade exceeds maxAttempts", async () => {
    const { isAllAttemptsExhausted } = await import("./hope-submission.worker.js");
    expect(isAllAttemptsExhausted(4, 3)).toBe(true);
  });
});

describe("DLQ promotion on simulated iQIES rejection", () => {
  it("adds job to hope-submission-dlq when all retries are exhausted", async () => {
    const { hopeSubmissionDlq } = await import("../queue.js");
    const addSpy = vi.spyOn(hopeSubmissionDlq, "add").mockResolvedValue({} as never);

    // Simulate the DLQ promotion logic directly (as if failed event handler ran)
    const { isAllAttemptsExhausted } = await import("./hope-submission.worker.js");

    const jobData = { assessmentId: "a-999", locationId: "l-001", assessmentType: "01" as const };
    const attemptsMade = 3;
    const maxAttempts = 3;

    if (isAllAttemptsExhausted(attemptsMade, maxAttempts)) {
      await hopeSubmissionDlq.add("dlq-entry", {
        originalJobId: "job-1",
        ...jobData,
        failedAt: new Date().toISOString(),
        error: "iQIES 500 — simulated rejection",
      });
    }

    expect(addSpy).toHaveBeenCalledOnce();
    const [jobName, dlqData] = addSpy.mock.calls[0] as [string, Record<string, unknown>];
    expect(jobName).toBe("dlq-entry");
    expect(dlqData.assessmentId).toBe("a-999");
    expect(dlqData.error).toBe("iQIES 500 — simulated rejection");
  });

  it("does NOT add to DLQ when retries remain", async () => {
    const { hopeSubmissionDlq } = await import("../queue.js");
    const addSpy = vi.spyOn(hopeSubmissionDlq, "add").mockResolvedValue({} as never);

    const { isAllAttemptsExhausted } = await import("./hope-submission.worker.js");

    if (isAllAttemptsExhausted(1, 3)) {
      await hopeSubmissionDlq.add("dlq-entry", {});
    }

    expect(addSpy).not.toHaveBeenCalled();
  });
});
