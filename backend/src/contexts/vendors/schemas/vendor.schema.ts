// contexts/vendors/schemas/vendor.schema.ts
// T3-8: Vendor Governance + BAA Registry — TypeBox schemas
// All exports are TSchema values only. Validators compiled in typebox-compiler.ts.

import { type Static, Type } from "@sinclair/typebox";

// ── Enum schemas ──────────────────────────────────────────────────────────────

export const BaaStatusSchema = Type.Union([
  Type.Literal("SIGNED"),
  Type.Literal("PENDING"),
  Type.Literal("NOT_REQUIRED"),
  Type.Literal("EXPIRED"),
  Type.Literal("SUSPENDED"),
]);

export const VendorServiceCategorySchema = Type.Union([
  Type.Literal("INFRASTRUCTURE"),
  Type.Literal("CLINICAL"),
  Type.Literal("BILLING"),
  Type.Literal("COMMUNICATION"),
  Type.Literal("AI_ML"),
  Type.Literal("IDENTITY"),
  Type.Literal("STORAGE"),
  Type.Literal("MONITORING"),
  Type.Literal("OTHER"),
]);

export const PhiExposureLevelSchema = Type.Union([
  Type.Literal("NONE"),
  Type.Literal("INDIRECT"),
  Type.Literal("DIRECT"),
  Type.Literal("STORES_PHI"),
]);

export const ReviewOutcomeSchema = Type.Union([
  Type.Literal("APPROVED"),
  Type.Literal("APPROVED_WITH_CONDITIONS"),
  Type.Literal("SUSPENDED"),
  Type.Literal("TERMINATED"),
]);

// ── Vendor ────────────────────────────────────────────────────────────────────

export const VendorResponseSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    locationId: Type.String({ format: "uuid" }),
    vendorName: Type.String(),
    serviceCategory: VendorServiceCategorySchema,
    description: Type.String(),
    phiExposureLevel: PhiExposureLevelSchema,
    transmitsPhi: Type.Boolean(),
    storesPhi: Type.Boolean(),
    subprocessor: Type.Boolean(),
    baaRequired: Type.Boolean(),
    baaStatus: BaaStatusSchema,
    baaEffectiveDate: Type.Optional(Type.String({ format: "date" })),
    baaRenewalDate: Type.Optional(Type.String({ format: "date" })),
    contractOwnerUserId: Type.Optional(Type.String({ format: "uuid" })),
    securityOwnerUserId: Type.Optional(Type.String({ format: "uuid" })),
    securityReviewDate: Type.Optional(Type.String({ format: "date" })),
    securityReviewDueDate: Type.Optional(Type.String({ format: "date" })),
    incidentContact: Type.Optional(Type.String()),
    dataResidency: Type.Optional(Type.String()),
    exitPlan: Type.Optional(Type.String()),
    notes: Type.Optional(Type.String()),
    isActive: Type.Boolean(),
    createdAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type VendorResponse = Static<typeof VendorResponseSchema>;

export const VendorReviewResponseSchema = Type.Object(
  {
    id: Type.String({ format: "uuid" }),
    vendorId: Type.String({ format: "uuid" }),
    locationId: Type.String({ format: "uuid" }),
    reviewedByUserId: Type.String({ format: "uuid" }),
    reviewDate: Type.String({ format: "date" }),
    outcome: ReviewOutcomeSchema,
    baaStatusAtReview: BaaStatusSchema,
    notes: Type.Optional(Type.String()),
    createdAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type VendorReviewResponse = Static<typeof VendorReviewResponseSchema>;

export const VendorDetailResponseSchema = Type.Object(
  {
    vendor: VendorResponseSchema,
    reviews: Type.Array(VendorReviewResponseSchema),
  },
  { additionalProperties: false },
);
export type VendorDetailResponse = Static<typeof VendorDetailResponseSchema>;

export const CreateVendorBodySchema = Type.Object(
  {
    vendorName: Type.String({ minLength: 1 }),
    serviceCategory: VendorServiceCategorySchema,
    description: Type.Optional(Type.String()),
    phiExposureLevel: PhiExposureLevelSchema,
    transmitsPhi: Type.Boolean(),
    storesPhi: Type.Boolean(),
    subprocessor: Type.Boolean(),
    baaRequired: Type.Boolean(),
    baaStatus: BaaStatusSchema,
    baaEffectiveDate: Type.Optional(Type.String({ format: "date" })),
    baaRenewalDate: Type.Optional(Type.String({ format: "date" })),
    contractOwnerUserId: Type.Optional(Type.String({ format: "uuid" })),
    securityOwnerUserId: Type.Optional(Type.String({ format: "uuid" })),
    securityReviewDate: Type.Optional(Type.String({ format: "date" })),
    securityReviewDueDate: Type.Optional(Type.String({ format: "date" })),
    incidentContact: Type.Optional(Type.String()),
    dataResidency: Type.Optional(Type.String()),
    exitPlan: Type.Optional(Type.String()),
    notes: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type CreateVendorBody = Static<typeof CreateVendorBodySchema>;

export const UpdateVendorBodySchema = Type.Partial(CreateVendorBodySchema, {
  additionalProperties: false,
});
export type UpdateVendorBody = Static<typeof UpdateVendorBodySchema>;

export const CreateVendorReviewBodySchema = Type.Object(
  {
    reviewDate: Type.String({ format: "date" }),
    outcome: ReviewOutcomeSchema,
    baaStatusAtReview: BaaStatusSchema,
    notes: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type CreateVendorReviewBody = Static<typeof CreateVendorReviewBodySchema>;

export const VendorListQuerySchema = Type.Object(
  {
    status: Type.Optional(BaaStatusSchema),
    category: Type.Optional(VendorServiceCategorySchema),
    phiExposure: Type.Optional(PhiExposureLevelSchema),
    activeOnly: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type VendorListQuery = Static<typeof VendorListQuerySchema>;

export const VendorListResponseSchema = Type.Object(
  {
    vendors: Type.Array(VendorResponseSchema),
    total: Type.Number(),
    expiringCount: Type.Number(),
    missingCount: Type.Number(),
  },
  { additionalProperties: false },
);
export type VendorListResponseType = Static<typeof VendorListResponseSchema>;

export const ExpiringBaaItemSchema = Type.Object(
  {
    vendorId: Type.String({ format: "uuid" }),
    vendorName: Type.String(),
    baaRenewalDate: Type.String({ format: "date" }),
    daysUntilExpiry: Type.Number(),
  },
  { additionalProperties: false },
);

export const ExpiringBaaResponseSchema = Type.Object(
  {
    items: Type.Array(ExpiringBaaItemSchema),
    withinDays: Type.Number(),
  },
  { additionalProperties: false },
);
export type ExpiringBaaResponseType = Static<typeof ExpiringBaaResponseSchema>;
