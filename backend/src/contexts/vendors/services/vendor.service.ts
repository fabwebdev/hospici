// contexts/vendors/services/vendor.service.ts
// T3-8: Vendor Governance + BAA Registry

import { AuditService } from "@/contexts/identity/services/audit.service.js";
import { db } from "@/db/client.js";
import { vendorReviews } from "@/db/schema/vendor-reviews.table.js";
import { vendors } from "@/db/schema/vendors.table.js";
import { and, eq, gte, isNotNull, lt, lte, ne } from "drizzle-orm";
import type {
  CreateVendorBody,
  CreateVendorReviewBody,
  ExpiringBaaResponseType,
  UpdateVendorBody,
  VendorDetailResponse,
  VendorListQuery,
  VendorListResponseType,
  VendorResponse,
  VendorReviewResponse,
} from "../schemas/vendor.schema.js";

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapVendor(row: typeof vendors.$inferSelect): VendorResponse {
  return {
    id: row.id,
    locationId: row.locationId,
    vendorName: row.vendorName,
    serviceCategory: row.serviceCategory,
    description: row.description,
    phiExposureLevel: row.phiExposureLevel,
    transmitsPhi: row.transmitsPhi,
    storesPhi: row.storesPhi,
    subprocessor: row.subprocessor,
    baaRequired: row.baaRequired,
    baaStatus: row.baaStatus,
    ...(row.baaEffectiveDate != null ? { baaEffectiveDate: row.baaEffectiveDate } : {}),
    ...(row.baaRenewalDate != null ? { baaRenewalDate: row.baaRenewalDate } : {}),
    ...(row.contractOwnerUserId != null
      ? { contractOwnerUserId: row.contractOwnerUserId }
      : {}),
    ...(row.securityOwnerUserId != null
      ? { securityOwnerUserId: row.securityOwnerUserId }
      : {}),
    ...(row.securityReviewDate != null ? { securityReviewDate: row.securityReviewDate } : {}),
    ...(row.securityReviewDueDate != null
      ? { securityReviewDueDate: row.securityReviewDueDate }
      : {}),
    ...(row.incidentContact != null ? { incidentContact: row.incidentContact } : {}),
    ...(row.dataResidency != null ? { dataResidency: row.dataResidency } : {}),
    ...(row.exitPlan != null ? { exitPlan: row.exitPlan } : {}),
    ...(row.notes != null ? { notes: row.notes } : {}),
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function mapReview(row: typeof vendorReviews.$inferSelect): VendorReviewResponse {
  return {
    id: row.id,
    vendorId: row.vendorId,
    locationId: row.locationId,
    reviewedByUserId: row.reviewedByUserId,
    reviewDate: row.reviewDate,
    outcome: row.outcome as VendorReviewResponse["outcome"],
    baaStatusAtReview: row.baaStatusAtReview,
    ...(row.notes != null ? { notes: row.notes } : {}),
    createdAt: row.createdAt.toISOString(),
  };
}

// ── VendorService ─────────────────────────────────────────────────────────────

export class VendorService {
  static async listVendors(
    locationId: string,
    query: VendorListQuery,
  ): Promise<VendorListResponseType> {
    const conditions = [eq(vendors.locationId, locationId)];

    if (query.activeOnly !== "false") {
      conditions.push(eq(vendors.isActive, true));
    }
    if (query.status) conditions.push(eq(vendors.baaStatus, query.status));
    if (query.category) conditions.push(eq(vendors.serviceCategory, query.category));
    if (query.phiExposure) conditions.push(eq(vendors.phiExposureLevel, query.phiExposure));

    const rows = await db
      .select()
      .from(vendors)
      .where(and(...conditions))
      .orderBy(vendors.vendorName);

    const now = new Date();
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

    const expiringCount = rows.filter(
      (v) => v.baaRenewalDate != null && new Date(v.baaRenewalDate) <= in90Days,
    ).length;
    const missingCount = rows.filter(
      (v) => v.baaRequired && v.baaStatus !== "SIGNED",
    ).length;

    return {
      vendors: rows.map(mapVendor),
      total: rows.length,
      expiringCount,
      missingCount,
    };
  }

  static async createVendor(
    locationId: string,
    body: CreateVendorBody,
    userId: string,
    userRole: string,
  ): Promise<VendorResponse> {
    const [row] = await db
      .insert(vendors)
      .values({
        locationId,
        vendorName: body.vendorName,
        serviceCategory: body.serviceCategory,
        description: body.description ?? "",
        phiExposureLevel: body.phiExposureLevel,
        transmitsPhi: body.transmitsPhi,
        storesPhi: body.storesPhi,
        subprocessor: body.subprocessor,
        baaRequired: body.baaRequired,
        baaStatus: body.baaStatus,
        baaEffectiveDate: body.baaEffectiveDate,
        baaRenewalDate: body.baaRenewalDate,
        contractOwnerUserId: body.contractOwnerUserId,
        securityOwnerUserId: body.securityOwnerUserId,
        securityReviewDate: body.securityReviewDate,
        securityReviewDueDate: body.securityReviewDueDate,
        incidentContact: body.incidentContact,
        dataResidency: body.dataResidency,
        exitPlan: body.exitPlan,
        notes: body.notes,
      })
      .returning();
    // biome-ignore lint/style/noNonNullAssertion: insert always returns a row
    const vendor = mapVendor(row!);
    await AuditService.log("create", userId, null, {
      userRole,
      locationId,
      resourceType: "vendor",
      resourceId: vendor.id,
      details: { vendorName: body.vendorName, baaStatus: body.baaStatus },
    });
    return vendor;
  }

  static async getVendor(id: string): Promise<VendorDetailResponse | null> {
    const [vendor] = await db
      .select()
      .from(vendors)
      .where(eq(vendors.id, id))
      .limit(1);

    if (!vendor) return null;

    const reviews = await db
      .select()
      .from(vendorReviews)
      .where(eq(vendorReviews.vendorId, id))
      .orderBy(vendorReviews.reviewDate);

    return { vendor: mapVendor(vendor), reviews: reviews.map(mapReview) };
  }

  static async updateVendor(
    id: string,
    body: UpdateVendorBody,
    userId: string,
    userRole: string,
    locationId: string,
  ): Promise<VendorResponse | null> {
    const updates: Partial<typeof vendors.$inferInsert> = { updatedAt: new Date() };

    if (body.vendorName !== undefined) updates.vendorName = body.vendorName;
    if (body.serviceCategory !== undefined) updates.serviceCategory = body.serviceCategory;
    if (body.description !== undefined) updates.description = body.description;
    if (body.phiExposureLevel !== undefined) updates.phiExposureLevel = body.phiExposureLevel;
    if (body.transmitsPhi !== undefined) updates.transmitsPhi = body.transmitsPhi;
    if (body.storesPhi !== undefined) updates.storesPhi = body.storesPhi;
    if (body.subprocessor !== undefined) updates.subprocessor = body.subprocessor;
    if (body.baaRequired !== undefined) updates.baaRequired = body.baaRequired;
    if (body.baaStatus !== undefined) updates.baaStatus = body.baaStatus;
    if (body.baaEffectiveDate !== undefined) updates.baaEffectiveDate = body.baaEffectiveDate;
    if (body.baaRenewalDate !== undefined) updates.baaRenewalDate = body.baaRenewalDate;
    if (body.contractOwnerUserId !== undefined)
      updates.contractOwnerUserId = body.contractOwnerUserId;
    if (body.securityOwnerUserId !== undefined)
      updates.securityOwnerUserId = body.securityOwnerUserId;
    if (body.securityReviewDate !== undefined) updates.securityReviewDate = body.securityReviewDate;
    if (body.securityReviewDueDate !== undefined)
      updates.securityReviewDueDate = body.securityReviewDueDate;
    if (body.incidentContact !== undefined) updates.incidentContact = body.incidentContact;
    if (body.dataResidency !== undefined) updates.dataResidency = body.dataResidency;
    if (body.exitPlan !== undefined) updates.exitPlan = body.exitPlan;
    if (body.notes !== undefined) updates.notes = body.notes;

    const [row] = await db
      .update(vendors)
      .set(updates)
      .where(eq(vendors.id, id))
      .returning();
    if (!row) return null;
    await AuditService.log("update", userId, null, {
      userRole,
      locationId,
      resourceType: "vendor",
      resourceId: id,
      details: { changedFields: Object.keys(updates).filter((k) => k !== "updatedAt") },
    });
    return mapVendor(row);
  }

  static async addReview(
    vendorId: string,
    locationId: string,
    userId: string,
    body: CreateVendorReviewBody,
  ): Promise<VendorReviewResponse> {
    const [row] = await db
      .insert(vendorReviews)
      .values({
        vendorId,
        locationId,
        reviewedByUserId: userId,
        reviewDate: body.reviewDate,
        outcome: body.outcome,
        baaStatusAtReview: body.baaStatusAtReview,
        notes: body.notes,
      })
      .returning();

    // If outcome is SUSPENDED, update vendor baaStatus accordingly
    if (body.outcome === "SUSPENDED") {
      await db
        .update(vendors)
        .set({ baaStatus: "SUSPENDED", updatedAt: new Date() })
        .where(eq(vendors.id, vendorId));
    }

    // biome-ignore lint/style/noNonNullAssertion: insert always returns a row
    const review = mapReview(row!);
    await AuditService.log("create", userId, null, {
      userRole: "compliance_officer",
      locationId,
      resourceType: "vendor_review",
      resourceId: review.id,
      details: { vendorId, outcome: body.outcome, baaStatusAtReview: body.baaStatusAtReview },
    });
    return review;
  }

  static async getExpiring(
    locationId: string,
    withinDays: number,
  ): Promise<ExpiringBaaResponseType> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + withinDays);
    const today = new Date().toISOString().split("T")[0] as string;
    const cutoffStr = cutoff.toISOString().split("T")[0] as string;

    const rows = await db
      .select({
        id: vendors.id,
        vendorName: vendors.vendorName,
        baaRenewalDate: vendors.baaRenewalDate,
      })
      .from(vendors)
      .where(
        and(
          eq(vendors.locationId, locationId),
          eq(vendors.isActive, true),
          isNotNull(vendors.baaRenewalDate),
          lte(vendors.baaRenewalDate, cutoffStr),
          gte(vendors.baaRenewalDate, today),
        ),
      )
      .orderBy(vendors.baaRenewalDate);

    const now = new Date();
    const items = rows.map((r) => ({
      vendorId: r.id,
      vendorName: r.vendorName,
      baaRenewalDate: r.baaRenewalDate ?? "",
      daysUntilExpiry: r.baaRenewalDate
        ? Math.ceil(
            (new Date(r.baaRenewalDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
          )
        : 0,
    }));

    return { items, withinDays };
  }

  static async getMissingBaas(locationId: string): Promise<VendorResponse[]> {
    const rows = await db
      .select()
      .from(vendors)
      .where(
        and(
          eq(vendors.locationId, locationId),
          eq(vendors.isActive, true),
          eq(vendors.baaRequired, true),
          ne(vendors.baaStatus, "SIGNED"),
        ),
      )
      .orderBy(vendors.vendorName);

    return rows.map(mapVendor);
  }

  /**
   * Weekly compliance scan — called by BullMQ worker.
   * Returns counts for structured logging.
   */
  static async runComplianceCheck(locationId: string): Promise<{
    expiringCount: number;
    missingCount: number;
    overdueReviewCount: number;
  }> {
    const now = new Date();
    const in90Days = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const today = now.toISOString().split("T")[0] as string;

    const [expiring, missing, overdue] = await Promise.all([
      // BAA expiring within 90 days
      db
        .select({ id: vendors.id })
        .from(vendors)
        .where(
          and(
            eq(vendors.locationId, locationId),
            eq(vendors.isActive, true),
            isNotNull(vendors.baaRenewalDate),
            lte(vendors.baaRenewalDate, in90Days.toISOString().split("T")[0] as string),
            gte(vendors.baaRenewalDate, today),
          ),
        ),
      // Missing BAAs (required but not signed)
      db
        .select({ id: vendors.id })
        .from(vendors)
        .where(
          and(
            eq(vendors.locationId, locationId),
            eq(vendors.isActive, true),
            eq(vendors.baaRequired, true),
            ne(vendors.baaStatus, "SIGNED"),
          ),
        ),
      // Security review overdue
      db
        .select({ id: vendors.id })
        .from(vendors)
        .where(
          and(
            eq(vendors.locationId, locationId),
            eq(vendors.isActive, true),
            isNotNull(vendors.securityReviewDueDate),
            lt(vendors.securityReviewDueDate, today),
          ),
        ),
    ]);

    return {
      expiringCount: expiring.length,
      missingCount: missing.length,
      overdueReviewCount: overdue.length,
    };
  }
}
