// packages/shared-types/src/documents.ts
// Patient document types shared between backend and frontend

export type DocumentCategory =
  | "CERTIFICATION"
  | "CONSENT"
  | "CLINICAL_NOTE"
  | "ORDER"
  | "CARE_PLAN"
  | "ADVANCE_DIRECTIVE"
  | "OTHER";

export type DocumentStatus = "ACTIVE" | "ARCHIVED";

export interface DocumentResponse {
  id: string;
  patientId: string;
  locationId: string;
  name: string;
  category: DocumentCategory;
  storageKey?: string;
  mimeType?: string;
  sizeBytes?: number;
  status: DocumentStatus;
  uploadedByUserId?: string;
  signed: boolean;
  signedAt?: string;
  signedByUserId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentListResponse {
  documents: DocumentResponse[];
  total: number;
}

export interface CreateDocumentInput {
  name: string;
  category: DocumentCategory;
  mimeType?: string;
  sizeBytes?: number;
}

export interface PatchDocumentInput {
  status?: DocumentStatus;
  signed?: boolean;
}
