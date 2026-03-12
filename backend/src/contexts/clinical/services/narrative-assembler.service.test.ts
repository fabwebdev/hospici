/**
 * NarrativeAssemblerService — unit tests for:
 *  - Condition evaluator (all 12 operators)
 *  - Template assembly (sections, fragments, context rules)
 *  - Handlebars helpers (formatSymptoms, etc.)
 */

import { describe, expect, it } from "vitest";
import { NarrativeAssemblerService } from "./narrative-assembler.service.js";
import type { RuleCondition } from "../schemas/narrative-template.schema.js";
import type { VantageChartInput } from "../schemas/vantagechart-input.schema.js";
import { ROUTINE_RN_TEMPLATE } from "./vantageChart.templates.js";

const assembler = new NarrativeAssemblerService();

// ── Condition evaluator tests ──────────────────────────────────────────────────

describe("NarrativeAssemblerService.evaluateCondition", () => {
  const input = {
    level: 5,
    name: "alice",
    flag: true,
    arr: [1, 2, 3],
    nested: { x: 7 },
    items: [{ severity: 3 }, { severity: 9 }],
  };

  it("eq: returns true when path equals value", () => {
    expect(assembler.evaluateCondition({ op: "eq", path: "name", value: "alice" }, input)).toBe(true);
    expect(assembler.evaluateCondition({ op: "eq", path: "name", value: "bob" }, input)).toBe(false);
  });

  it("neq: returns true when path does not equal value", () => {
    expect(assembler.evaluateCondition({ op: "neq", path: "name", value: "bob" }, input)).toBe(true);
    expect(assembler.evaluateCondition({ op: "neq", path: "name", value: "alice" }, input)).toBe(false);
  });

  it("gt / gte / lt / lte: numeric comparisons", () => {
    expect(assembler.evaluateCondition({ op: "gt", path: "level", value: 4 }, input)).toBe(true);
    expect(assembler.evaluateCondition({ op: "gt", path: "level", value: 5 }, input)).toBe(false);
    expect(assembler.evaluateCondition({ op: "gte", path: "level", value: 5 }, input)).toBe(true);
    expect(assembler.evaluateCondition({ op: "lt", path: "level", value: 6 }, input)).toBe(true);
    expect(assembler.evaluateCondition({ op: "lte", path: "level", value: 5 }, input)).toBe(true);
  });

  it("truthy / falsy: presence checks", () => {
    expect(assembler.evaluateCondition({ op: "truthy", path: "flag" }, input)).toBe(true);
    expect(assembler.evaluateCondition({ op: "falsy", path: "missing" }, input)).toBe(true);
  });

  it("arrayLength: checks array size", () => {
    expect(assembler.evaluateCondition({ op: "arrayLength", path: "arr", gt: 2 }, input)).toBe(true);
    expect(assembler.evaluateCondition({ op: "arrayLength", path: "arr", eq: 3 }, input)).toBe(true);
    expect(assembler.evaluateCondition({ op: "arrayLength", path: "arr", lt: 2 }, input)).toBe(false);
  });

  it("arrayAny: true when at least one element matches", () => {
    const cond: RuleCondition = {
      op: "arrayAny",
      path: "items",
      where: { op: "gte", path: "severity", value: 8 },
    };
    expect(assembler.evaluateCondition(cond, input)).toBe(true);
  });

  it("arrayEvery: true when all elements match", () => {
    const condTrue: RuleCondition = {
      op: "arrayEvery",
      path: "items",
      where: { op: "gte", path: "severity", value: 1 },
    };
    const condFalse: RuleCondition = {
      op: "arrayEvery",
      path: "items",
      where: { op: "gte", path: "severity", value: 5 },
    };
    expect(assembler.evaluateCondition(condTrue, input)).toBe(true);
    expect(assembler.evaluateCondition(condFalse, input)).toBe(false);
  });

  it("and: requires all conditions true", () => {
    const cond: RuleCondition = {
      op: "and",
      conditions: [
        { op: "gt", path: "level", value: 4 },
        { op: "eq", path: "name", value: "alice" },
      ],
    };
    expect(assembler.evaluateCondition(cond, input)).toBe(true);
  });

  it("or: requires at least one condition true", () => {
    const cond: RuleCondition = {
      op: "or",
      conditions: [
        { op: "eq", path: "name", value: "bob" },
        { op: "truthy", path: "flag" },
      ],
    };
    expect(assembler.evaluateCondition(cond, input)).toBe(true);
  });

  it("not: inverts condition", () => {
    expect(
      assembler.evaluateCondition(
        { op: "not", condition: { op: "eq", path: "name", value: "bob" } },
        input,
      ),
    ).toBe(true);
  });

  it("handles nested dot-path", () => {
    expect(
      assembler.evaluateCondition({ op: "eq", path: "nested.x", value: 7 }, input),
    ).toBe(true);
  });
});

// ── Assembly tests ─────────────────────────────────────────────────────────────

const baseInput: VantageChartInput = {
  visitType: "routine_rn",
  patientStatus: {
    overallCondition: "stable",
    isAlertAndOriented: true,
    orientationLevel: "x4",
  },
  painAssessment: { hasPain: false },
  symptoms: [],
  interventions: [],
  psychosocial: { caregiverCoping: "well", patientMood: "calm" },
  carePlan: { frequenciesFollowed: true, medicationCompliance: "compliant" },
  safety: { fallRisk: "low" },
  planChanges: [],
  recordedAt: "2026-03-12T10:00:00.000Z",
  inputMethod: "touch",
};

describe("NarrativeAssemblerService.assembleNarrative", () => {
  it("produces a non-empty narrative for minimal input", () => {
    const result = assembler.assembleNarrative(ROUTINE_RN_TEMPLATE, baseInput);
    expect(result.narrative.length).toBeGreaterThan(20);
    expect(result.metadata.sectionCount).toBeGreaterThan(0);
  });

  it("includes pain narrative when hasPain = true", () => {
    const input: VantageChartInput = {
      ...baseInput,
      painAssessment: {
        hasPain: true,
        painScale: 6,
        painLocation: "lower back",
        painQuality: ["dull"],
        painManagementEffective: false,
        breakthroughPain: false,
      },
    };
    const result = assembler.assembleNarrative(ROUTINE_RN_TEMPLATE, input);
    expect(result.narrative).toContain("6/10");
    expect(result.narrative).toContain("lower back");
  });

  it("includes 'denies pain' when hasPain = false", () => {
    const result = assembler.assembleNarrative(ROUTINE_RN_TEMPLATE, baseInput);
    expect(result.narrative).toContain("denies pain");
  });

  it("includes severe pain context rule when painScale >= 7", () => {
    const input: VantageChartInput = {
      ...baseInput,
      painAssessment: {
        hasPain: true,
        painScale: 8,
        painManagementEffective: false,
      },
    };
    const result = assembler.assembleNarrative(ROUTINE_RN_TEMPLATE, input);
    expect(result.narrative).toContain("SEVERE PAIN");
  });

  it("includes critical condition context rule", () => {
    const input: VantageChartInput = {
      ...baseInput,
      patientStatus: { ...baseInput.patientStatus, overallCondition: "critical" },
    };
    const result = assembler.assembleNarrative(ROUTINE_RN_TEMPLATE, input);
    expect(result.narrative).toContain("CRITICAL CONDITION");
  });

  it("includes worsening symptom note when isWorsening = true", () => {
    const input: VantageChartInput = {
      ...baseInput,
      symptoms: [
        {
          symptom: "dyspnea",
          severity: 7,
          isNew: false,
          isWorsening: true,
          interventionProvided: false,
        },
      ],
    };
    const result = assembler.assembleNarrative(ROUTINE_RN_TEMPLATE, input);
    expect(result.narrative).toContain("worsening");
    expect(result.narrative).toContain("dyspnea");
  });

  it("records traceability entries", () => {
    const result = assembler.assembleNarrative(ROUTINE_RN_TEMPLATE, baseInput);
    expect(result.traceability.length).toBeGreaterThan(0);
    expect(result.traceability[0]).toHaveProperty("narrativeSegment");
    expect(result.traceability[0]).toHaveProperty("sourceFragment");
    expect(result.traceability[0]).toHaveProperty("inputData");
  });

  it("includes caregiver crisis context rule", () => {
    const input: VantageChartInput = {
      ...baseInput,
      psychosocial: { caregiverCoping: "crisis", patientMood: "anxious" },
    };
    const result = assembler.assembleNarrative(ROUTINE_RN_TEMPLATE, input);
    expect(result.narrative).toContain("CAREGIVER CRISIS");
  });

  it("calculates completeness percent between 0 and 100", () => {
    const result = assembler.assembleNarrative(ROUTINE_RN_TEMPLATE, baseInput);
    expect(result.metadata.completenessPercent).toBeGreaterThanOrEqual(0);
    expect(result.metadata.completenessPercent).toBeLessThanOrEqual(100);
  });
});
