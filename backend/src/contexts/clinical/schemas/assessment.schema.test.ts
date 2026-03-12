/**
 * Unit tests — pain assessment schemas (T2-3)
 *
 * Covers: all 5 scale schemas + CreateAssessmentBodySchema
 */

import { TypeCompiler } from "@sinclair/typebox/compiler";
import { describe, expect, it } from "vitest";
import { CreateAssessmentBodySchema } from "./assessment.schema.js";
import { EsasScaleSchema } from "./esasScale.schema.js";
import { FlaccScaleSchema } from "./flaccScale.schema.js";
import { NrsScaleSchema } from "./nrsScale.schema.js";
import { PainadScaleSchema } from "./painadScale.schema.js";
import { WongBakerScaleSchema } from "./wongBakerScale.schema.js";

const FlaccValidator = TypeCompiler.Compile(FlaccScaleSchema);
const PainadValidator = TypeCompiler.Compile(PainadScaleSchema);
const NrsValidator = TypeCompiler.Compile(NrsScaleSchema);
const WongBakerValidator = TypeCompiler.Compile(WongBakerScaleSchema);
const EsasValidator = TypeCompiler.Compile(EsasScaleSchema);
const CreateAssessmentValidator = TypeCompiler.Compile(CreateAssessmentBodySchema);

// ── FLACC ─────────────────────────────────────────────────────────────────────

const validFlacc = {
  id: "00000000-0000-0000-0000-000000000001",
  patientId: "00000000-0000-0000-0000-000000000002",
  assessedAt: "2026-03-12T10:00:00.000Z",
  face: 1,
  legs: 0,
  activity: 2,
  cry: 1,
  consolability: 0,
  totalScore: 4,
  assessedBy: "00000000-0000-0000-0000-000000000003",
  locationId: "00000000-0000-0000-0000-000000000004",
};

describe("FlaccScaleSchema", () => {
  it("accepts a valid FLACC assessment", () => {
    expect(FlaccValidator.Check(validFlacc)).toBe(true);
  });

  it("rejects face > 2", () => {
    expect(FlaccValidator.Check({ ...validFlacc, face: 3 })).toBe(false);
  });

  it("rejects totalScore > 10", () => {
    expect(FlaccValidator.Check({ ...validFlacc, totalScore: 11 })).toBe(false);
  });

  it("rejects negative scores", () => {
    expect(FlaccValidator.Check({ ...validFlacc, legs: -1 })).toBe(false);
  });
});

// ── PAINAD ────────────────────────────────────────────────────────────────────

const validPainad = {
  breathing: 0,
  negativeVocalization: 1,
  facialExpression: 2,
  bodyLanguage: 0,
  consolability: 1,
  totalScore: 4,
};

describe("PainadScaleSchema", () => {
  it("accepts a valid PAINAD assessment", () => {
    expect(PainadValidator.Check(validPainad)).toBe(true);
  });

  it("accepts all zeros (no distress)", () => {
    expect(
      PainadValidator.Check({
        breathing: 0,
        negativeVocalization: 0,
        facialExpression: 0,
        bodyLanguage: 0,
        consolability: 0,
        totalScore: 0,
      }),
    ).toBe(true);
  });

  it("accepts max score (10)", () => {
    expect(
      PainadValidator.Check({
        breathing: 2,
        negativeVocalization: 2,
        facialExpression: 2,
        bodyLanguage: 2,
        consolability: 2,
        totalScore: 10,
      }),
    ).toBe(true);
  });

  it("rejects breathing > 2", () => {
    expect(PainadValidator.Check({ ...validPainad, breathing: 3 })).toBe(false);
  });

  it("rejects totalScore > 10", () => {
    expect(PainadValidator.Check({ ...validPainad, totalScore: 11 })).toBe(false);
  });

  it("rejects additional properties", () => {
    expect(PainadValidator.Check({ ...validPainad, extra: "foo" })).toBe(false);
  });
});

// ── NRS ───────────────────────────────────────────────────────────────────────

describe("NrsScaleSchema", () => {
  it("accepts score 0", () => {
    expect(NrsValidator.Check({ score: 0 })).toBe(true);
  });

  it("accepts score 10", () => {
    expect(NrsValidator.Check({ score: 10 })).toBe(true);
  });

  it("accepts score with optional description", () => {
    expect(NrsValidator.Check({ score: 7, description: "burning pain in right hip" })).toBe(true);
  });

  it("rejects score > 10", () => {
    expect(NrsValidator.Check({ score: 11 })).toBe(false);
  });

  it("rejects score < 0", () => {
    expect(NrsValidator.Check({ score: -1 })).toBe(false);
  });

  it("rejects non-integer score", () => {
    expect(NrsValidator.Check({ score: 7.5 })).toBe(false);
  });
});

// ── Wong-Baker FACES ──────────────────────────────────────────────────────────

describe("WongBakerScaleSchema", () => {
  it("accepts score 0 (no hurt)", () => {
    expect(WongBakerValidator.Check({ score: 0 })).toBe(true);
  });

  it("accepts all valid face scores", () => {
    for (const score of [0, 2, 4, 6, 8, 10]) {
      expect(WongBakerValidator.Check({ score })).toBe(true);
    }
  });

  it("rejects odd number 3", () => {
    expect(WongBakerValidator.Check({ score: 3 })).toBe(false);
  });

  it("rejects odd number 7", () => {
    expect(WongBakerValidator.Check({ score: 7 })).toBe(false);
  });

  it("rejects score 1", () => {
    expect(WongBakerValidator.Check({ score: 1 })).toBe(false);
  });

  it("rejects score 9", () => {
    expect(WongBakerValidator.Check({ score: 9 })).toBe(false);
  });
});

// ── ESAS ──────────────────────────────────────────────────────────────────────

const validEsas = {
  pain: 5,
  fatigue: 7,
  nausea: 2,
  depression: 3,
  anxiety: 4,
  drowsiness: 6,
  appetite: 8,
  wellbeing: 5,
  dyspnea: 3,
};

describe("EsasScaleSchema", () => {
  it("accepts a valid ESAS assessment", () => {
    expect(EsasValidator.Check(validEsas)).toBe(true);
  });

  it("accepts ESAS with optional other symptom", () => {
    expect(EsasValidator.Check({ ...validEsas, otherSymptom: "constipation", otherScore: 4 })).toBe(
      true,
    );
  });

  it("accepts all zeros", () => {
    const zeros = {
      pain: 0,
      fatigue: 0,
      nausea: 0,
      depression: 0,
      anxiety: 0,
      drowsiness: 0,
      appetite: 0,
      wellbeing: 0,
      dyspnea: 0,
    };
    expect(EsasValidator.Check(zeros)).toBe(true);
  });

  it("rejects pain > 10", () => {
    expect(EsasValidator.Check({ ...validEsas, pain: 11 })).toBe(false);
  });

  it("rejects non-integer dyspnea", () => {
    expect(EsasValidator.Check({ ...validEsas, dyspnea: 3.5 })).toBe(false);
  });

  it("rejects missing required symptom", () => {
    const { fatigue: _removed, ...body } = validEsas;
    expect(EsasValidator.Check(body)).toBe(false);
  });
});

// ── CreateAssessmentBody ──────────────────────────────────────────────────────

describe("CreateAssessmentBodySchema", () => {
  it("accepts a valid NRS assessment body", () => {
    expect(
      CreateAssessmentValidator.Check({
        assessmentType: "NRS",
        assessedAt: "2026-03-12T10:00:00.000Z",
        data: { score: 6 },
      }),
    ).toBe(true);
  });

  it("accepts a valid ESAS assessment body", () => {
    expect(
      CreateAssessmentValidator.Check({
        assessmentType: "ESAS",
        assessedAt: "2026-03-12T10:00:00.000Z",
        data: validEsas,
      }),
    ).toBe(true);
  });

  it("rejects unknown assessmentType", () => {
    expect(
      CreateAssessmentValidator.Check({
        assessmentType: "VAS",
        assessedAt: "2026-03-12T10:00:00.000Z",
        data: { score: 5 },
      }),
    ).toBe(false);
  });

  it("rejects missing assessedAt", () => {
    expect(
      CreateAssessmentValidator.Check({
        assessmentType: "NRS",
        data: { score: 5 },
      }),
    ).toBe(false);
  });

  it("rejects missing data", () => {
    expect(
      CreateAssessmentValidator.Check({
        assessmentType: "NRS",
        assessedAt: "2026-03-12T10:00:00.000Z",
      }),
    ).toBe(false);
  });

  it("rejects additional properties", () => {
    expect(
      CreateAssessmentValidator.Check({
        assessmentType: "NRS",
        assessedAt: "2026-03-12T10:00:00.000Z",
        data: { score: 5 },
        extraField: true,
      }),
    ).toBe(false);
  });
});
