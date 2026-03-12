/**
 * visitSchedule.schema.test.ts — unit tests for VisitSchedule TypeBox schemas.
 */

import { TypeCompiler } from "@sinclair/typebox/compiler";
import { describe, expect, it } from "vitest";
import {
  CreateScheduledVisitBodySchema,
  FrequencyPlanSchema,
  PatchScheduledVisitStatusBodySchema,
  ScheduledVisitListResponseSchema,
  ScheduledVisitResponseSchema,
} from "./visitSchedule.schema.js";

// ── FrequencyPlan ──────────────────────────────────────────────────────────────

describe("FrequencyPlanSchema", () => {
  const v = TypeCompiler.Compile(FrequencyPlanSchema);

  it("accepts valid frequency plan", () => {
    expect(v.Check({ visitsPerWeek: 3 })).toBe(true);
  });

  it("accepts frequency plan with optional notes", () => {
    expect(v.Check({ visitsPerWeek: 5, notes: "Daily visit" })).toBe(true);
  });

  it("rejects visitsPerWeek = 0", () => {
    expect(v.Check({ visitsPerWeek: 0 })).toBe(false);
  });

  it("rejects visitsPerWeek > 14", () => {
    expect(v.Check({ visitsPerWeek: 15 })).toBe(false);
  });

  it("rejects missing visitsPerWeek", () => {
    expect(v.Check({})).toBe(false);
  });
});

// ── CreateScheduledVisitBody ───────────────────────────────────────────────────

describe("CreateScheduledVisitBodySchema", () => {
  const v = TypeCompiler.Compile(CreateScheduledVisitBodySchema);

  const valid = {
    visitType: "routine_rn",
    discipline: "RN",
    scheduledDate: "2026-03-20",
    frequencyPlan: { visitsPerWeek: 3 },
  };

  it("accepts valid create body", () => {
    expect(v.Check(valid)).toBe(true);
  });

  it("accepts optional clinicianId and notes", () => {
    expect(
      v.Check({
        ...valid,
        clinicianId: "aaaaaaaa-0000-0000-0000-000000000001",
        notes: "Per POC order",
      }),
    ).toBe(true);
  });

  it("rejects missing visitType", () => {
    const { visitType: _, ...rest } = valid;
    expect(v.Check(rest)).toBe(false);
  });

  it("rejects invalid discipline", () => {
    expect(v.Check({ ...valid, discipline: "NP" })).toBe(false);
  });

  it("rejects invalid scheduledDate format", () => {
    expect(v.Check({ ...valid, scheduledDate: "not-a-date" })).toBe(false);
  });

  it("accepts all valid disciplines", () => {
    for (const d of ["RN", "SW", "CHAPLAIN", "THERAPY", "AIDE"]) {
      expect(v.Check({ ...valid, discipline: d })).toBe(true);
    }
  });
});

// ── PatchScheduledVisitStatusBody ─────────────────────────────────────────────

describe("PatchScheduledVisitStatusBodySchema", () => {
  const v = TypeCompiler.Compile(PatchScheduledVisitStatusBodySchema);

  it("accepts completed status", () => {
    expect(v.Check({ status: "completed" })).toBe(true);
  });

  it("accepts missed status with reason", () => {
    expect(v.Check({ status: "missed", missedReason: "Patient hospitalized" })).toBe(true);
  });

  it("accepts cancelled status", () => {
    expect(v.Check({ status: "cancelled" })).toBe(true);
  });

  it("rejects invalid status", () => {
    expect(v.Check({ status: "pending" })).toBe(false);
  });

  it("rejects missing status", () => {
    expect(v.Check({})).toBe(false);
  });
});

// ── ScheduledVisitResponse ────────────────────────────────────────────────────

describe("ScheduledVisitResponseSchema", () => {
  const v = TypeCompiler.Compile(ScheduledVisitResponseSchema);

  const valid = {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    patientId: "bbbbbbbb-0000-0000-0000-000000000001",
    locationId: "cccccccc-0000-0000-0000-000000000001",
    clinicianId: null,
    visitType: "routine_rn",
    discipline: "RN",
    scheduledDate: "2026-03-20",
    frequencyPlan: { visitsPerWeek: 3 },
    status: "scheduled",
    completedAt: null,
    cancelledAt: null,
    missedReason: null,
    notes: null,
    createdAt: "2026-03-12T10:00:00.000Z",
    updatedAt: "2026-03-12T10:00:00.000Z",
  };

  it("accepts valid response", () => {
    expect(v.Check(valid)).toBe(true);
  });

  it("accepts with clinicianId", () => {
    expect(
      v.Check({ ...valid, clinicianId: "dddddddd-0000-0000-0000-000000000001" }),
    ).toBe(true);
  });

  it("rejects missing id", () => {
    const { id: _, ...rest } = valid;
    expect(v.Check(rest)).toBe(false);
  });
});

// ── ScheduledVisitListResponse ────────────────────────────────────────────────

describe("ScheduledVisitListResponseSchema", () => {
  const v = TypeCompiler.Compile(ScheduledVisitListResponseSchema);

  it("accepts empty list", () => {
    expect(v.Check({ data: [], total: 0 })).toBe(true);
  });

  it("rejects negative total", () => {
    expect(v.Check({ data: [], total: -1 })).toBe(false);
  });
});
