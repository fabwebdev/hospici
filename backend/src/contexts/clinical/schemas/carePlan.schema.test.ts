/**
 * Unit tests — care plan schemas (T2-5)
 *
 * Covers: DisciplineTypeSchema, SmartGoalSchema, CreateCarePlanBodySchema,
 *         PatchCarePlanBodySchema, CarePlanResponseSchema.
 */

import { TypeCompiler } from "@sinclair/typebox/compiler";
import { describe, expect, it } from "vitest";
import {
  CarePlanResponseSchema,
  CreateCarePlanBodySchema,
  DisciplineTypeSchema,
  PatchCarePlanBodySchema,
  SmartGoalSchema,
} from "./carePlan.schema.js";

const DisciplineValidator = TypeCompiler.Compile(DisciplineTypeSchema);
const SmartGoalValidator = TypeCompiler.Compile(SmartGoalSchema);
const CreateValidator = TypeCompiler.Compile(CreateCarePlanBodySchema);
const PatchValidator = TypeCompiler.Compile(PatchCarePlanBodySchema);
const ResponseValidator = TypeCompiler.Compile(CarePlanResponseSchema);

const validUUID = "00000000-0000-0000-0000-000000000001";
const now = "2026-03-12T10:00:00.000Z";
const today = "2026-04-01";

const validGoal = {
  id: validUUID,
  goal: "Reduce pain to manageable level",
  specific: "Patient reports pain ≤ 3/10",
  measurable: "Daily NRS score",
  achievable: "Adjust opioid regimen as needed",
  relevant: "Pain is primary comfort goal",
  timeBound: "Within 7 days",
  targetDate: today,
  status: "active" as const,
};

// ── DisciplineTypeSchema ──────────────────────────────────────────────────────

describe("DisciplineTypeSchema", () => {
  it("accepts all valid disciplines", () => {
    for (const d of ["RN", "SW", "CHAPLAIN", "THERAPY", "AIDE"]) {
      expect(DisciplineValidator.Check(d)).toBe(true);
    }
  });

  it("rejects unknown discipline", () => {
    expect(DisciplineValidator.Check("NURSE")).toBe(false);
  });

  it("rejects lowercase", () => {
    expect(DisciplineValidator.Check("rn")).toBe(false);
  });
});

// ── SmartGoalSchema ───────────────────────────────────────────────────────────

describe("SmartGoalSchema", () => {
  it("accepts a valid SMART goal", () => {
    expect(SmartGoalValidator.Check(validGoal)).toBe(true);
  });

  it("accepts met and revised statuses", () => {
    expect(SmartGoalValidator.Check({ ...validGoal, status: "met" })).toBe(true);
    expect(SmartGoalValidator.Check({ ...validGoal, status: "revised" })).toBe(true);
  });

  it("rejects unknown status", () => {
    expect(SmartGoalValidator.Check({ ...validGoal, status: "pending" })).toBe(false);
  });

  it("rejects empty goal string", () => {
    expect(SmartGoalValidator.Check({ ...validGoal, goal: "" })).toBe(false);
  });

  it("rejects missing targetDate", () => {
    const { targetDate: _removed, ...body } = validGoal;
    expect(SmartGoalValidator.Check(body)).toBe(false);
  });

  it("rejects invalid date format for targetDate", () => {
    expect(SmartGoalValidator.Check({ ...validGoal, targetDate: "April 1 2026" })).toBe(false);
  });

  it("rejects additional properties", () => {
    expect(SmartGoalValidator.Check({ ...validGoal, priority: "high" })).toBe(false);
  });
});

// ── CreateCarePlanBodySchema ──────────────────────────────────────────────────

describe("CreateCarePlanBodySchema", () => {
  it("accepts empty body (all optional)", () => {
    expect(CreateValidator.Check({})).toBe(true);
  });

  it("accepts body with notes only", () => {
    expect(CreateValidator.Check({ notes: "Initial RN assessment complete" })).toBe(true);
  });

  it("accepts body with notes and goals", () => {
    expect(
      CreateValidator.Check({
        notes: "Patient stable",
        goals: [validGoal],
      }),
    ).toBe(true);
  });

  it("accepts empty goals array", () => {
    expect(CreateValidator.Check({ goals: [] })).toBe(true);
  });

  it("rejects additional properties", () => {
    expect(CreateValidator.Check({ notes: "ok", discipline: "RN" })).toBe(false);
  });

  it("rejects invalid goal inside goals array", () => {
    expect(
      CreateValidator.Check({
        goals: [{ ...validGoal, status: "bad" }],
      }),
    ).toBe(false);
  });
});

// ── PatchCarePlanBodySchema ───────────────────────────────────────────────────

describe("PatchCarePlanBodySchema", () => {
  it("accepts empty patch (no-op)", () => {
    expect(PatchValidator.Check({})).toBe(true);
  });

  it("accepts notes-only patch", () => {
    expect(PatchValidator.Check({ notes: "Updated notes from RN visit" })).toBe(true);
  });

  it("accepts goals-only patch", () => {
    expect(PatchValidator.Check({ goals: [validGoal] })).toBe(true);
  });

  it("accepts full patch", () => {
    expect(PatchValidator.Check({ notes: "Updated", goals: [validGoal] })).toBe(true);
  });

  it("rejects additional properties", () => {
    expect(PatchValidator.Check({ notes: "ok", discipline: "RN" })).toBe(false);
  });
});

// ── CarePlanResponseSchema ────────────────────────────────────────────────────

const validPhysicianReview = {
  initialReviewDeadline: today,
  initialReviewCompletedAt: null,
  initialReviewedBy: null,
  lastReviewAt: null,
  nextReviewDue: null,
  reviewHistory: [],
  isInitialReviewOverdue: false,
  isOngoingReviewOverdue: false,
};

describe("CarePlanResponseSchema", () => {
  const validResponse = {
    id: validUUID,
    patientId: "00000000-0000-0000-0000-000000000002",
    locationId: "00000000-0000-0000-0000-000000000003",
    disciplineSections: {
      RN: {
        notes: "Patient on comfort measures",
        goals: [validGoal],
        lastUpdatedBy: validUUID,
        lastUpdatedAt: now,
      },
    },
    physicianReview: validPhysicianReview,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  it("accepts a valid care plan response", () => {
    expect(ResponseValidator.Check(validResponse)).toBe(true);
  });

  it("accepts response with multiple discipline sections", () => {
    expect(
      ResponseValidator.Check({
        ...validResponse,
        disciplineSections: {
          RN: { notes: "RN notes", goals: [], lastUpdatedBy: validUUID, lastUpdatedAt: now },
          SW: {
            notes: "SW notes",
            goals: [],
            lastUpdatedBy: "00000000-0000-0000-0000-000000000099",
            lastUpdatedAt: now,
          },
          PHYSICIAN: {
            notes: "Plan reviewed",
            goals: [],
            lastUpdatedBy: validUUID,
            lastUpdatedAt: now,
          },
        },
        physicianReview: {
          ...validPhysicianReview,
          initialReviewCompletedAt: now,
          initialReviewedBy: validUUID,
          lastReviewAt: now,
          nextReviewDue: "2026-03-26",
          reviewHistory: [
            {
              reviewedBy: validUUID,
              reviewedAt: now,
              type: "initial",
              signatureNote: "I have reviewed and approve this plan of care",
            },
          ],
        },
      }),
    ).toBe(true);
  });

  it("accepts empty discipline_sections (new care plan)", () => {
    expect(
      ResponseValidator.Check({
        ...validResponse,
        disciplineSections: {},
      }),
    ).toBe(true);
  });

  it("rejects version < 1", () => {
    expect(ResponseValidator.Check({ ...validResponse, version: 0 })).toBe(false);
  });

  it("rejects missing patientId", () => {
    const { patientId: _removed, ...body } = validResponse;
    expect(ResponseValidator.Check(body)).toBe(false);
  });
});
