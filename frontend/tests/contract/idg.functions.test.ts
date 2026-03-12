// tests/contract/idg.functions.test.ts
// Contract tests for IDG meeting server function handlers

import type { IDGComplianceStatus, IDGMeetingListResponse } from "@hospici/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.server.js", () => ({
  env: { apiUrl: "http://localhost:3000", betterAuthSecret: "test" },
}));
vi.mock("vinxi/http", () => ({ getEvent: vi.fn(() => ({})) }));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: vi.fn(() => ({
    headers: { get: (key: string) => (key === "cookie" ? "session=test" : null) },
  })),
}));

const { fetchIDGMeetings, fetchIDGCompliance, fetchCreateIDGMeeting } = await import(
  "@/functions/idg.functions.js"
);

const COOKIE = "session=test";
const PATIENT_ID = "a1a1a1a1-0000-0000-1111-000000000001";
const MEETING_ID = "00000000-0000-0000-0000-000000000010";

const sampleMeeting = {
  id: MEETING_ID,
  patientId: PATIENT_ID,
  locationId: "a1a1a1a1-0000-0000-0000-000000000001",
  scheduledAt: "2026-03-20T14:00:00.000Z",
  completedAt: null,
  status: "scheduled" as const,
  attendees: [],
  rnPresent: false,
  mdPresent: false,
  swPresent: false,
  daysSinceLastIdg: null,
  isCompliant: true,
  carePlanReviewed: false,
  symptomManagementDiscussed: false,
  goalsOfCareReviewed: false,
  notes: null,
  attendeeNotes: {},
  assembledNote: null,
  createdAt: "2026-03-12T10:00:00.000Z",
  updatedAt: "2026-03-12T10:00:00.000Z",
};

const sampleList: IDGMeetingListResponse = {
  meetings: [sampleMeeting],
  total: 1,
};

const sampleCompliance: IDGComplianceStatus = {
  patientId: PATIENT_ID,
  compliant: false,
  daysSinceLastIdg: 18,
  daysOverdue: 3,
  lastMeetingId: null,
  lastMeetingDate: null,
};

describe("fetchIDGMeetings", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls GET /api/v1/patients/:id/idg-meetings with cookie header", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleList), { status: 200 }),
    );

    const result = await fetchIDGMeetings(PATIENT_ID, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/patients/${PATIENT_ID}/idg-meetings`,
      { headers: { cookie: COOKIE } },
    );
    expect(result.total).toBe(1);
    expect(result.meetings[0]?.id).toBe(MEETING_ID);
  });

  it("throws on non-ok response", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Unauthorized" } }), { status: 401 }),
    );

    await expect(fetchIDGMeetings(PATIENT_ID, COOKIE)).rejects.toThrow("Unauthorized");
  });

  it("throws with fallback message on malformed error body", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("not json", { status: 500 }));

    await expect(fetchIDGMeetings(PATIENT_ID, COOKIE)).rejects.toThrow(
      "Failed to fetch IDG meetings",
    );
  });
});

describe("fetchIDGCompliance", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls GET /api/v1/patients/:id/idg-compliance with cookie header", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleCompliance), { status: 200 }),
    );

    const result = await fetchIDGCompliance(PATIENT_ID, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/patients/${PATIENT_ID}/idg-compliance`,
      { headers: { cookie: COOKIE } },
    );
    expect(result.compliant).toBe(false);
    expect(result.daysOverdue).toBe(3);
  });

  it("throws 'Patient not found' on 404", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("", { status: 404 }));
    await expect(fetchIDGCompliance(PATIENT_ID, COOKIE)).rejects.toThrow("Patient not found");
  });

  it("returns compliance shape with nulls when no meetings", async () => {
    const noMeetings: IDGComplianceStatus = {
      patientId: PATIENT_ID,
      compliant: false,
      daysSinceLastIdg: null,
      daysOverdue: 0,
      lastMeetingId: null,
      lastMeetingDate: null,
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(noMeetings), { status: 200 }),
    );

    const result = await fetchIDGCompliance(PATIENT_ID, COOKIE);
    expect(result.daysSinceLastIdg).toBeNull();
    expect(result.lastMeetingId).toBeNull();
  });
});

describe("fetchCreateIDGMeeting", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  const input = {
    patientId: PATIENT_ID,
    scheduledAt: "2026-03-20T14:00:00.000Z",
    attendees: [
      {
        userId: "00000000-0000-0000-0000-000000000001",
        name: "Alice RN",
        role: "RN",
        status: "present" as const,
      },
      {
        userId: "00000000-0000-0000-0000-000000000002",
        name: "Dr. Smith",
        role: "MD",
        status: "present" as const,
      },
      {
        userId: "00000000-0000-0000-0000-000000000003",
        name: "Social Worker",
        role: "SW",
        status: "remote" as const,
      },
    ],
  };

  it("calls POST /api/v1/idg-meetings with JSON body and cookie", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleMeeting), { status: 201 }),
    );

    const result = await fetchCreateIDGMeeting(input, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/idg-meetings",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ cookie: COOKIE, "Content-Type": "application/json" }),
      }),
    );
    expect(result.id).toBe(MEETING_ID);
    expect(result.status).toBe("scheduled");
  });

  it("throws on validation error (400)", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "IDG meeting validation failed" } }), {
        status: 400,
      }),
    );

    await expect(fetchCreateIDGMeeting(input, COOKIE)).rejects.toThrow(
      "IDG meeting validation failed",
    );
  });
});
