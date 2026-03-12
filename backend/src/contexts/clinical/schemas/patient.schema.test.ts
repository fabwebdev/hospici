/**
 * Unit tests — patient schemas (T2-1)
 *
 * Covers: CreatePatientBodySchema, PatchPatientBodySchema, PatientListQuerySchema
 */

import { describe, expect, it } from "vitest";
import { TypeCompiler } from "@sinclair/typebox/compiler";
import {
  CreatePatientBodySchema,
  PatchPatientBodySchema,
  PatientListQuerySchema,
} from "./patient.schema.js";

const CreatePatientValidator = TypeCompiler.Compile(CreatePatientBodySchema);
const PatchPatientValidator = TypeCompiler.Compile(PatchPatientBodySchema);
const PatientListQueryValidator = TypeCompiler.Compile(PatientListQuerySchema);

const validCreate = {
  identifier: [{ system: "http://hospici.com/mrn", value: "MRN-001" }],
  name: [{ family: "Doe", given: ["John"] }],
  birthDate: "1945-06-15",
  hospiceLocationId: "00000000-0000-0000-0000-000000000001",
};

describe("CreatePatientBodySchema", () => {
  it("accepts a minimal valid patient", () => {
    expect(CreatePatientValidator.Check(validCreate)).toBe(true);
  });

  it("accepts all optional fields", () => {
    const full = {
      ...validCreate,
      gender: "female",
      address: [{ line: ["123 Main St"], city: "Portland", state: "OR", postalCode: "97201", country: "US" }],
      admissionDate: "2026-01-01",
      dischargeDate: "2026-03-01",
      careModel: "HOSPICE",
      _gender: { id: "ext-001" },
    };
    expect(CreatePatientValidator.Check(full)).toBe(true);
  });

  it("rejects when birthDate is missing", () => {
    const { birthDate: _removed, ...body } = validCreate;
    expect(CreatePatientValidator.Check(body)).toBe(false);
  });

  it("rejects when hospiceLocationId is not a UUID", () => {
    const body = { ...validCreate, hospiceLocationId: "not-a-uuid" };
    expect(CreatePatientValidator.Check(body)).toBe(false);
  });

  it("rejects invalid careModel value", () => {
    const body = { ...validCreate, careModel: "INVALID" };
    expect(CreatePatientValidator.Check(body)).toBe(false);
  });

  it("rejects invalid gender value", () => {
    const body = { ...validCreate, gender: "nonbinary" };
    expect(CreatePatientValidator.Check(body)).toBe(false);
  });

  it("rejects additional properties", () => {
    const body = { ...validCreate, unknownField: "foo" };
    expect(CreatePatientValidator.Check(body)).toBe(false);
  });
});

describe("PatchPatientBodySchema", () => {
  it("accepts empty object (all fields optional)", () => {
    expect(PatchPatientValidator.Check({})).toBe(true);
  });

  it("accepts partial update — name only", () => {
    expect(PatchPatientValidator.Check({ name: [{ family: "Smith", given: ["Jane"] }] })).toBe(true);
  });

  it("accepts partial update — careModel only", () => {
    expect(PatchPatientValidator.Check({ careModel: "PALLIATIVE" })).toBe(true);
  });

  it("rejects invalid careModel in patch", () => {
    expect(PatchPatientValidator.Check({ careModel: "UNKNOWN" })).toBe(false);
  });

  it("rejects additional properties", () => {
    expect(PatchPatientValidator.Check({ extraField: true })).toBe(false);
  });
});

describe("PatientListQuerySchema", () => {
  it("accepts empty query", () => {
    expect(PatientListQueryValidator.Check({})).toBe(true);
  });

  it("accepts valid pagination params", () => {
    expect(PatientListQueryValidator.Check({ page: 2, limit: 50 })).toBe(true);
  });

  it("accepts careModel filter", () => {
    expect(PatientListQueryValidator.Check({ careModel: "CCM" })).toBe(true);
  });

  it("rejects page < 1", () => {
    expect(PatientListQueryValidator.Check({ page: 0 })).toBe(false);
  });

  it("rejects limit > 100", () => {
    expect(PatientListQueryValidator.Check({ limit: 200 })).toBe(false);
  });

  it("rejects invalid careModel", () => {
    expect(PatientListQueryValidator.Check({ careModel: "INVALID" })).toBe(false);
  });
});
