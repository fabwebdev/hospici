// idgMeeting.schema.test.ts
// Unit tests for IDG schema helpers and TypeBox shapes

import { FormatRegistry } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";
import { describe, expect, it } from "vitest";
import {
  CompleteIDGMeetingBodySchema,
  CreateIDGMeetingBodySchema,
  type IDGMember,
  assembleIDGNote,
  checkIDGCompliance,
  hasRequiredAttendees,
} from "./idgMeeting.schema.js";

// Register format validators needed by uuid/date-time fields
if (!FormatRegistry.Has("uuid")) {
  FormatRegistry.Set("uuid", (v) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v),
  );
}
if (!FormatRegistry.Has("date-time")) {
  FormatRegistry.Set("date-time", (v) => !Number.isNaN(Date.parse(v)));
}

const CreateValidator = TypeCompiler.Compile(CreateIDGMeetingBodySchema);
const CompleteValidator = TypeCompiler.Compile(CompleteIDGMeetingBodySchema);

const RN_ATTENDEE: IDGMember = {
  userId: "00000000-0000-0000-0000-000000000001",
  name: "Nurse Ratchet",
  role: "RN",
  status: "present",
};
const MD_ATTENDEE: IDGMember = {
  userId: "00000000-0000-0000-0000-000000000002",
  name: "Dr. House",
  role: "MD",
  status: "present",
};
const SW_ATTENDEE: IDGMember = {
  userId: "00000000-0000-0000-0000-000000000003",
  name: "Social Worker",
  role: "SW",
  status: "remote",
};
const CHAPLAIN_ATTENDEE: IDGMember = {
  userId: "00000000-0000-0000-0000-000000000004",
  name: "Rev. Jones",
  role: "Chaplain",
  status: "present",
};

// ── checkIDGCompliance ────────────────────────────────────────────────────────

describe("checkIDGCompliance", () => {
  it("is compliant when last IDG was today", () => {
    const now = new Date().toISOString();
    const result = checkIDGCompliance(now);
    expect(result.compliant).toBe(true);
    expect(result.daysOverdue).toBe(0);
  });

  it("is compliant at exactly 15 days", () => {
    const last = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
    const result = checkIDGCompliance(last);
    expect(result.compliant).toBe(true);
    expect(result.daysOverdue).toBe(0);
  });

  it("is non-compliant at 16 days (1 day overdue)", () => {
    const last = new Date(Date.now() - 16 * 24 * 60 * 60 * 1000).toISOString();
    const result = checkIDGCompliance(last);
    expect(result.compliant).toBe(false);
    expect(result.daysOverdue).toBe(1);
  });

  it("is non-compliant at 30 days (15 days overdue)", () => {
    const last = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = checkIDGCompliance(last);
    expect(result.compliant).toBe(false);
    expect(result.daysOverdue).toBe(15);
  });

  it("accepts explicit currentDate parameter", () => {
    const last = "2026-01-01T00:00:00.000Z";
    const current = "2026-01-20T00:00:00.000Z"; // 19 days later
    const result = checkIDGCompliance(last, current);
    expect(result.compliant).toBe(false);
    expect(result.daysOverdue).toBe(4);
  });
});

// ── hasRequiredAttendees ──────────────────────────────────────────────────────

// 42 CFR §418.56(a): RN + MD + SW + Chaplain/Spiritual Care all required
describe("hasRequiredAttendees", () => {
  it("returns true when all four disciplines present", () => {
    expect(hasRequiredAttendees([RN_ATTENDEE, MD_ATTENDEE, SW_ATTENDEE, CHAPLAIN_ATTENDEE])).toBe(
      true,
    );
  });

  it("returns true when SW is remote and Chaplain is present", () => {
    expect(
      hasRequiredAttendees([
        RN_ATTENDEE,
        MD_ATTENDEE,
        { ...SW_ATTENDEE, status: "remote" },
        CHAPLAIN_ATTENDEE,
      ]),
    ).toBe(true);
  });

  it("accepts 'Spiritual Care' as the chaplain role", () => {
    const spiritualCare: IDGMember = { ...CHAPLAIN_ATTENDEE, role: "Spiritual Care" };
    expect(hasRequiredAttendees([RN_ATTENDEE, MD_ATTENDEE, SW_ATTENDEE, spiritualCare])).toBe(true);
  });

  it("accepts 'pastoral_counselor' as the chaplain role", () => {
    const pastoral: IDGMember = { ...CHAPLAIN_ATTENDEE, role: "pastoral_counselor" };
    expect(hasRequiredAttendees([RN_ATTENDEE, MD_ATTENDEE, SW_ATTENDEE, pastoral])).toBe(true);
  });

  it("returns false when MD is absent", () => {
    expect(
      hasRequiredAttendees([
        RN_ATTENDEE,
        { ...MD_ATTENDEE, status: "absent" },
        SW_ATTENDEE,
        CHAPLAIN_ATTENDEE,
      ]),
    ).toBe(false);
  });

  it("returns false when RN is missing entirely", () => {
    expect(hasRequiredAttendees([MD_ATTENDEE, SW_ATTENDEE, CHAPLAIN_ATTENDEE])).toBe(false);
  });

  it("returns false when SW is excused", () => {
    expect(
      hasRequiredAttendees([
        RN_ATTENDEE,
        MD_ATTENDEE,
        { ...SW_ATTENDEE, status: "excused" },
        CHAPLAIN_ATTENDEE,
      ]),
    ).toBe(false);
  });

  it("returns false when Chaplain is absent (42 CFR §418.56(a)(4))", () => {
    expect(
      hasRequiredAttendees([
        RN_ATTENDEE,
        MD_ATTENDEE,
        SW_ATTENDEE,
        { ...CHAPLAIN_ATTENDEE, status: "absent" },
      ]),
    ).toBe(false);
  });

  it("returns false when only RN+MD+SW present — missing chaplain", () => {
    expect(hasRequiredAttendees([RN_ATTENDEE, MD_ATTENDEE, SW_ATTENDEE])).toBe(false);
  });

  it("returns false for empty attendee list", () => {
    expect(hasRequiredAttendees([])).toBe(false);
  });
});

// ── assembleIDGNote ───────────────────────────────────────────────────────────

describe("assembleIDGNote", () => {
  it("includes meeting date header", () => {
    const note = assembleIDGNote([RN_ATTENDEE], {}, "2026-03-12T10:00:00.000Z");
    expect(note).toMatch(/IDG Meeting Note/);
  });

  it("includes attendee role and notes", () => {
    const notes = {
      "00000000-0000-0000-0000-000000000001": {
        role: "RN",
        notes: "Patient stable, pain 4/10",
        goalsReviewed: true,
        concerns: null,
      },
    };
    const note = assembleIDGNote([RN_ATTENDEE], notes, "2026-03-12T10:00:00.000Z");
    expect(note).toContain("RN");
    expect(note).toContain("Patient stable, pain 4/10");
    expect(note).toContain("Goals of care reviewed: Yes");
  });

  it("includes concerns when present", () => {
    const notes = {
      "00000000-0000-0000-0000-000000000001": {
        role: "RN",
        notes: "Some notes",
        goalsReviewed: false,
        concerns: "Family distress",
      },
    };
    const note = assembleIDGNote([RN_ATTENDEE], notes, "2026-03-12T10:00:00.000Z");
    expect(note).toContain("Family distress");
  });

  it("skips absent attendees", () => {
    const absent: IDGMember = { ...MD_ATTENDEE, status: "absent" };
    const notes = {
      "00000000-0000-0000-0000-000000000002": {
        role: "MD",
        notes: "Should not appear",
        goalsReviewed: false,
        concerns: null,
      },
    };
    const note = assembleIDGNote([absent], notes, "2026-03-12T10:00:00.000Z");
    expect(note).not.toContain("Should not appear");
  });
});

// ── CreateIDGMeetingBodySchema ────────────────────────────────────────────────

describe("CreateIDGMeetingBodySchema", () => {
  const validBody = {
    patientId: "00000000-0000-0000-0000-000000000099",
    scheduledAt: "2026-03-20T14:00:00.000Z",
    attendees: [RN_ATTENDEE, MD_ATTENDEE, SW_ATTENDEE, CHAPLAIN_ATTENDEE],
  };

  it("accepts a valid create body", () => {
    expect(CreateValidator.Check(validBody)).toBe(true);
  });

  it("rejects missing patientId", () => {
    const { patientId: _p, ...noPatient } = validBody;
    expect(CreateValidator.Check(noPatient)).toBe(false);
  });

  it("rejects missing scheduledAt", () => {
    const { scheduledAt: _s, ...noDate } = validBody;
    expect(CreateValidator.Check(noDate)).toBe(false);
  });

  it("rejects empty attendees array", () => {
    expect(CreateValidator.Check({ ...validBody, attendees: [] })).toBe(false);
  });
});

// ── CompleteIDGMeetingBodySchema ──────────────────────────────────────────────

describe("CompleteIDGMeetingBodySchema", () => {
  const validComplete = {
    attendees: [RN_ATTENDEE, MD_ATTENDEE, SW_ATTENDEE],
    attendeeNotes: {
      "00000000-0000-0000-0000-000000000001": {
        role: "RN",
        notes: "Patient update",
        goalsReviewed: true,
        concerns: null,
      },
    },
    carePlanReviewed: true,
    symptomManagementDiscussed: true,
    goalsOfCareReviewed: true,
  };

  it("accepts a valid completion body", () => {
    expect(CompleteValidator.Check(validComplete)).toBe(true);
  });

  it("accepts empty attendeeNotes", () => {
    expect(CompleteValidator.Check({ ...validComplete, attendeeNotes: {} })).toBe(true);
  });

  it("rejects missing carePlanReviewed", () => {
    const { carePlanReviewed: _c, ...noReviewed } = validComplete;
    expect(CompleteValidator.Check(noReviewed)).toBe(false);
  });

  it("rejects missing attendees", () => {
    const { attendees: _a, ...noAttendees } = validComplete;
    expect(CompleteValidator.Check(noAttendees)).toBe(false);
  });
});
