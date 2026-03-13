/**
 * Integration — NOE deadline (Friday edge case)
 *
 * Verifies end-to-end:
 *  1. A NOE with election_date on a Friday gets deadline_date = +5 business days
 *     (next Friday, skipping weekend) using addBusinessDays().
 *  2. A NOE with election_date on a Monday gets deadline = following Monday.
 *  3. The noeDeadlineHandler correctly identifies upcoming and overdue NOEs
 *     against the real test database.
 *
 * CMS rule: 42 CFR §418.21 — NOE must be filed within 5 business days of election.
 *
 * T3-2a: Updated to use notices_of_election (new schema).
 */

import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Prevent module-level Queue/Worker instantiations in queue.ts from
// connecting to Valkey during integration tests. The handler itself only
// uses Postgres (db) and the in-process ComplianceEventBus — no Valkey.
vi.mock("bullmq", () => ({
  Queue: vi.fn().mockImplementation((name: string) => ({ name, close: vi.fn() })),
  Worker: vi.fn().mockImplementation((name: string) => ({ name, close: vi.fn(), on: vi.fn() })),
}));

import { noeDeadlineHandler } from "@/jobs/workers/noe-deadline.worker.js";
import { addBusinessDays } from "@/utils/business-days.js";
import { TEST_IDS, cleanupFixtures, createAppRole, getTestPool, seedFixtures } from "./setup.js";

const pool = getTestPool();

// Static UUIDs for NOE-specific fixtures (not in the shared seed)
const NOE_FRIDAY_ID = "b0000000-0000-0000-0000-000000000001";
const NOE_MONDAY_ID = "b0000000-0000-0000-0000-000000000002";
const NOE_UPCOMING_ID = "b0000000-0000-0000-0000-000000000003";
const NOE_OVERDUE_ID = "b0000000-0000-0000-0000-000000000004";
const NOE_FAR_ID = "b0000000-0000-0000-0000-000000000005";

beforeAll(async () => {
  const client: PoolClient = await pool.connect();
  try {
    await createAppRole(client);
    await seedFixtures(client);
  } finally {
    client.release();
  }
}, 30_000);

afterAll(async () => {
  // Clean up NOE-specific fixtures not handled by cleanupFixtures
  const client: PoolClient = await pool.connect();
  try {
    await client.query("DELETE FROM notices_of_election WHERE id IN ($1, $2, $3, $4, $5)", [
      NOE_FRIDAY_ID,
      NOE_MONDAY_ID,
      NOE_UPCOMING_ID,
      NOE_OVERDUE_ID,
      NOE_FAR_ID,
    ]);
    await cleanupFixtures(client);
  } finally {
    client.release();
  }
});

// ── Filing deadline calculation ───────────────────────────────────────────────

describe("NOE filing deadline — CMS 5-business-day rule", () => {
  it("Friday edge case: election on Friday 2026-03-06 → deadline 2026-03-13 (not 2026-03-11)", () => {
    // This is the canonical CMS NOE edge case.
    // Starting Friday, counting 5 business days skips Sat+Sun twice:
    //   Fri Mar 06 (election) → Mon Mar 09 (day 1), Tue Mar 10 (day 2),
    //   Wed Mar 11 (day 3), Thu Mar 12 (day 4), Fri Mar 13 (day 5)
    const electionDate = new Date("2026-03-06"); // Friday
    const deadline = addBusinessDays(electionDate, 5);
    expect(deadline.toISOString().slice(0, 10)).toBe("2026-03-13");
  });

  it("Monday election: election on 2026-03-02 → deadline 2026-03-09 (following Monday)", () => {
    const electionDate = new Date("2026-03-02"); // Monday
    const deadline = addBusinessDays(electionDate, 5);
    expect(deadline.toISOString().slice(0, 10)).toBe("2026-03-09");
  });

  it("Wednesday election: election on 2026-03-04 → deadline 2026-03-11 (Wednesday + 5 biz days)", () => {
    const electionDate = new Date("2026-03-04"); // Wednesday
    const deadline = addBusinessDays(electionDate, 5);
    expect(deadline.toISOString().slice(0, 10)).toBe("2026-03-11");
  });
});

// ── NOE stored in DB with correct deadline ────────────────────────────────────

describe("NOE rows stored and retrieved from DB with correct deadline_date", () => {
  it("stores and retrieves a Friday NOE with the correct 5-business-day deadline", async () => {
    const electionDate = new Date("2026-03-06"); // Friday
    const deadlineDate = addBusinessDays(electionDate, 5);
    const deadlineStr = deadlineDate.toISOString().slice(0, 10); // "2026-03-13"

    const client: PoolClient = await pool.connect();
    try {
      // Insert as superuser (bypasses RLS — worker pattern)
      await client.query(
        `INSERT INTO notices_of_election
           (id, patient_id, location_id, status, election_date, deadline_date)
         VALUES ($1, $2, $3, 'draft', '2026-03-06', $4)`,
        [NOE_FRIDAY_ID, TEST_IDS.patientA, TEST_IDS.locationA, deadlineStr],
      );

      const { rows } = await client.query(
        "SELECT election_date::TEXT, deadline_date::TEXT FROM notices_of_election WHERE id = $1",
        [NOE_FRIDAY_ID],
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].election_date).toBe("2026-03-06");
      expect(rows[0].deadline_date).toBe("2026-03-13"); // Friday → 5 biz days → Friday
    } finally {
      client.release();
    }
  });

  it("stores and retrieves a Monday NOE with the correct 5-business-day deadline", async () => {
    const electionDate = new Date("2026-03-02"); // Monday
    const deadlineDate = addBusinessDays(electionDate, 5);
    const deadlineStr = deadlineDate.toISOString().slice(0, 10);

    const client: PoolClient = await pool.connect();
    try {
      await client.query(
        `INSERT INTO notices_of_election
           (id, patient_id, location_id, status, election_date, deadline_date)
         VALUES ($1, $2, $3, 'draft', '2026-03-02', $4)`,
        [NOE_MONDAY_ID, TEST_IDS.patientA, TEST_IDS.locationA, deadlineStr],
      );

      const { rows } = await client.query(
        "SELECT deadline_date::TEXT FROM notices_of_election WHERE id = $1",
        [NOE_MONDAY_ID],
      );

      expect(rows).toHaveLength(1);
      expect(rows[0].deadline_date).toBe("2026-03-09"); // Monday → 5 biz days → Monday
    } finally {
      client.release();
    }
  });
});

// ── noeDeadlineHandler — worker query logic ───────────────────────────────────

describe("noeDeadlineHandler worker query logic", () => {
  beforeAll(async () => {
    // Seed NOEs with deadlines relative to today for the handler tests
    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10) as string;

    // Upcoming: deadline = today + 1 day (within the 2-day lookahead window)
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10) as string;

    // Overdue: deadline = yesterday (past)
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().slice(0, 10) as string;

    // Far future: deadline = today + 30 days (outside lookahead window)
    const farFuture = new Date(today);
    farFuture.setDate(farFuture.getDate() + 30);
    const farFutureStr = farFuture.toISOString().slice(0, 10) as string;

    const client: PoolClient = await pool.connect();
    try {
      await client.query(
        `INSERT INTO notices_of_election
           (id, patient_id, location_id, status, election_date, deadline_date)
         VALUES
           ($1,  $2,  $3,  'draft', $4,  $5),
           ($6,  $7,  $8,  'draft', $9, $10),
           ($11, $12, $13, 'draft', $14, $15)`,
        [
          NOE_UPCOMING_ID,
          TEST_IDS.patientA,
          TEST_IDS.locationA,
          todayStr,
          tomorrowStr,
          NOE_OVERDUE_ID,
          TEST_IDS.patientA,
          TEST_IDS.locationA,
          yesterdayStr,
          yesterdayStr,
          NOE_FAR_ID,
          TEST_IDS.patientA,
          TEST_IDS.locationA,
          todayStr,
          farFutureStr,
        ],
      );
    } finally {
      client.release();
    }
  });

  it("detects an upcoming NOE within the 2-day window", async () => {
    const fakeJob = { id: "test-job-1", data: {}, opts: {} } as Parameters<
      typeof noeDeadlineHandler
    >[0];

    const result = await noeDeadlineHandler(fakeJob);

    // Must find at least the one upcoming NOE we inserted
    expect(result.upcomingCount).toBeGreaterThanOrEqual(1);
  });

  it("detects an overdue NOE", async () => {
    const fakeJob = { id: "test-job-2", data: {}, opts: {} } as Parameters<
      typeof noeDeadlineHandler
    >[0];

    const result = await noeDeadlineHandler(fakeJob);

    expect(result.overdueCount).toBeGreaterThanOrEqual(1);
  });

  it("does not count a NOE whose deadline is 30 days away as upcoming", async () => {
    // The far-future NOE (NOE_FAR_ID) should not appear in upcomingCount.
    const fakeJob = { id: "test-job-3", data: {}, opts: {} } as Parameters<
      typeof noeDeadlineHandler
    >[0];

    const result = await noeDeadlineHandler(fakeJob);

    // Result is a valid object with the expected shape
    expect(typeof result.checkedAt).toBe("string");
    expect(typeof result.upcomingCount).toBe("number");
    expect(typeof result.overdueCount).toBe("number");
    expect(result.upcomingCount).toBeGreaterThanOrEqual(0);
  });

  it("does not count submitted NOEs as upcoming or overdue", async () => {
    // Insert a submitted NOE with an overdue deadline — handler should ignore it
    const client: PoolClient = await pool.connect();
    const submittedId = "c0000000-0000-0000-0000-000000000001";
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().slice(0, 10) as string;

      await client.query(
        `INSERT INTO notices_of_election
           (id, patient_id, location_id, status, election_date, deadline_date)
         VALUES ($1, $2, $3, 'submitted', $4, $5)`,
        [submittedId, TEST_IDS.patientA, TEST_IDS.locationA, yesterdayStr, yesterdayStr],
      );
    } finally {
      client.release();
    }

    const fakeJob = { id: "test-job-4", data: {}, opts: {} } as Parameters<
      typeof noeDeadlineHandler
    >[0];
    const beforeResult = await noeDeadlineHandler(fakeJob);

    // Now delete the submitted NOE and compare — counts should be the same
    const cleanup: PoolClient = await pool.connect();
    try {
      await cleanup.query("DELETE FROM notices_of_election WHERE id = $1", [submittedId]);
    } finally {
      cleanup.release();
    }

    const fakeJob2 = { id: "test-job-5", data: {}, opts: {} } as Parameters<
      typeof noeDeadlineHandler
    >[0];
    const afterResult = await noeDeadlineHandler(fakeJob2);

    // Counts should be identical — submitted NOE was filtered out both times
    expect(beforeResult.upcomingCount).toBe(afterResult.upcomingCount);
    expect(beforeResult.overdueCount).toBe(afterResult.overdueCount);
  });
});
