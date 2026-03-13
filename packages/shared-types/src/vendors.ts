// vendors.ts
// T3-8: Vendor Governance + BAA Registry — shared TypeScript types

// ── Enum types ────────────────────────────────────────────────────────────────

export type BaaStatus =
  | "SIGNED"
  | "PENDING"
  | "NOT_REQUIRED"
  | "EXPIRED"
  | "SUSPENDED";

export type VendorServiceCategory =
  | "INFRASTRUCTURE"
  | "CLINICAL"
  | "BILLING"
  | "COMMUNICATION"
  | "AI_ML"
  | "IDENTITY"
  | "STORAGE"
  | "MONITORING"
  | "OTHER";

export type PhiExposureLevel = "NONE" | "INDIRECT" | "DIRECT" | "STORES_PHI";

export type ReviewOutcome =
  | "APPROVED"
  | "APPROVED_WITH_CONDITIONS"
  | "SUSPENDED"
  | "TERMINATED";

// ── Vendor ────────────────────────────────────────────────────────────────────

export interface Vendor {
  id: string;
  locationId: string;
  vendorName: string;
  serviceCategory: VendorServiceCategory;
  description: string;
  phiExposureLevel: PhiExposureLevel;
  transmitsPhi: boolean;
  storesPhi: boolean;
  subprocessor: boolean;
  baaRequired: boolean;
  baaStatus: BaaStatus;
  baaEffectiveDate?: string; // ISO date
  baaRenewalDate?: string; // ISO date
  contractOwnerUserId?: string;
  securityOwnerUserId?: string;
  securityReviewDate?: string; // ISO date
  securityReviewDueDate?: string; // ISO date
  incidentContact?: string;
  dataResidency?: string;
  exitPlan?: string;
  notes?: string;
  isActive: boolean;
  createdAt: string; // ISO date-time
  updatedAt: string; // ISO date-time
}

// ── VendorReview ──────────────────────────────────────────────────────────────

export interface VendorReview {
  id: string;
  vendorId: string;
  locationId: string;
  reviewedByUserId: string;
  reviewDate: string; // ISO date
  outcome: ReviewOutcome;
  baaStatusAtReview: BaaStatus;
  notes?: string;
  createdAt: string; // ISO date-time
}

// ── VendorDetail — vendor + its review history ────────────────────────────────

export interface VendorDetail {
  vendor: Vendor;
  reviews: VendorReview[];
}

// ── CreateVendorInput ─────────────────────────────────────────────────────────

export interface CreateVendorInput {
  vendorName: string;
  serviceCategory: VendorServiceCategory;
  description?: string;
  phiExposureLevel: PhiExposureLevel;
  transmitsPhi: boolean;
  storesPhi: boolean;
  subprocessor: boolean;
  baaRequired: boolean;
  baaStatus: BaaStatus;
  baaEffectiveDate?: string;
  baaRenewalDate?: string;
  contractOwnerUserId?: string;
  securityOwnerUserId?: string;
  securityReviewDate?: string;
  securityReviewDueDate?: string;
  incidentContact?: string;
  dataResidency?: string;
  exitPlan?: string;
  notes?: string;
}

// ── UpdateVendorInput ─────────────────────────────────────────────────────────

export type UpdateVendorInput = Partial<CreateVendorInput>;

// ── CreateVendorReviewInput ───────────────────────────────────────────────────

export interface CreateVendorReviewInput {
  reviewDate: string;
  outcome: ReviewOutcome;
  baaStatusAtReview: BaaStatus;
  notes?: string;
}

// ── VendorListResponse ────────────────────────────────────────────────────────

export interface VendorListResponse {
  vendors: Vendor[];
  total: number;
  /** BAAs expiring within 90 days */
  expiringCount: number;
  /** Required BAAs not yet signed */
  missingCount: number;
}

// ── ExpiringBaaItem ───────────────────────────────────────────────────────────

export interface ExpiringBaaItem {
  vendorId: string;
  vendorName: string;
  baaRenewalDate: string;
  daysUntilExpiry: number;
}

export interface ExpiringBaaResponse {
  items: ExpiringBaaItem[];
  withinDays: number;
}
