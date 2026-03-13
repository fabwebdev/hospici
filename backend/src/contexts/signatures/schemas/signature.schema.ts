import { Type, type Static } from "@sinclair/typebox";

// ── Enums ────────────────────────────────────────────────────────────────────

export const SignatureDocumentTypeSchema = Type.Union([
  Type.Literal("encounter"),
  Type.Literal("order"),
  Type.Literal("recertification"),
  Type.Literal("f2f"),
  Type.Literal("idg_record"),
  Type.Literal("consent"),
  Type.Literal("care_plan"),
]);

export const SignatureRequestStatusSchema = Type.Union([
  Type.Literal("DRAFT"),
  Type.Literal("READY_FOR_SIGNATURE"),
  Type.Literal("SENT_FOR_SIGNATURE"),
  Type.Literal("VIEWED"),
  Type.Literal("PARTIALLY_SIGNED"),
  Type.Literal("SIGNED"),
  Type.Literal("REJECTED"),
  Type.Literal("VOIDED"),
  Type.Literal("NO_SIGNATURE_REQUIRED"),
  Type.Literal("EXPIRED"),
]);

export const SignerTypeSchema = Type.Union([
  Type.Literal("CLINICIAN"),
  Type.Literal("PHYSICIAN"),
  Type.Literal("PATIENT"),
  Type.Literal("REPRESENTATIVE"),
  Type.Literal("AGENCY_REP"),
]);

export const SignatureExceptionTypeSchema = Type.Union([
  Type.Literal("NO_SIGNATURE_REQUIRED"),
  Type.Literal("PATIENT_UNABLE_TO_SIGN"),
  Type.Literal("PHYSICIAN_UNAVAILABLE"),
]);

export const DeliveryMethodSchema = Type.Union([
  Type.Literal("portal"),
  Type.Literal("fax"),
  Type.Literal("mail"),
  Type.Literal("courier"),
]);

// ── Core Signature Schemas ───────────────────────────────────────────────────

export const ElectronicSignatureSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  signatureRequestId: Type.String({ format: "uuid" }),
  locationId: Type.String({ format: "uuid" }),

  signerType: SignerTypeSchema,
  signerUserId: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  signerName: Type.String(),
  signerLegalName: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  signerNpi: Type.Optional(Type.Union([Type.String(), Type.Null()])),

  attestationAccepted: Type.Boolean(),
  attestationText: Type.String(),

  documentedSignedAt: Type.Optional(Type.Union([Type.String({ format: "date-time" }), Type.Null()])),
  signedAt: Type.String({ format: "date-time" }),

  ipAddress: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  userAgent: Type.Optional(Type.Union([Type.String(), Type.Null()])),

  signatureData: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  typedName: Type.Optional(Type.Union([Type.String(), Type.Null()])),

  contentHashAtSign: Type.String(),
  signatureHash: Type.String(),

  representativeRelationship: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  patientUnableReason: Type.Optional(Type.Union([Type.String(), Type.Null()])),

  countersignsSignatureId: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),

  createdAt: Type.String({ format: "date-time" }),
});

export const SignatureEventSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  signatureRequestId: Type.String({ format: "uuid" }),
  eventType: Type.String(),
  eventData: Type.Record(Type.String(), Type.Any()),
  actorUserId: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  actorName: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  createdAt: Type.String({ format: "date-time" }),
});

export const SignatureRequestSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  locationId: Type.String({ format: "uuid" }),
  patientId: Type.String({ format: "uuid" }),

  documentType: SignatureDocumentTypeSchema,
  documentId: Type.String({ format: "uuid" }),

  status: SignatureRequestStatusSchema,

  requireCountersign: Type.Boolean(),
  requirePatientSignature: Type.Boolean(),
  requireSignatureTime: Type.Boolean(),
  allowGrouping: Type.Boolean(),

  deliveryMethod: DeliveryMethodSchema,

  documentedSignedAt: Type.Optional(Type.Union([Type.String({ format: "date-time" }), Type.Null()])),
  sentForSignatureAt: Type.Optional(Type.Union([Type.String({ format: "date-time" }), Type.Null()])),
  viewedAt: Type.Optional(Type.Union([Type.String({ format: "date-time" }), Type.Null()])),
  completedAt: Type.Optional(Type.Union([Type.String({ format: "date-time" }), Type.Null()])),
  expiresAt: Type.Optional(Type.Union([Type.String({ format: "date-time" }), Type.Null()])),

  contentHash: Type.String(),
  priorRevisionHash: Type.Optional(Type.Union([Type.String(), Type.Null()])),

  exceptionType: Type.Optional(Type.Union([SignatureExceptionTypeSchema, Type.Null()])),
  exceptionReason: Type.Optional(Type.Union([Type.String(), Type.Null()])),
  exceptionApprovedBy: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  exceptionApprovedAt: Type.Optional(Type.Union([Type.String({ format: "date-time" }), Type.Null()])),

  rejectedAt: Type.Optional(Type.Union([Type.String({ format: "date-time" }), Type.Null()])),
  rejectedBy: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  rejectionReason: Type.Optional(Type.Union([Type.String(), Type.Null()])),

  voidedAt: Type.Optional(Type.Union([Type.String({ format: "date-time" }), Type.Null()])),
  voidedBy: Type.Optional(Type.Union([Type.String({ format: "uuid" }), Type.Null()])),
  voidReason: Type.Optional(Type.Union([Type.String(), Type.Null()])),

  requestedBy: Type.String({ format: "uuid" }),
  createdAt: Type.String({ format: "date-time" }),
  updatedAt: Type.String({ format: "date-time" }),
});

// ── Request/Response Schemas ─────────────────────────────────────────────────

export const CreateSignatureRequestBodySchema = Type.Object({
  patientId: Type.String({ format: "uuid" }),
  documentType: SignatureDocumentTypeSchema,
  documentId: Type.String({ format: "uuid" }),
  contentHash: Type.String({ minLength: 64, maxLength: 64 }), // SHA-256
  requireCountersign: Type.Optional(Type.Boolean()),
  requirePatientSignature: Type.Optional(Type.Boolean()),
  requireSignatureTime: Type.Optional(Type.Boolean()),
  allowGrouping: Type.Optional(Type.Boolean()),
  deliveryMethod: Type.Optional(DeliveryMethodSchema),
  expiresAt: Type.Optional(Type.String({ format: "date-time" })),
});

export const SignDocumentBodySchema = Type.Object({
  signerType: SignerTypeSchema,
  signerName: Type.String({ minLength: 1 }),
  signerLegalName: Type.Optional(Type.String()),
  signerNpi: Type.Optional(Type.String()),
  attestationText: Type.String({ minLength: 1 }),
  documentedSignedAt: Type.Optional(Type.String({ format: "date-time" })),
  signatureData: Type.Optional(Type.String()), // base64 image
  typedName: Type.Optional(Type.String()),
  representativeRelationship: Type.Optional(Type.String()),
  patientUnableReason: Type.Optional(Type.String()),
  countersignsSignatureId: Type.Optional(Type.String({ format: "uuid" })),
});

export const CountersignBodySchema = Type.Object({
  originalSignatureId: Type.String({ format: "uuid" }),
  signerName: Type.String({ minLength: 1 }),
  attestationText: Type.String({ minLength: 1 }),
});

export const RejectSignatureBodySchema = Type.Object({
  reason: Type.String({ minLength: 1 }),
});

export const VoidSignatureBodySchema = Type.Object({
  reason: Type.String({ minLength: 1 }),
});

export const MarkExceptionBodySchema = Type.Object({
  exceptionType: SignatureExceptionTypeSchema,
  reason: Type.String({ minLength: 1 }),
});

export const SignatureVerificationResultSchema = Type.Object({
  isValid: Type.Boolean(),
  signatureId: Type.String({ format: "uuid" }),
  requestId: Type.String({ format: "uuid" }),
  documentType: SignatureDocumentTypeSchema,
  documentId: Type.String({ format: "uuid" }),
  signerName: Type.String(),
  signedAt: Type.String({ format: "date-time" }),
  contentHashMatch: Type.Boolean(),
  signatureHashMatch: Type.Boolean(),
  currentContentHash: Type.String(),
  message: Type.String(),
});

// ── List/Query Schemas ───────────────────────────────────────────────────────

export const SignatureListQuerySchema = Type.Object({
  status: Type.Optional(SignatureRequestStatusSchema),
  documentType: Type.Optional(SignatureDocumentTypeSchema),
  patientId: Type.Optional(Type.String({ format: "uuid" })),
  overdue: Type.Optional(Type.Boolean()),
  page: Type.Optional(Type.Integer({ minimum: 1, default: 1 })),
  limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 25 })),
});

export const SignatureRequestWithSignaturesSchema = Type.Composite([
  SignatureRequestSchema,
  Type.Object({
    signatures: Type.Array(ElectronicSignatureSchema),
    events: Type.Array(SignatureEventSchema),
  }),
]);

export const SignatureListResponseSchema = Type.Object({
  items: Type.Array(SignatureRequestWithSignaturesSchema),
  total: Type.Integer(),
  page: Type.Integer(),
});

export const OutstandingSignatureItemSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  patientId: Type.String({ format: "uuid" }),
  patientName: Type.String(),
  documentType: SignatureDocumentTypeSchema,
  documentId: Type.String({ format: "uuid" }),
  status: SignatureRequestStatusSchema,
  requestedAt: Type.String({ format: "date-time" }),
  sentAt: Type.Optional(Type.Union([Type.String({ format: "date-time" }), Type.Null()])),
  daysOutstanding: Type.Integer(),
  requireCountersign: Type.Boolean(),
  signatureCount: Type.Integer(),
});

export const OutstandingSignaturesResponseSchema = Type.Object({
  pending: Type.Array(OutstandingSignatureItemSchema),
  sent: Type.Array(OutstandingSignatureItemSchema),
  overdue: Type.Array(OutstandingSignatureItemSchema),
  exception: Type.Array(OutstandingSignatureItemSchema),
});

// ── Types ─────────────────────────────────────────────────────────────────────

export type SignatureDocumentType = Static<typeof SignatureDocumentTypeSchema>;
export type SignatureRequestStatus = Static<typeof SignatureRequestStatusSchema>;
export type SignerType = Static<typeof SignerTypeSchema>;
export type SignatureExceptionType = Static<typeof SignatureExceptionTypeSchema>;
export type DeliveryMethod = Static<typeof DeliveryMethodSchema>;

export type ElectronicSignature = Static<typeof ElectronicSignatureSchema>;
export type SignatureEvent = Static<typeof SignatureEventSchema>;
export type SignatureRequest = Static<typeof SignatureRequestSchema>;

export type CreateSignatureRequestBody = Static<typeof CreateSignatureRequestBodySchema>;
export type SignDocumentBody = Static<typeof SignDocumentBodySchema>;
export type CountersignBody = Static<typeof CountersignBodySchema>;
export type RejectSignatureBody = Static<typeof RejectSignatureBodySchema>;
export type VoidSignatureBody = Static<typeof VoidSignatureBodySchema>;
export type MarkExceptionBody = Static<typeof MarkExceptionBodySchema>;
export type SignatureVerificationResult = Static<typeof SignatureVerificationResultSchema>;

export type SignatureListQuery = Static<typeof SignatureListQuerySchema>;
export type SignatureRequestWithSignatures = Static<typeof SignatureRequestWithSignaturesSchema>;
export type SignatureListResponse = Static<typeof SignatureListResponseSchema>;
export type OutstandingSignatureItem = Static<typeof OutstandingSignatureItemSchema>;
export type OutstandingSignaturesResponse = Static<typeof OutstandingSignaturesResponseSchema>;
