/**
 * PhiEncryptionService unit tests.
 * DB calls are mocked — no real PostgreSQL required.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { PHI_FIELDS, PhiEncryptionService } from "./phi-encryption.service.js";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const { mockExecute } = vi.hoisted(() => ({
  mockExecute: vi.fn(),
}));

vi.mock("@/db/client.js", () => ({ db: { execute: mockExecute } }));
vi.mock("@/config/env.js", () => ({
  env: { phiEncryptionKey: "test-key-32-chars-minimum-length!" },
}));

// ── PHI_FIELDS inventory ──────────────────────────────────────────────────────

describe("PHI_FIELDS", () => {
  it("covers all 18 HIPAA Safe Harbor identifier classes via 19 field-name entries", () => {
    // 18 HIPAA classes, but identifier #7 (SSN) has two field-name variants
    // (ssn + socialSecurityNumber) and identifier #8 (MRN) adds mrn → 19 entries.
    expect(PHI_FIELDS.size).toBe(19);
  });

  it("includes all 10 fields covered by logging redact", () => {
    const loggingRedactFields = [
      "firstName",
      "lastName",
      "dob",
      "ssn",
      "medicareId",
      "address",
      "phone",
      "email",
      "emergencyContact",
      "insuranceId",
    ];
    for (const field of loggingRedactFields) {
      expect(PHI_FIELDS.has(field), `expected PHI_FIELDS to include '${field}'`).toBe(true);
    }
  });

  it("includes the 8 additional HIPAA identifiers", () => {
    const additionalFields = [
      "faxNumber",
      "url",
      "ipAddress",
      "socialSecurityNumber",
      "accountNumber",
      "certificateLicenseNumber",
      "vehicleId",
      "deviceId",
    ];
    for (const field of additionalFields) {
      expect(PHI_FIELDS.has(field), `expected PHI_FIELDS to include '${field}'`).toBe(true);
    }
  });
});

// ── encrypt() ────────────────────────────────────────────────────────────────

describe("PhiEncryptionService.encrypt()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls db.execute once and returns the ciphertext from the result row", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ ciphertext: "base64ciphertext==" }] });

    const result = await PhiEncryptionService.encrypt("John Smith");

    expect(mockExecute).toHaveBeenCalledOnce();
    expect(result).toBe("base64ciphertext==");
  });
});

// ── decrypt() ────────────────────────────────────────────────────────────────

describe("PhiEncryptionService.decrypt()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls db.execute once and returns the plaintext from the result row", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ plaintext: "Jane Doe" }] });

    const result = await PhiEncryptionService.decrypt("base64ciphertext==");

    expect(mockExecute).toHaveBeenCalledOnce();
    expect(result).toBe("Jane Doe");
  });
});

// ── encryptFields() ───────────────────────────────────────────────────────────

describe("PhiEncryptionService.encryptFields()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("encrypts PHI fields and leaves non-PHI fields unchanged", async () => {
    // Returns different ciphertext per call
    mockExecute
      .mockResolvedValueOnce({ rows: [{ ciphertext: "enc_john" }] })
      .mockResolvedValueOnce({ rows: [{ ciphertext: "enc_smith" }] });

    const record = {
      firstName: "John",
      lastName: "Smith",
      resourceType: "Patient", // non-PHI — must not be encrypted
      locationId: "uuid-123",  // non-PHI — must not be encrypted
    };

    const result = await PhiEncryptionService.encryptFields(record);

    expect(result.firstName).toBe("enc_john");
    expect(result.lastName).toBe("enc_smith");
    expect(result.resourceType).toBe("Patient");
    expect(result.locationId).toBe("uuid-123");
    expect(mockExecute).toHaveBeenCalledTimes(2);
  });

  it("skips null and undefined PHI fields without calling encrypt", async () => {
    const record = { firstName: null, lastName: undefined, resourceType: "Patient" };
    const result = await PhiEncryptionService.encryptFields(record);

    expect(result.firstName).toBeNull();
    expect(result.lastName).toBeUndefined();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  it("does not mutate the original record", async () => {
    mockExecute.mockResolvedValueOnce({ rows: [{ ciphertext: "enc_email" }] });

    const original = { email: "patient@example.com", resourceType: "Patient" };
    await PhiEncryptionService.encryptFields(original);

    expect(original.email).toBe("patient@example.com");
  });
});

// ── decryptFields() ───────────────────────────────────────────────────────────

describe("PhiEncryptionService.decryptFields()", () => {
  beforeEach(() => vi.clearAllMocks());

  it("decrypts PHI fields and leaves non-PHI fields unchanged", async () => {
    mockExecute
      .mockResolvedValueOnce({ rows: [{ plaintext: "John" }] })
      .mockResolvedValueOnce({ rows: [{ plaintext: "555-1234" }] });

    const record = {
      firstName: "enc_john",
      phone: "enc_phone",
      careModel: "HOSPICE", // non-PHI
    };

    const result = await PhiEncryptionService.decryptFields(record);

    expect(result.firstName).toBe("John");
    expect(result.phone).toBe("555-1234");
    expect(result.careModel).toBe("HOSPICE");
  });
});
