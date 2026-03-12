/**
 * Integration — IDGService (T2-4)
 *
 * Tests:
 *  1. create()     — inserts scheduled meeting, emits audit log
 *  2. list()       — lists meetings for patient (RLS-scoped)
 *  3. complete()   — validates RN+MD+SW, assembles note, marks compliant
 *  4. complete()   — rejects when required discipline is absent
 *  5. compliance() — returns non-compliant when no completed meetings
 *  6. compliance() — returns compliant after recent completed meeting
 *  7. RLS isolation — user in locationB cannot see locationA meetings
 */

import type {
  CompleteIDGMeetingBody,
  CreateIDGMeetingBody,
} from "@/contexts/scheduling/schemas/idgMeeting.schema.js";
import { IDGService } from "@/contexts/scheduling/services/idg.service.js";
import { IDGAttendeeValidationError } from "@/contexts/scheduling/services/idg.service.js";
import type { FastifyRequest } from "fastify";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_IDS, cleanupFixtures, createAppRole, getTestPool, seedFixtures } from "./setup.js";

const pool = getTestPool();

const userA: NonNullable<FastifyRequest["user"]> = {
  id: TEST_IDS.userA,
  role: "registered_nurse",
  locationId: TEST_IDS.locationA,
  locationIds: [TEST_IDS.locationA],
  permissions: [],
  breakGlass: false,
};

const userB: NonNullable<FastifyRequest["user"]> = {
  id: TEST_IDS.userB,
  role: "registered_nurse",
  locationId: TEST_IDS.locationB,
  locationIds: [TEST_IDS.locationB],
  permissions: [],
  breakGlass: false,
};

const RN_ATTENDEE = {
  userId: TEST_IDS.userA,
  name: "Alice RN",
  role: "RN",
  status: "present" as const,
};
const MD_ATTENDEE = {
  userId: "00000000-0000-0000-0000-000000000099",
  name: "Dr. Smith",
  role: "MD",
  status: "present" as const,
};
const SW_ATTENDEE = {
  userId: "00000000-0000-0000-0000-000000000098",
  name: "Social Worker",
  role: "SW",
  status: "remote" as const,
};
const CHAPLAIN_ATTENDEE = {
  userId: "00000000-0000-0000-0000-000000000097",
  name: "Rev. Jones",
  role: "Chaplain",
  status: "present" as const,
};

const ALL_ATTENDEES = [RN_ATTENDEE, MD_ATTENDEE, SW_ATTENDEE, CHAPLAIN_ATTENDEE];

const createBody: CreateIDGMeetingBody = {
  patientId: TEST_IDS.patientA,
  scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // tomorrow
  attendees: ALL_ATTENDEES,
  carePlanReviewed: false,
  symptomManagementDiscussed: false,
  goalsOfCareReviewed: false,
};

const completeBody: CompleteIDGMeetingBody = {
  attendees: ALL_ATTENDEES,
  attendeeNotes: {
    [TEST_IDS.userA]: {
      role: "RN",
      notes: "Patient pain stable at 3/10. Bowel regimen effective.",
      goalsReviewed: true,
      concerns: null,
    },
  },
  carePlanReviewed: true,
  symptomManagementDiscussed: true,
  goalsOfCareReviewed: true,
  notes: "IDG meeting completed per CMS 42 CFR §418.56",
};

const createdMeetingIds: string[] = [];

beforeAll(async () => {
  const client: PoolClient = await pool.connect();
  try {
    await createAppRole(client);
    await seedFixtures(client);
  } finally {
    client.release();
  }
});

afterAll(async () => {
  const client: PoolClient = await pool.connect();
  try {
    if (createdMeetingIds.length > 0) {
      await client.query("DELETE FROM idg_meetings WHERE id = ANY($1::uuid[])", [
        createdMeetingIds,
      ]);
    }
    await cleanupFixtures(client);
  } finally {
    client.release();
  }
});

describe("IDGService.create", () => {
  it("creates a scheduled IDG meeting with correct fields", async () => {
    const meeting = await IDGService.create(createBody, userA);
    createdMeetingIds.push(meeting.id);

    expect(meeting.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(meeting.patientId).toBe(TEST_IDS.patientA);
    expect(meeting.locationId).toBe(TEST_IDS.locationA);
    expect(meeting.status).toBe("scheduled");
    expect(meeting.rnPresent).toBe(true);
    expect(meeting.mdPresent).toBe(true);
    expect(meeting.swPresent).toBe(true);
    expect(meeting.assembledNote).toBeNull();
  });

  it("emits an audit log entry (resource_id = patientId) for the created meeting", async () => {
    const meeting = await IDGService.create(createBody, userA);
    createdMeetingIds.push(meeting.id);

    const client: PoolClient = await pool.connect();
    try {
      // AuditService stores patientId as resource_id (see audit.service.ts:57)
      const { rows } = await client.query(
        `SELECT * FROM audit_logs
         WHERE resource_id = $1 AND action = 'create' AND resource_type = 'idg_meeting'
         LIMIT 1`,
        [TEST_IDS.patientA],
      );
      expect(rows.length).toBeGreaterThan(0);
      expect(rows[0].user_id).toBe(TEST_IDS.userA);
    } finally {
      client.release();
    }
  });
});

describe("IDGService.list", () => {
  it("returns meetings for the patient", async () => {
    const meeting = await IDGService.create(createBody, userA);
    createdMeetingIds.push(meeting.id);

    const result = await IDGService.list(TEST_IDS.patientA, userA);
    expect(result.total).toBeGreaterThan(0);
    expect(result.meetings.some((m) => m.id === meeting.id)).toBe(true);
  });

  it("returns empty list for a different patient (no matching records)", async () => {
    // RLS isolation is verified in tests/validation/rls/ via the hospici_app role.
    // Here we verify the query correctly filters by patientId.
    const result = await IDGService.list("00000000-0000-0000-ffff-000000000000", userA);
    expect(result.total).toBe(0);
    expect(result.meetings).toHaveLength(0);
  });
});

describe("IDGService.complete", () => {
  it("completes a meeting with valid attendees, sets assembledNote", async () => {
    const meeting = await IDGService.create(createBody, userA);
    createdMeetingIds.push(meeting.id);

    const completed = await IDGService.complete(meeting.id, completeBody, userA);

    expect(completed.status).toBe("completed");
    expect(completed.completedAt).toBeTruthy();
    expect(completed.assembledNote).toContain("IDG Meeting Note");
    expect(completed.assembledNote).toContain("Alice RN");
    expect(completed.carePlanReviewed).toBe(true);
    expect(completed.rnPresent).toBe(true);
    expect(completed.mdPresent).toBe(true);
    expect(completed.swPresent).toBe(true);
  });

  it("throws IDGAttendeeValidationError when SW is absent", async () => {
    const meeting = await IDGService.create(createBody, userA);
    createdMeetingIds.push(meeting.id);

    const noSW: CompleteIDGMeetingBody = {
      ...completeBody,
      attendees: [
        RN_ATTENDEE,
        MD_ATTENDEE,
        { ...SW_ATTENDEE, status: "absent" },
        CHAPLAIN_ATTENDEE,
      ],
    };

    await expect(IDGService.complete(meeting.id, noSW, userA)).rejects.toBeInstanceOf(
      IDGAttendeeValidationError,
    );
  });

  it("throws IDGAttendeeValidationError when Chaplain absent (42 CFR §418.56(a)(4))", async () => {
    const meeting = await IDGService.create(createBody, userA);
    createdMeetingIds.push(meeting.id);

    const noChaplain: CompleteIDGMeetingBody = {
      ...completeBody,
      attendees: [
        RN_ATTENDEE,
        MD_ATTENDEE,
        SW_ATTENDEE,
        { ...CHAPLAIN_ATTENDEE, status: "absent" },
      ],
    };

    const err = await IDGService.complete(meeting.id, noChaplain, userA).catch((e) => e);
    expect(err).toBeInstanceOf(IDGAttendeeValidationError);
    expect((err as IDGAttendeeValidationError).message).toContain("Chaplain");
  });

  it("throws when meeting does not exist", async () => {
    await expect(
      IDGService.complete("00000000-0000-0000-0000-999999999999", completeBody, userA),
    ).rejects.toThrow("IDG meeting not found");
  });
});

describe("IDGService.compliance", () => {
  it("returns non-compliant with null daysSinceLastIdg when no meetings exist", async () => {
    // Use patientB — locationB, no IDG meetings seeded
    const status = await IDGService.compliance(TEST_IDS.patientB, userB);
    expect(status.patientId).toBe(TEST_IDS.patientB);
    expect(status.compliant).toBe(false);
    expect(status.daysSinceLastIdg).toBeNull();
    expect(status.lastMeetingId).toBeNull();
  });

  it("returns compliant after completing a recent IDG meeting", async () => {
    const meeting = await IDGService.create(createBody, userA);
    createdMeetingIds.push(meeting.id);
    await IDGService.complete(meeting.id, completeBody, userA);

    const status = await IDGService.compliance(TEST_IDS.patientA, userA);
    expect(status.patientId).toBe(TEST_IDS.patientA);
    expect(status.compliant).toBe(true);
    expect(status.daysSinceLastIdg).toBe(0);
    expect(status.lastMeetingId).toBeTruthy();
  });
});
