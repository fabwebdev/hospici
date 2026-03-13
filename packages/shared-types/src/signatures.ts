// Electronic Signature Types (T3-5)

export type SignatureDocumentType =
  | "encounter"
  | "order"
  | "recertification"
  | "f2f"
  | "idg_record"
  | "consent"
  | "care_plan";

export type SignatureRequestStatus =
  | "DRAFT"
  | "READY_FOR_SIGNATURE"
  | "SENT_FOR_SIGNATURE"
  | "VIEWED"
  | "PARTIALLY_SIGNED"
  | "SIGNED"
  | "REJECTED"
  | "VOIDED"
  | "NO_SIGNATURE_REQUIRED"
  | "EXPIRED";

export type SignerType = "CLINICIAN" | "PHYSICIAN" | "PATIENT" | "REPRESENTATIVE" | "AGENCY_REP";

export type SignatureExceptionType =
  | "NO_SIGNATURE_REQUIRED"
  | "PATIENT_UNABLE_TO_SIGN"
  | "PHYSICIAN_UNAVAILABLE";

export type DeliveryMethod = "portal" | "fax" | "mail" | "courier";

export interface ElectronicSignature {
  id: string;
  signatureRequestId: string;
  locationId: string;
  signerType: SignerType;
  signerUserId: string | null;
  signerName: string;
  signerLegalName: string | null;
  signerNpi: string | null;
  attestationAccepted: boolean;
  attestationText: string;
  documentedSignedAt: string | null;
  signedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  signatureData: string | null;
  typedName: string | null;
  contentHashAtSign: string;
  signatureHash: string;
  representativeRelationship: string | null;
  patientUnableReason: string | null;
  countersignsSignatureId: string | null;
  createdAt: string;
}

export interface SignatureEvent {
  id: string;
  signatureRequestId: string;
  eventType: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eventData: Record<string, any>;
  actorUserId: string | null;
  actorName: string | null;
  createdAt: string;
}

export interface SignatureRequest {
  id: string;
  locationId: string;
  patientId: string;
  documentType: SignatureDocumentType;
  documentId: string;
  status: SignatureRequestStatus;
  requireCountersign: boolean;
  requirePatientSignature: boolean;
  requireSignatureTime: boolean;
  allowGrouping: boolean;
  deliveryMethod: DeliveryMethod;
  documentedSignedAt: string | null;
  sentForSignatureAt: string | null;
  viewedAt: string | null;
  completedAt: string | null;
  expiresAt: string | null;
  contentHash: string;
  priorRevisionHash: string | null;
  exceptionType: SignatureExceptionType | null;
  exceptionReason: string | null;
  exceptionApprovedBy: string | null;
  exceptionApprovedAt: string | null;
  rejectedAt: string | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  requestedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SignatureRequestWithSignatures extends SignatureRequest {
  signatures: ElectronicSignature[];
  events: SignatureEvent[];
}

// Request/Response Types

export interface CreateSignatureRequestBody {
  patientId: string;
  documentType: SignatureDocumentType;
  documentId: string;
  contentHash: string;
  requireCountersign?: boolean;
  requirePatientSignature?: boolean;
  requireSignatureTime?: boolean;
  allowGrouping?: boolean;
  deliveryMethod?: DeliveryMethod;
  expiresAt?: string;
}

export interface SignDocumentBody {
  signerType: SignerType;
  signerName: string;
  signerLegalName?: string;
  signerNpi?: string;
  attestationText: string;
  documentedSignedAt?: string;
  signatureData?: string;
  typedName?: string;
  representativeRelationship?: string;
  patientUnableReason?: string;
  countersignsSignatureId?: string;
}

export interface CountersignBody {
  originalSignatureId: string;
  signerName: string;
  attestationText: string;
}

export interface RejectSignatureBody {
  reason: string;
}

export interface VoidSignatureBody {
  reason: string;
}

export interface MarkExceptionBody {
  exceptionType: SignatureExceptionType;
  reason: string;
}

export interface SignatureVerificationResult {
  isValid: boolean;
  signatureId: string;
  requestId: string;
  documentType: SignatureDocumentType;
  documentId: string;
  signerName: string;
  signedAt: string;
  contentHashMatch: boolean;
  signatureHashMatch: boolean;
  currentContentHash: string;
  message: string;
}

export interface SignatureListQuery {
  status?: SignatureRequestStatus;
  documentType?: SignatureDocumentType;
  patientId?: string;
  overdue?: boolean;
  page?: number;
  limit?: number;
}

export interface SignatureListResponse {
  items: SignatureRequestWithSignatures[];
  total: number;
  page: number;
}

export interface OutstandingSignatureItem {
  id: string;
  patientId: string;
  patientName: string;
  documentType: SignatureDocumentType;
  documentId: string;
  status: SignatureRequestStatus;
  requestedAt: string;
  sentAt: string | null;
  daysOutstanding: number;
  requireCountersign: boolean;
  signatureCount: number;
}

export interface OutstandingSignaturesResponse {
  pending: OutstandingSignatureItem[];
  sent: OutstandingSignatureItem[];
  overdue: OutstandingSignatureItem[];
  exception: OutstandingSignatureItem[];
}

// Status helpers

export const SIGNATURE_STATUS_LABELS: Record<SignatureRequestStatus, string> = {
  DRAFT: "Draft",
  READY_FOR_SIGNATURE: "Ready for Signature",
  SENT_FOR_SIGNATURE: "Sent",
  VIEWED: "Viewed",
  PARTIALLY_SIGNED: "Partially Signed",
  SIGNED: "Signed",
  REJECTED: "Rejected",
  VOIDED: "Voided",
  NO_SIGNATURE_REQUIRED: "No Signature Required",
  EXPIRED: "Expired",
};

export const SIGNATURE_STATUS_COLORS: Record<SignatureRequestStatus, string> = {
  DRAFT: "gray",
  READY_FOR_SIGNATURE: "blue",
  SENT_FOR_SIGNATURE: "yellow",
  VIEWED: "purple",
  PARTIALLY_SIGNED: "orange",
  SIGNED: "green",
  REJECTED: "red",
  VOIDED: "gray",
  NO_SIGNATURE_REQUIRED: "slate",
  EXPIRED: "red",
};

export const SIGNER_TYPE_LABELS: Record<SignerType, string> = {
  CLINICIAN: "Clinician",
  PHYSICIAN: "Physician",
  PATIENT: "Patient",
  REPRESENTATIVE: "Representative",
  AGENCY_REP: "Agency Representative",
};

export const DOCUMENT_TYPE_LABELS: Record<SignatureDocumentType, string> = {
  encounter: "Encounter Note",
  order: "Physician Order",
  recertification: "Recertification",
  f2f: "Face-to-Face Encounter",
  idg_record: "IDG Record",
  consent: "Consent Form",
  care_plan: "Care Plan",
};
