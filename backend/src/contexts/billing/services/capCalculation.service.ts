/**
 * CapCalculationService — Hospice Cap Intelligence (T3-3)
 *
 * CMS 42 CFR §418.309 — Hospice aggregate cap.
 * Cap year: November 1 (year N) – October 31 (year N+1).
 *
 * Formula version 1.0.0 — CMS FY2024 base rates:
 *   Routine home care:        $195.75/day
 *   Continuous home care:   $1,513.76/24h
 *   General inpatient:      $1,093.06/day
 *   Per-beneficiary cap:   $33,394.93
 *
 * NOTE (T3-7): When actual billing data is available, replace derived
 * day counts with data from the claims/billing tables.
 */

import { createHash } from "node:crypto";
import { AlertService } from "@/contexts/compliance/services/alert.service.js";
import { db } from "@/db/client.js";
import { capPatientContributions } from "@/db/schema/cap-patient-contributions.table.js";
import { capSnapshots } from "@/db/schema/cap-snapshots.table.js";
import { complianceAlerts } from "@/db/schema/compliance-alerts.table.js";
import { locations } from "@/db/schema/locations.table.js";
import { patients } from "@/db/schema/patients.table.js";
import { complianceEvents } from "@/events/compliance-events.js";
import { decryptPhiFields } from "@/shared-kernel/services/phi-encryption.service.js";
import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import type Valkey from "iovalkey";
import type {
  CapPatientContributionItem,
  CapPatientListQuery,
  CapPatientListResponse,
  CapSnapshotResponse,
  CapSummaryResponse,
  CapTrendResponse,
} from "../schemas/capIntelligence.schema.js";

// ── CMS FY2024 rates ──────────────────────────────────────────────────────────

const FORMULA_VERSION = "1.0.0";
const ROUTINE_HOME_CARE_RATE = 195.75;
const CONTINUOUS_HOME_CARE_RATE = 1513.76;
const GENERAL_INPATIENT_RATE = 1093.06;
const PER_BENEFICIARY_CAP = 33394.93;

// ── Cache keys ────────────────────────────────────────────────────────────────

const summaryCacheKey = (locationId: string, capYear: number) =>
  `cap:summary:${locationId}:${capYear}`;

const trendsCacheKey = (locationId: string, capYear: number) =>
  `cap:trends:${locationId}:${capYear}`;

// ── Date helpers ──────────────────────────────────────────────────────────────

/** capYear = starting year (e.g. 2025 = Nov 2025 – Oct 2026) */
function getCapYearBounds(capYear: number): { start: string; end: string } {
  return {
    start: `${capYear}-11-01`,
    end: `${capYear + 1}-10-31`,
  };
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(0, Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
}

function daysInCapYear(
  admissionDate: string,
  dischargeDate: string | null,
  capYearStart: string,
  capYearEnd: string,
): number {
  const start = new Date(
    Math.max(new Date(admissionDate).getTime(), new Date(capYearStart).getTime()),
  );
  const end = new Date(
    Math.min(
      dischargeDate ? new Date(dischargeDate).getTime() : Date.now(),
      new Date(capYearEnd).getTime(),
    ),
  );
  return daysBetween(start, end);
}

// ── RLS helper ────────────────────────────────────────────────────────────────

type TxClient = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function applyRls(tx: TxClient, locationId: string, role: string): Promise<void> {
  await tx.execute(sql`SELECT set_config('app.current_location_id', ${locationId}, true)`);
  await tx.execute(sql`SELECT set_config('app.current_role', ${role}, true)`);
}

// ── PHI name helper ───────────────────────────────────────────────────────────

async function decryptPatientName(patientId: string, patientData: unknown): Promise<string> {
  try {
    const decrypted = await decryptPhiFields(
      patientData as Record<string, string | null | undefined>,
    );
    const nameArr = decrypted.name as
      | Array<{ text?: string; family?: string; given?: string[] }>
      | undefined;
    if (Array.isArray(nameArr) && nameArr[0]) {
      return (
        nameArr[0].text ??
        [nameArr[0].family, ...(nameArr[0].given ?? [])].filter(Boolean).join(" ")
      );
    }
  } catch {
    // PHI decrypt failure — return redacted
  }
  return `Patient:${patientId}`;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class CapCalculationService {
  private readonly alertService: AlertService;

  constructor(private readonly valkey: Valkey) {
    this.alertService = new AlertService(valkey);
  }

  /**
   * Full cap calculation for a single location in a given cap year.
   * Steps: pull patients → compute contributions → insert snapshot + contributions
   * → upsert threshold alerts → emit Socket.IO events → invalidate cache.
   */
  async calculate(
    locationId: string,
    capYear: number,
    triggeredBy: "scheduled" | "manual" | "data_correction" = "scheduled",
    triggeredByUserId: string | null = null,
  ): Promise<{
    snapshotId: string;
    utilizationPercent: number;
    projectedYearEndPercent: number;
  }> {
    const { start: capYearStart, end: capYearEnd } = getCapYearBounds(capYear);

    // ── Step 1: Pull eligible HOSPICE patients ────────────────────────────────

    const patientRows = await db
      .select({
        id: patients.id,
        admissionDate: patients.admissionDate,
        dischargeDate: patients.dischargeDate,
        careModel: patients.careModel,
        data: patients.data,
      })
      .from(patients)
      .where(
        and(
          eq(patients.locationId, locationId),
          eq(patients.careModel, "HOSPICE"),
          lte(patients.admissionDate, capYearEnd),
          or(isNull(patients.dischargeDate), gte(patients.dischargeDate, capYearStart)),
        ),
      );

    // ── Steps 2-3: Per-patient contribution + aggregate ───────────────────────

    type ContribRow = {
      patientId: string;
      patientName: string;
      admissionDate: string;
      dischargeDate: string | null;
      routineDays: number;
      continuousHomeCareDays: number;
      inpatientDays: number;
      liveDischargeFlag: boolean;
      capContributionAmount: number;
    };

    const contributions: ContribRow[] = [];
    let totalContributions = 0;
    let aggregateCapDenominator = 0; // sum of beneficiary years

    for (const p of patientRows) {
      if (!p.admissionDate) continue;

      // T3-3: all days classified as routine home care (T3-7 will provide actual levels)
      const routineDays = daysInCapYear(p.admissionDate, p.dischargeDate, capYearStart, capYearEnd);
      const continuousHomeCareDays = 0;
      const inpatientDays = 0;
      const beneficiaryDays = routineDays + continuousHomeCareDays + inpatientDays;
      if (beneficiaryDays <= 0) continue;

      const rawContribution =
        routineDays * ROUTINE_HOME_CARE_RATE +
        continuousHomeCareDays * CONTINUOUS_HOME_CARE_RATE +
        inpatientDays * GENERAL_INPATIENT_RATE;

      const capped = Math.min(rawContribution, PER_BENEFICIARY_CAP);
      aggregateCapDenominator += beneficiaryDays / 365;
      totalContributions += capped;

      const patientName = await decryptPatientName(p.id, p.data);

      contributions.push({
        patientId: p.id,
        patientName,
        admissionDate: p.admissionDate,
        dischargeDate: p.dischargeDate,
        routineDays,
        continuousHomeCareDays,
        inpatientDays,
        liveDischargeFlag: !!p.dischargeDate,
        capContributionAmount: Math.round(capped * 100) / 100,
      });
    }

    // ── Step 4: Compute utilization + projection ──────────────────────────────

    const aggregateCapAmount = aggregateCapDenominator * PER_BENEFICIARY_CAP;
    const estimatedLiability = Math.max(0, totalContributions - aggregateCapAmount);
    const utilizationPercent =
      aggregateCapAmount > 0
        ? Math.round((totalContributions / aggregateCapAmount) * 100 * 1000) / 1000
        : 0;

    const now = new Date();
    const capStartDate = new Date(capYearStart);
    const capEndDate = new Date(capYearEnd);
    const totalDaysInYear = daysBetween(capStartDate, capEndDate);
    const daysElapsed = Math.min(Math.max(daysBetween(capStartDate, now), 1), totalDaysInYear);
    const projectedYearEndPercent =
      daysElapsed > 0
        ? Math.round((utilizationPercent / (daysElapsed / totalDaysInYear)) * 1000) / 1000
        : 0;

    // ── Step 5: inputHash ─────────────────────────────────────────────────────

    const inputHash = createHash("sha256")
      .update(
        JSON.stringify({
          locationId,
          capYear,
          formulaVersion: FORMULA_VERSION,
          patientIds: contributions.map((c) => c.patientId).sort(),
          contributions: contributions.map((c) => ({
            patientId: c.patientId,
            amount: c.capContributionAmount,
          })),
          aggregateCapAmount: Math.round(aggregateCapAmount * 100) / 100,
        }),
      )
      .digest("hex");

    // ── Steps 6-8: Insert snapshot + contributions ────────────────────────────

    const snapshotId = await db.transaction(async (tx) => {
      await applyRls(tx, locationId, "admin");

      const [row] = await tx
        .insert(capSnapshots)
        .values({
          locationId,
          capYear,
          utilizationPercent: String(utilizationPercent),
          projectedYearEndPercent: String(projectedYearEndPercent),
          estimatedLiability: String(Math.round(estimatedLiability * 100) / 100),
          patientCount: contributions.length,
          formulaVersion: FORMULA_VERSION,
          inputHash,
          triggeredBy,
          triggeredByUserId,
        })
        .returning({ id: capSnapshots.id });

      if (!row) throw new Error("Failed to insert cap_snapshots row");

      if (contributions.length > 0) {
        await tx.insert(capPatientContributions).values(
          contributions.map((c) => ({
            snapshotId: row.id,
            patientId: c.patientId,
            locationId,
            capContributionAmount: String(c.capContributionAmount),
            routineDays: c.routineDays,
            continuousHomeCareDays: c.continuousHomeCareDays,
            inpatientDays: c.inpatientDays,
            liveDischargeFlag: c.liveDischargeFlag,
            admissionDate: c.admissionDate,
            ...(c.dischargeDate ? { dischargeDate: c.dischargeDate } : {}),
          })),
        );
      }

      return row.id;
    });

    // ── Step 9: Upsert threshold alerts ──────────────────────────────────────

    const firstContrib = contributions[0];
    if (firstContrib) {
      const daysRemaining = Math.max(
        0,
        Math.ceil((capEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      );
      const alertBase = {
        patientId: firstContrib.patientId,
        patientName: firstContrib.patientName,
        locationId,
        dueDate: capYearEnd,
        daysRemaining,
      };

      const crossedThresholds: string[] = [];

      if (utilizationPercent >= 70 && utilizationPercent < 80) {
        await this.alertService
          .upsertAlert({
            ...alertBase,
            type: "CAP_THRESHOLD_70",
            severity: "warning",
            description: `Hospice cap utilization at ${utilizationPercent.toFixed(1)}% (≥70%). 42 CFR §418.309`,
            rootCause: "Cumulative patient days approaching Medicare hospice aggregate cap",
            nextAction: "Review top contributors. Assess discharge planning for long-stay patients",
          })
          .catch(() => {});
        crossedThresholds.push("CAP_THRESHOLD_70");
      } else if (utilizationPercent >= 80 && utilizationPercent < 90) {
        await this.alertService
          .upsertAlert({
            ...alertBase,
            type: "CAP_THRESHOLD_80",
            severity: "warning",
            description: `Hospice cap utilization at ${utilizationPercent.toFixed(1)}% (≥80%). 42 CFR §418.309`,
            rootCause: "Cumulative patient days approaching Medicare hospice aggregate cap",
            nextAction:
              "Immediate review of top contributors. Consult billing specialist on exposure",
          })
          .catch(() => {});
        crossedThresholds.push("CAP_THRESHOLD_80");
      } else if (utilizationPercent >= 90) {
        await this.alertService
          .upsertAlert({
            ...alertBase,
            type: "CAP_THRESHOLD_90",
            severity: "critical",
            description: `Hospice cap utilization at ${utilizationPercent.toFixed(1)}% (≥90%). CMS repayment risk. 42 CFR §418.309`,
            rootCause: "Hospice at high risk of exceeding Medicare aggregate cap",
            nextAction:
              "Escalate to administrator. Review all long-stay patients for appropriate level of care",
          })
          .catch(() => {});
        crossedThresholds.push("CAP_THRESHOLD_90");
      }

      if (projectedYearEndPercent >= 100) {
        await this.alertService
          .upsertAlert({
            ...alertBase,
            type: "CAP_PROJECTED_OVERAGE",
            severity: "critical",
            description: `Hospice cap projected year-end: ${projectedYearEndPercent.toFixed(1)}%. CMS repayment projected. 42 CFR §418.309`,
            rootCause: "Linear extrapolation projects cap overage by end of cap year",
            nextAction:
              "Immediate administrator review. Consult compliance attorney on repayment strategy",
          })
          .catch(() => {});
        crossedThresholds.push("CAP_PROJECTED_OVERAGE");
      }

      // ── Step 10: Emit Socket.IO events ──────────────────────────────────────
      for (const threshold of crossedThresholds) {
        complianceEvents.emit("cap:threshold:alert", {
          locationId,
          capYear,
          utilizationPercent,
          projectedYearEndPercent,
          threshold,
        });
      }
    }

    // Invalidate cache
    await this.valkey.del(summaryCacheKey(locationId, capYear)).catch(() => {});
    await this.valkey.del(trendsCacheKey(locationId, capYear)).catch(() => {});

    return { snapshotId, utilizationPercent, projectedYearEndPercent };
  }

  // ── Summary ───────────────────────────────────────────────────────────────

  async getCapSummary(locationId: string, capYear: number): Promise<CapSummaryResponse> {
    const cacheKey = summaryCacheKey(locationId, capYear);
    const cached = await this.valkey.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached) as CapSummaryResponse;

    const { start: capYearStart, end: capYearEnd } = getCapYearBounds(capYear);

    const [latestSnapshot] = await db
      .select()
      .from(capSnapshots)
      .where(and(eq(capSnapshots.locationId, locationId), eq(capSnapshots.capYear, capYear)))
      .orderBy(desc(capSnapshots.calculatedAt))
      .limit(1);

    const [priorSnapshot] = await db
      .select({ utilizationPercent: capSnapshots.utilizationPercent })
      .from(capSnapshots)
      .where(and(eq(capSnapshots.locationId, locationId), eq(capSnapshots.capYear, capYear - 1)))
      .orderBy(desc(capSnapshots.calculatedAt))
      .limit(1);

    const thresholdRows = await db
      .select({
        type: complianceAlerts.type,
        createdAt: complianceAlerts.createdAt,
      })
      .from(complianceAlerts)
      .where(
        and(
          eq(complianceAlerts.locationId, locationId),
          sql`type::text IN ('CAP_THRESHOLD_70','CAP_THRESHOLD_80','CAP_THRESHOLD_90','CAP_PROJECTED_OVERAGE')`,
        ),
      )
      .orderBy(desc(complianceAlerts.createdAt))
      .limit(10);

    const now = new Date();
    const daysRemaining = Math.max(
      0,
      Math.ceil((new Date(capYearEnd).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    );

    const summary: CapSummaryResponse = {
      capYear,
      capYearStart,
      capYearEnd,
      daysRemainingInYear: daysRemaining,
      utilizationPercent: latestSnapshot ? Number(latestSnapshot.utilizationPercent) : 0,
      projectedYearEndPercent: latestSnapshot ? Number(latestSnapshot.projectedYearEndPercent) : 0,
      estimatedLiability: latestSnapshot ? Number(latestSnapshot.estimatedLiability) : 0,
      patientCount: latestSnapshot?.patientCount ?? 0,
      lastCalculatedAt: latestSnapshot?.calculatedAt?.toISOString() ?? null,
      thresholdAlerts: thresholdRows.map((r) => ({
        type: r.type as CapSummaryResponse["thresholdAlerts"][number]["type"],
        firedAt: r.createdAt?.toISOString() ?? now.toISOString(),
      })),
      priorYearUtilizationPercent: priorSnapshot ? Number(priorSnapshot.utilizationPercent) : null,
    };

    await this.valkey.set(cacheKey, JSON.stringify(summary), "EX", 300).catch(() => {});
    return summary;
  }

  // ── Patient contributors ───────────────────────────────────────────────────

  async getPatientContributors(
    locationId: string,
    capYear: number,
    query: CapPatientListQuery,
  ): Promise<CapPatientListResponse> {
    let snapshotId = query.snapshotId;
    if (!snapshotId) {
      const [latest] = await db
        .select({ id: capSnapshots.id })
        .from(capSnapshots)
        .where(and(eq(capSnapshots.locationId, locationId), eq(capSnapshots.capYear, capYear)))
        .orderBy(desc(capSnapshots.calculatedAt))
        .limit(1);
      snapshotId = latest?.id;
    }

    if (!snapshotId) return { data: [], total: 0, snapshotId: null };

    const rows = await db
      .select({
        patientId: capPatientContributions.patientId,
        admissionDate: capPatientContributions.admissionDate,
        dischargeDate: capPatientContributions.dischargeDate,
        capContributionAmount: capPatientContributions.capContributionAmount,
        routineDays: capPatientContributions.routineDays,
        continuousHomeCareDays: capPatientContributions.continuousHomeCareDays,
        inpatientDays: capPatientContributions.inpatientDays,
        liveDischargeFlag: capPatientContributions.liveDischargeFlag,
        careModel: patients.careModel,
        patientData: patients.data,
      })
      .from(capPatientContributions)
      .innerJoin(patients, eq(capPatientContributions.patientId, patients.id))
      .where(eq(capPatientContributions.snapshotId, snapshotId));

    const totalAmount = rows.reduce((s, r) => s + Number(r.capContributionAmount), 0);

    let items: CapPatientContributionItem[] = await Promise.all(
      rows.map(async (r) => {
        const losDays = r.routineDays + r.continuousHomeCareDays + r.inpatientDays;
        const patientName = await decryptPatientName(r.patientId, r.patientData);
        const amount = Number(r.capContributionAmount);
        return {
          patientId: r.patientId,
          patientName,
          admissionDate: r.admissionDate,
          dischargeDate: r.dischargeDate ?? null,
          losDays,
          careModel: r.careModel,
          capContributionAmount: amount,
          contributionPercent:
            totalAmount > 0 ? Math.round((amount / totalAmount) * 10000) / 100 : 0,
          routineDays: r.routineDays,
          continuousHomeCareDays: r.continuousHomeCareDays,
          inpatientDays: r.inpatientDays,
          liveDischargeFlag: r.liveDischargeFlag,
        };
      }),
    );

    if (query.losMin !== undefined) items = items.filter((i) => i.losDays >= (query.losMin ?? 0));
    if (query.losMax !== undefined)
      items = items.filter((i) => i.losDays <= (query.losMax ?? Number.POSITIVE_INFINITY));

    if (query.highUtilizationOnly) {
      const sorted = [...items].sort((a, b) => b.capContributionAmount - a.capContributionAmount);
      const top10Count = Math.max(1, Math.ceil(items.length * 0.1));
      const top10Threshold = sorted[top10Count - 1]?.capContributionAmount ?? 0;
      items = items.filter((i) => i.losDays > 180 || i.capContributionAmount >= top10Threshold);
    }

    const sortBy = query.sortBy ?? "contribution";
    if (sortBy === "contribution")
      items.sort((a, b) => b.capContributionAmount - a.capContributionAmount);
    else if (sortBy === "los") items.sort((a, b) => b.losDays - a.losDays);
    else items.sort((a, b) => a.patientName.localeCompare(b.patientName));

    const limit = query.limit ?? 25;
    const total = items.length;
    return { data: items.slice(0, limit), total, snapshotId };
  }

  // ── Trends ────────────────────────────────────────────────────────────────

  async getCapTrends(locationId: string, capYear: number): Promise<CapTrendResponse> {
    const cacheKey = trendsCacheKey(locationId, capYear);
    const cached = await this.valkey.get(cacheKey).catch(() => null);
    if (cached) return JSON.parse(cached) as CapTrendResponse;

    const snapRows = await db
      .select({
        id: capSnapshots.id,
        calculatedAt: capSnapshots.calculatedAt,
        utilizationPercent: capSnapshots.utilizationPercent,
        projectedYearEndPercent: capSnapshots.projectedYearEndPercent,
        patientCount: capSnapshots.patientCount,
      })
      .from(capSnapshots)
      .where(and(eq(capSnapshots.locationId, locationId), eq(capSnapshots.capYear, capYear)))
      .orderBy(capSnapshots.calculatedAt);

    const byMonth = new Map<string, (typeof snapRows)[0]>();
    for (const s of snapRows) {
      const month = s.calculatedAt?.toISOString().substring(0, 7) ?? "";
      if (month) byMonth.set(month, s);
    }

    const months = Array.from(byMonth.entries()).map(([month, s]) => ({
      month,
      utilizationPercent: Number(s.utilizationPercent),
      projectedYearEndPercent: Number(s.projectedYearEndPercent),
      patientCount: s.patientCount,
      snapshotId: s.id,
    }));

    const allBranchSnaps = await db
      .select({
        locationId: capSnapshots.locationId,
        locationName: locations.name,
        utilizationPercent: capSnapshots.utilizationPercent,
        projectedYearEndPercent: capSnapshots.projectedYearEndPercent,
        calculatedAt: capSnapshots.calculatedAt,
      })
      .from(capSnapshots)
      .innerJoin(locations, eq(capSnapshots.locationId, locations.id))
      .where(eq(capSnapshots.capYear, capYear))
      .orderBy(capSnapshots.calculatedAt);

    type BranchPair = {
      latest: (typeof allBranchSnaps)[0];
      prior: (typeof allBranchSnaps)[0] | null;
    };

    const branchMap = new Map<string, BranchPair>();
    for (const s of allBranchSnaps) {
      const existing = branchMap.get(s.locationId);
      branchMap.set(s.locationId, {
        latest: s,
        prior: existing?.latest ?? null,
      });
    }

    const branchComparison = Array.from(branchMap.values()).map(({ latest, prior }) => {
      const cur = Number(latest.utilizationPercent);
      const prev = prior ? Number(prior.utilizationPercent) : cur;
      let trend: "up" | "down" | "stable" = "stable";
      if (cur > prev + 0.5) trend = "up";
      else if (cur < prev - 0.5) trend = "down";
      return {
        locationId: latest.locationId,
        locationName: latest.locationName ?? "",
        utilizationPercent: cur,
        projectedYearEndPercent: Number(latest.projectedYearEndPercent),
        trend,
      };
    });

    const result: CapTrendResponse = { months, branchComparison };
    await this.valkey.set(cacheKey, JSON.stringify(result), "EX", 300).catch(() => {});
    return result;
  }

  // ── Snapshot detail ───────────────────────────────────────────────────────

  async getSnapshotById(
    snapshotId: string,
    locationId: string,
  ): Promise<CapSnapshotResponse | null> {
    const [snapshot] = await db
      .select()
      .from(capSnapshots)
      .where(and(eq(capSnapshots.id, snapshotId), eq(capSnapshots.locationId, locationId)))
      .limit(1);

    if (!snapshot) return null;

    const rows = await db
      .select({
        patientId: capPatientContributions.patientId,
        admissionDate: capPatientContributions.admissionDate,
        dischargeDate: capPatientContributions.dischargeDate,
        capContributionAmount: capPatientContributions.capContributionAmount,
        routineDays: capPatientContributions.routineDays,
        continuousHomeCareDays: capPatientContributions.continuousHomeCareDays,
        inpatientDays: capPatientContributions.inpatientDays,
        liveDischargeFlag: capPatientContributions.liveDischargeFlag,
        careModel: patients.careModel,
        patientData: patients.data,
      })
      .from(capPatientContributions)
      .innerJoin(patients, eq(capPatientContributions.patientId, patients.id))
      .where(eq(capPatientContributions.snapshotId, snapshotId));

    const totalAmount = rows.reduce((s, r) => s + Number(r.capContributionAmount), 0);

    const contributions = await Promise.all(
      rows.map(async (r) => {
        const losDays = r.routineDays + r.continuousHomeCareDays + r.inpatientDays;
        const patientName = await decryptPatientName(r.patientId, r.patientData);
        const amount = Number(r.capContributionAmount);
        return {
          patientId: r.patientId,
          patientName,
          admissionDate: r.admissionDate,
          dischargeDate: r.dischargeDate ?? null,
          losDays,
          careModel: r.careModel,
          capContributionAmount: amount,
          contributionPercent:
            totalAmount > 0 ? Math.round((amount / totalAmount) * 10000) / 100 : 0,
          routineDays: r.routineDays,
          continuousHomeCareDays: r.continuousHomeCareDays,
          inpatientDays: r.inpatientDays,
          liveDischargeFlag: r.liveDischargeFlag,
        } satisfies CapPatientContributionItem;
      }),
    );

    return {
      id: snapshot.id,
      locationId: snapshot.locationId,
      capYear: snapshot.capYear,
      calculatedAt: snapshot.calculatedAt?.toISOString() ?? new Date().toISOString(),
      utilizationPercent: Number(snapshot.utilizationPercent),
      projectedYearEndPercent: Number(snapshot.projectedYearEndPercent),
      estimatedLiability: Number(snapshot.estimatedLiability),
      patientCount: snapshot.patientCount,
      formulaVersion: snapshot.formulaVersion,
      inputHash: snapshot.inputHash,
      triggeredBy: snapshot.triggeredBy,
      triggeredByUserId: snapshot.triggeredByUserId ?? null,
      contributions,
    };
  }

  /** Used by the worker to get all locations for scheduled recalculation */
  async getAllLocations(): Promise<Array<{ id: string }>> {
    return db.select({ id: locations.id }).from(locations);
  }
}
