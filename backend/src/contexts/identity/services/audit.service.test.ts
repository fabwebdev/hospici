/**
 * AuditService unit tests.
 *
 * Uses vi.mock to intercept db.insert so no real DB is needed.
 * These tests verify the service's public contract and append-only guarantee.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuditService } from "./audit.service.js";

// ── Mock the DB client ────────────────────────────────────────────────────────
// vi.hoisted() runs before vi.mock() hoisting, so the refs are available.

const { mockInsert, mockValues } = vi.hoisted(() => {
  const mockValues = vi.fn().mockResolvedValue([]);
  const mockInsert = vi.fn().mockReturnValue({ values: mockValues });
  return { mockInsert, mockValues };
});

vi.mock("@/db/client.js", () => ({
  db: {
    insert: mockInsert,
  },
}));

// Mock the audit_logs table reference (value is opaque to the service logic)
vi.mock("@/db/schema/audit-logs.table.js", () => ({
  auditLogs: Symbol("auditLogs"),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("AuditService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("append-only contract", () => {
    it("exposes only a log() method — no update or delete", () => {
      const methods = Object.getOwnPropertyNames(AuditService).filter(
        (k) => k !== "length" && k !== "name" && k !== "prototype",
      );
      expect(methods).toEqual(["log"]);
    });
  });

  describe("log()", () => {
    const BASE_META = {
      userRole: "registered_nurse",
      locationId: "loc-uuid-1234",
      resourceType: "patient",
      ipAddress: "10.0.0.1",
      userAgent: "Mozilla/5.0",
    };

    it("calls db.insert with correct field values", async () => {
      await AuditService.log("view", "user-uuid", "patient-uuid", BASE_META);

      expect(mockInsert).toHaveBeenCalledOnce();
      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "user-uuid",
          userRole: "registered_nurse",
          locationId: "loc-uuid-1234",
          action: "view",
          resourceType: "patient",
          resourceId: "patient-uuid",
          ipAddress: "10.0.0.1",
          userAgent: "Mozilla/5.0",
          details: null,
        }),
      );
    });

    it("uses userId as resourceId when patientId is null", async () => {
      await AuditService.log("login", "user-uuid", null, {
        ...BASE_META,
        resourceType: "user",
      });

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({
          resourceId: "user-uuid",
          resourceType: "user",
          action: "login",
        }),
      );
    });

    it("uses metadata.resourceId as fallback when patientId is null and resourceId is provided", async () => {
      await AuditService.log("export", "user-uuid", null, {
        ...BASE_META,
        resourceType: "report",
        resourceId: "report-uuid",
      });

      expect(mockValues).toHaveBeenCalledWith(
        expect.objectContaining({ resourceId: "report-uuid" }),
      );
    });

    it("passes details to insert when provided", async () => {
      const details = { reason: "clinical review", recordCount: 3 };
      await AuditService.log("view", "user-uuid", "patient-uuid", {
        ...BASE_META,
        details,
      });

      expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ details }));
    });

    it("sets details to null when not provided", async () => {
      await AuditService.log("create", "user-uuid", "patient-uuid", BASE_META);

      expect(mockValues).toHaveBeenCalledWith(expect.objectContaining({ details: null }));
    });

    it("calls db.insert exactly once per log() call — never update or delete", async () => {
      await AuditService.log("sign", "user-uuid", "patient-uuid", BASE_META);

      expect(mockInsert).toHaveBeenCalledOnce();
      // Confirm the db mock has no update/delete methods exposed
      // The mock only exposes insert — confirms the real code path never calls update/delete
      expect(mockInsert.mock.calls.every((c) => c[0] !== undefined)).toBe(true);
    });
  });
});
