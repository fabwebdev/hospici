/**
 * VantageChartInputSchema unit tests
 */

import { TypeCompiler } from "@sinclair/typebox/compiler";
import { describe, expect, it } from "vitest";
import { VantageChartInputSchema } from "./vantagechart-input.schema.js";

const validator = TypeCompiler.Compile(VantageChartInputSchema);

const validInput = {
  visitType: "routine_rn",
  patientStatus: {
    overallCondition: "stable",
    isAlertAndOriented: true,
    orientationLevel: "x4",
  },
  painAssessment: {
    hasPain: false,
  },
  symptoms: [],
  interventions: [],
  psychosocial: {
    caregiverCoping: "well",
    patientMood: "calm",
  },
  carePlan: {
    frequenciesFollowed: true,
    medicationCompliance: "compliant",
  },
  safety: {
    fallRisk: "low",
  },
  planChanges: [],
  recordedAt: "2026-03-12T10:00:00.000Z",
  inputMethod: "touch",
};

describe("VantageChartInputSchema", () => {
  it("accepts a minimal valid input", () => {
    expect(validator.Check(validInput)).toBe(true);
  });

  it("accepts input with pain", () => {
    const withPain = {
      ...validInput,
      painAssessment: {
        hasPain: true,
        painScale: 6,
        painLocation: "lower back",
        painQuality: ["dull", "aching"],
        painManagementEffective: false,
        breakthroughPain: true,
      },
    };
    expect(validator.Check(withPain)).toBe(true);
  });

  it("accepts input with symptoms", () => {
    const withSymptoms = {
      ...validInput,
      symptoms: [
        {
          symptom: "dyspnea",
          severity: 7,
          isNew: true,
          isWorsening: false,
          interventionProvided: true,
        },
      ],
    };
    expect(validator.Check(withSymptoms)).toBe(true);
  });

  it("accepts input with interventions", () => {
    const withInterventions = {
      ...validInput,
      interventions: [
        {
          category: "medication_admin",
          description: "Morphine 5mg sublingual administered",
          patientResponse: "positive",
        },
      ],
    };
    expect(validator.Check(withInterventions)).toBe(true);
  });

  it("accepts input with plan changes", () => {
    const withChanges = {
      ...validInput,
      planChanges: [
        {
          type: "new_order",
          description: "Increase Morphine to 10mg q4h",
          requiresPhysician: true,
        },
      ],
    };
    expect(validator.Check(withChanges)).toBe(true);
  });

  it("rejects invalid visitType", () => {
    const bad = { ...validInput, visitType: "invalid_type" };
    expect(validator.Check(bad)).toBe(false);
  });

  it("rejects painScale out of range", () => {
    const bad = {
      ...validInput,
      painAssessment: { hasPain: true, painScale: 11 },
    };
    expect(validator.Check(bad)).toBe(false);
  });

  it("rejects symptom severity out of range", () => {
    const bad = {
      ...validInput,
      symptoms: [
        {
          symptom: "pain",
          severity: -1,
          isNew: false,
          isWorsening: false,
          interventionProvided: false,
        },
      ],
    };
    expect(validator.Check(bad)).toBe(false);
  });

  it("rejects additionalNotes over 1000 chars", () => {
    const bad = { ...validInput, additionalNotes: "x".repeat(1001) };
    expect(validator.Check(bad)).toBe(false);
  });

  it("rejects missing required fields", () => {
    const bad = { visitType: "routine_rn" };
    expect(validator.Check(bad)).toBe(false);
  });

  it("accepts voice input method", () => {
    const voice = { ...validInput, inputMethod: "voice" };
    expect(validator.Check(voice)).toBe(true);
  });
});
