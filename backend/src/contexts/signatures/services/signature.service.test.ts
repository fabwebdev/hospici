import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  InvalidSignatureTransitionError,
  SignatureAlreadyExistsError,
  SignatureAlreadySignedError,
  SignatureNotFoundError,
  SignatureService,
} from "./signature.service.js";

// Mock the database
const mockDb = {
  transaction: vi.fn((fn) => fn(mockTx)),
  query: {
    signatureRequests: { findFirst: vi.fn() },
    electronicSignatures: { findMany: vi.fn(), findFirst: vi.fn() },
  },
  select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => [{ count: 0 }]) })) })),
  insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(() => [{}]) })) })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(() => [{}]) })) })),
  })),
};

const mockTx = {
  query: {
    signatureRequests: { findFirst: vi.fn() },
    electronicSignatures: { findMany: vi.fn() },
  },
  insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(() => [{}]) })) })),
  update: vi.fn(() => ({
    set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn(() => [{}]) })) })),
  })),
};

describe("SignatureService", () => {
  let service: SignatureService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SignatureService({
      db: mockDb as unknown as ConstructorParameters<typeof SignatureService>[0]["db"],
    });
  });

  describe("computeHash", () => {
    it("should compute SHA-256 hash of content", () => {
      const hash = SignatureService.computeHash("test content");
      expect(hash).toHaveLength(64); // SHA-256 hex length
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it("should produce consistent hashes for same content", () => {
      const hash1 = SignatureService.computeHash("test content");
      const hash2 = SignatureService.computeHash("test content");
      expect(hash1).toBe(hash2);
    });

    it("should produce different hashes for different content", () => {
      const hash1 = SignatureService.computeHash("content 1");
      const hash2 = SignatureService.computeHash("content 2");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("computeContentHash", () => {
    it("should compute hash with document metadata", () => {
      const hash = SignatureService.computeContentHash("order", "doc-123", { field: "value" });
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe("createSignatureRequest", () => {
    it("should create a signature request successfully", async () => {
      mockDb.transaction.mockImplementationOnce((fn) =>
        fn({
          ...mockTx,
          query: {
            signatureRequests: { findFirst: vi.fn(() => null) },
            electronicSignatures: { findMany: vi.fn(() => []) },
          },
          insert: vi.fn(() => ({
            values: vi.fn(() => ({
              returning: vi.fn(() => [
                {
                  id: "req-123",
                  locationId: "loc-1",
                  patientId: "pat-1",
                  documentType: "order",
                  documentId: "doc-123",
                  status: "DRAFT",
                  contentHash: "abc123",
                  requestedBy: "user-1",
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
              ]),
            })),
          })),
        }),
      );

      const result = await service.createSignatureRequest(
        {
          patientId: "pat-1",
          documentType: "order",
          documentId: "doc-123",
          contentHash: "abc123",
        },
        "user-1",
        "loc-1",
      );

      expect(result).toBeDefined();
      expect(result.status).toBe("DRAFT");
      expect(result.documentType).toBe("order");
      expect(result.contentHash).toBe("abc123");
    });

    it("should throw SignatureAlreadyExistsError if active request exists", async () => {
      mockDb.transaction.mockImplementationOnce((fn) =>
        fn({
          ...mockTx,
          query: {
            signatureRequests: {
              findFirst: vi.fn(() => ({
                id: "existing-req",
                status: "DRAFT",
              })),
            },
            electronicSignatures: { findMany: vi.fn(() => []) },
          },
        }),
      );

      await expect(
        service.createSignatureRequest(
          {
            patientId: "pat-1",
            documentType: "order",
            documentId: "doc-123",
            contentHash: "abc123",
          },
          "user-1",
          "loc-1",
        ),
      ).rejects.toThrow(SignatureAlreadyExistsError);
    });
  });

  describe("signDocument", () => {
    it("should sign a document and transition to SIGNED", async () => {
      const mockRequest = {
        id: "req-123",
        status: "SENT_FOR_SIGNATURE",
        contentHash: "abc123",
        patientId: "pat-1",
        requireCountersign: false,
        requirePatientSignature: false,
        requireSignatureTime: false,
      };

      mockDb.transaction.mockImplementationOnce((fn) =>
        fn({
          ...mockTx,
          query: {
            signatureRequests: { findFirst: vi.fn(() => mockRequest) },
            electronicSignatures: { findMany: vi.fn(() => []) },
          },
          insert: vi.fn(() => ({
            values: vi.fn(() => ({
              returning: vi.fn(() => [
                {
                  id: "sig-123",
                  signatureRequestId: "req-123",
                  signerName: "Dr. Test",
                  signedAt: new Date(),
                },
              ]),
            })),
          })),
          update: vi.fn(() => ({
            set: vi.fn(() => ({
              where: vi.fn(() => ({
                returning: vi.fn(() => [
                  {
                    ...mockRequest,
                    status: "SIGNED",
                    completedAt: new Date(),
                  },
                ]),
              })),
            })),
          })),
        }),
      );

      const result = await service.signDocument(
        "req-123",
        {
          signerType: "PHYSICIAN",
          signerName: "Dr. Test",
          attestationText: "I certify this is accurate",
        },
        "user-1",
        "loc-1",
      );

      expect(result).toBeDefined();
    });

    it("should throw InvalidSignatureTransitionError for invalid transition", async () => {
      const mockRequest = {
        id: "req-123",
        status: "SIGNED", // Already signed
        contentHash: "abc123",
        patientId: "pat-1",
      };

      mockDb.transaction.mockImplementationOnce((fn) =>
        fn({
          ...mockTx,
          query: {
            signatureRequests: { findFirst: vi.fn(() => mockRequest) },
            electronicSignatures: { findMany: vi.fn(() => []) },
          },
        }),
      );

      await expect(
        service.signDocument(
          "req-123",
          {
            signerType: "PHYSICIAN",
            signerName: "Dr. Test",
            attestationText: "I certify this is accurate",
          },
          "user-1",
          "loc-1",
        ),
      ).rejects.toThrow(InvalidSignatureTransitionError);
    });
  });

  describe("verifySignature", () => {
    it("should return valid for matching hashes", async () => {
      const contentHash = SignatureService.computeHash("test content");
      const mockSignature = {
        id: "sig-123",
        signatureRequestId: "req-123",
        signerName: "Dr. Test",
        signedAt: new Date("2026-01-01"),
        contentHashAtSign: contentHash,
        signatureHash: "computed-hash",
        signatureRequest: {
          id: "req-123",
          documentType: "order",
          documentId: "doc-123",
          contentHash: contentHash, // Same hash
        },
      };

      mockDb.query.electronicSignatures.findFirst = vi.fn(() => mockSignature);

      const result = await service.verifySignature("sig-123", "loc-1");

      expect(result.isValid).toBe(true);
      expect(result.contentHashMatch).toBe(true);
    });

    it("should return invalid for mismatched content hash", async () => {
      const mockSignature = {
        id: "sig-123",
        signatureRequestId: "req-123",
        signerName: "Dr. Test",
        signedAt: new Date("2026-01-01"),
        contentHashAtSign: "old-hash",
        signatureHash: "computed-hash",
        signatureRequest: {
          id: "req-123",
          documentType: "order",
          documentId: "doc-123",
          contentHash: "new-hash", // Different hash - document modified
        },
      };

      mockDb.query.electronicSignatures.findFirst = vi.fn(() => mockSignature);

      const result = await service.verifySignature("sig-123", "loc-1");

      expect(result.isValid).toBe(false);
      expect(result.contentHashMatch).toBe(false);
    });
  });

  describe("rejectSignature", () => {
    it("should reject a signature request", async () => {
      const mockRequest = {
        id: "req-123",
        status: "SENT_FOR_SIGNATURE",
        patientId: "pat-1",
      };

      mockDb.transaction.mockImplementationOnce((fn) =>
        fn({
          ...mockTx,
          query: {
            signatureRequests: { findFirst: vi.fn(() => mockRequest) },
            electronicSignatures: { findMany: vi.fn(() => []) },
          },
          update: vi.fn(() => ({
            set: vi.fn(() => ({
              where: vi.fn(() => ({
                returning: vi.fn(() => [
                  {
                    ...mockRequest,
                    status: "REJECTED",
                    rejectedAt: new Date(),
                    rejectedBy: "user-1",
                    rejectionReason: "Missing information",
                  },
                ]),
              })),
            })),
          })),
        }),
      );

      const result = await service.rejectSignature(
        "req-123",
        { reason: "Missing information" },
        "user-1",
        "loc-1",
      );

      expect(result).toBeDefined();
    });
  });

  describe("voidSignature", () => {
    it("should void a signature request", async () => {
      const mockRequest = {
        id: "req-123",
        status: "DRAFT",
        patientId: "pat-1",
      };

      mockDb.transaction.mockImplementationOnce((fn) =>
        fn({
          ...mockTx,
          query: {
            signatureRequests: { findFirst: vi.fn(() => mockRequest) },
            electronicSignatures: { findMany: vi.fn(() => []) },
          },
          update: vi.fn(() => ({
            set: vi.fn(() => ({
              where: vi.fn(() => ({
                returning: vi.fn(() => [
                  {
                    ...mockRequest,
                    status: "VOIDED",
                    voidedAt: new Date(),
                    voidedBy: "user-1",
                    voidReason: "No longer needed",
                  },
                ]),
              })),
            })),
          })),
        }),
      );

      const result = await service.voidSignature(
        "req-123",
        { reason: "No longer needed" },
        "user-1",
        "loc-1",
      );

      expect(result).toBeDefined();
    });

    it("should throw InvalidSignatureTransitionError when trying to void SIGNED request", async () => {
      const mockRequest = {
        id: "req-123",
        status: "SIGNED",
        patientId: "pat-1",
      };

      mockDb.transaction.mockImplementationOnce((fn) =>
        fn({
          ...mockTx,
          query: {
            signatureRequests: { findFirst: vi.fn(() => mockRequest) },
            electronicSignatures: { findMany: vi.fn(() => []) },
          },
        }),
      );

      await expect(
        service.voidSignature("req-123", { reason: "Test" }, "user-1", "loc-1"),
      ).rejects.toThrow(InvalidSignatureTransitionError);
    });
  });
});
