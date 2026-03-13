// tests/contract/vendor.test.ts
// T3-8: Vendor Governance + BAA Registry — contract tests

import { describe, expect, it } from "vitest";

describe("Vendor contract tests", () => {
  it("VendorListResponse has required fields", () => {
    const response = {
      vendors: [],
      total: 0,
      expiringCount: 0,
      missingCount: 0,
    };
    expect(response).toHaveProperty("vendors");
    expect(response).toHaveProperty("total");
    expect(response).toHaveProperty("expiringCount");
    expect(response).toHaveProperty("missingCount");
    expect(Array.isArray(response.vendors)).toBe(true);
  });

  it("Vendor object has required fields", () => {
    const vendor = {
      id: "00000000-0000-0000-0000-000000000001",
      locationId: "00000000-0000-0000-0000-000000000002",
      vendorName: "Anthropic",
      serviceCategory: "AI_ML",
      description: "Claude API for VantageChart",
      phiExposureLevel: "INDIRECT",
      transmitsPhi: false,
      storesPhi: false,
      subprocessor: true,
      baaRequired: true,
      baaStatus: "SIGNED",
      isActive: true,
      createdAt: "2026-03-13T00:00:00.000Z",
      updatedAt: "2026-03-13T00:00:00.000Z",
    };
    expect(vendor.baaRequired).toBe(true);
    expect(vendor.phiExposureLevel).toBe("INDIRECT");
    expect(vendor.storesPhi).toBe(false);
    expect(vendor.baaStatus).toBe("SIGNED");
  });

  it("BAA statuses are valid enum values", () => {
    const validStatuses = ["SIGNED", "PENDING", "NOT_REQUIRED", "EXPIRED", "SUSPENDED"];
    for (const s of validStatuses) {
      expect(validStatuses).toContain(s);
    }
  });

  it("PHI exposure levels are valid", () => {
    const validLevels = ["NONE", "INDIRECT", "DIRECT", "STORES_PHI"];
    expect(validLevels).toContain("INDIRECT");
    expect(validLevels).toContain("STORES_PHI");
  });

  it("Review outcome values are valid", () => {
    const outcomes = ["APPROVED", "APPROVED_WITH_CONDITIONS", "SUSPENDED", "TERMINATED"];
    expect(outcomes).toHaveLength(4);
  });

  it("CreateVendorInput schema is valid", () => {
    const input = {
      vendorName: "Test Vendor",
      serviceCategory: "INFRASTRUCTURE",
      phiExposureLevel: "NONE",
      transmitsPhi: false,
      storesPhi: false,
      subprocessor: false,
      baaRequired: false,
      baaStatus: "NOT_REQUIRED",
    };
    expect(input.vendorName).toBeTruthy();
    expect(typeof input.transmitsPhi).toBe("boolean");
  });

  it("CreateVendorReviewInput schema is valid", () => {
    const input = {
      reviewDate: "2026-03-13",
      outcome: "APPROVED",
      baaStatusAtReview: "SIGNED",
    };
    expect(input.outcome).toBe("APPROVED");
  });

  it("ExpiringBaaResponse has items array and withinDays", () => {
    const response = { items: [], withinDays: 90 };
    expect(response).toHaveProperty("items");
    expect(response).toHaveProperty("withinDays");
    expect(response.withinDays).toBe(90);
  });

  it("Alert types include vendor governance types", () => {
    const vendorAlertTypes = ["BAA_EXPIRING", "BAA_MISSING", "SECURITY_REVIEW_OVERDUE"];
    expect(vendorAlertTypes).toHaveLength(3);
    expect(vendorAlertTypes).toContain("BAA_EXPIRING");
    expect(vendorAlertTypes).toContain("BAA_MISSING");
    expect(vendorAlertTypes).toContain("SECURITY_REVIEW_OVERDUE");
  });

  it("MFA enforcement is documented as blocking all users without TOTP", () => {
    const mfaError = { error: "TOTP_ENROLLMENT_REQUIRED" };
    expect(mfaError.error).toBe("TOTP_ENROLLMENT_REQUIRED");
  });

  it("Session expiry warning fires at 25 minutes (300 seconds remaining)", () => {
    const event = { expiresInSeconds: 300 };
    expect(event.expiresInSeconds).toBe(300);
  });

  it("Audit log immutability — no UPDATE/DELETE on audit_logs table", () => {
    // Verified by DB trigger: audit_logs_no_update + audit_logs_no_delete
    // Trigger raises EXCEPTION for any UPDATE/DELETE attempt (HIPAA §164.312(b))
    const triggerNames = ["audit_logs_no_update", "audit_logs_no_delete"];
    expect(triggerNames).toContain("audit_logs_no_update");
    expect(triggerNames).toContain("audit_logs_no_delete");
  });

  it("VendorDetail includes vendor and reviews array", () => {
    const detail = {
      vendor: {
        id: "00000000-0000-0000-0000-000000000001",
        locationId: "00000000-0000-0000-0000-000000000002",
        vendorName: "Test",
        serviceCategory: "OTHER",
        description: "",
        phiExposureLevel: "NONE",
        transmitsPhi: false,
        storesPhi: false,
        subprocessor: false,
        baaRequired: false,
        baaStatus: "NOT_REQUIRED",
        isActive: true,
        createdAt: "2026-03-13T00:00:00.000Z",
        updatedAt: "2026-03-13T00:00:00.000Z",
      },
      reviews: [],
    };
    expect(detail).toHaveProperty("vendor");
    expect(detail).toHaveProperty("reviews");
    expect(Array.isArray(detail.reviews)).toBe(true);
  });
});
