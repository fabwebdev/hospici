/**
 * QualityAnalyticsService — clinician scorecard + deficiency trend computation (T3-11).
 * Reads from T2-9 encounter review data: firstPassApproved, revisionCount,
 * revisionRequests JSONB, billingImpact, complianceImpact, dueBy, reviewedAt.
 *
 * Discipline inference: current encounter visit types are all RN-style.
 * When SW/CHAPLAIN/THERAPY/AIDE visit types are added the CASE will extend.
 */

import { db } from "@/db/client.js";
import { encounters } from "@/db/schema/encounters.table.js";
import { locations } from "@/db/schema/locations.table.js";
import { users } from "@/db/schema/users.table.js";
import { and, avg, count, eq, gte, isNotNull, lte, sql } from "drizzle-orm";
import type {
  ClinicianQualityScorecardType,
  DeficiencyTrendReportType,
  QualityOutlierType,
  ScorecardQueryType,
  TrendQueryType,
} from "../../qapi/schemas/qapi.schema.js";
import type { RevisionRequestType } from "../../clinical/schemas/noteReview.schema.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultPeriod(): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 84); // 12 weeks
  return { from, to };
}

/** ISO week label e.g. "2026-W10" */
function toISOWeek(d: Date): string {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const weekNum = Math.ceil(((d.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/**
 * Infer discipline from visit_type.
 * All current types are RN — extend this CASE as more disciplines are added.
 */
function disciplineFromVisitType(_visitType: string): string {
  return "RN";
}

/** Compute median from a sorted numeric array */
function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid] ?? 0;
  }
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

/** Aggregate deficiency types from RevisionRequest[] JSONB */
function aggregateDeficiencies(
  revRequests: unknown,
): Record<string, number> {
  if (!Array.isArray(revRequests)) return {};
  const counts: Record<string, number> = {};
  for (const req of revRequests as RevisionRequestType[]) {
    if (req.deficiencyType) {
      counts[req.deficiencyType] = (counts[req.deficiencyType] ?? 0) + 1;
    }
  }
  return counts;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class QualityAnalyticsService {
  /**
   * List all clinician scorecards for a period.
   * Only includes encounters that have completed review (APPROVED or LOCKED).
   */
  static async getClinicianScorecards(
    query: ScorecardQueryType,
  ): Promise<{ data: ClinicianQualityScorecardType[]; period: { from: string; to: string } }> {
    const period = defaultPeriod();
    const fromDate = query.from ? new Date(query.from) : period.from;
    const toDate = query.to ? new Date(query.to) : period.to;

    const conditions = [
      gte(encounters.createdAt, fromDate),
      lte(encounters.createdAt, toDate),
      sql`${encounters.reviewStatus} IN ('APPROVED', 'LOCKED')`,
    ];
    if (query.locationId) conditions.push(eq(encounters.locationId, query.locationId));

    const rows = await db
      .select({
        clinicianId: encounters.clinicianId,
        clinicianName: users.name,
        visitType: encounters.visitType,
        firstPassApproved: encounters.firstPassApproved,
        revisionCount: encounters.revisionCount,
        revisionRequests: encounters.revisionRequests,
        billingImpact: encounters.billingImpact,
        complianceImpact: encounters.complianceImpact,
        dueBy: encounters.dueBy,
        reviewedAt: encounters.reviewedAt,
        createdAt: encounters.createdAt,
      })
      .from(encounters)
      .leftJoin(users, eq(encounters.clinicianId, users.id))
      .where(and(...conditions));

    // Group by clinician
    const byClinician = new Map<
      string,
      {
        name: string;
        visitType: string;
        rows: typeof rows;
      }
    >();

    for (const row of rows) {
      if (!byClinician.has(row.clinicianId)) {
        byClinician.set(row.clinicianId, {
          name: row.clinicianName ?? "Unknown",
          visitType: row.visitType,
          rows: [],
        });
      }
      byClinician.get(row.clinicianId)!.rows.push(row);
    }

    const data: ClinicianQualityScorecardType[] = [];

    for (const [clinicianId, { name, visitType, rows: cRows }] of byClinician) {
      // Filter by discipline if requested
      const discipline = disciplineFromVisitType(visitType) as
        | "RN"
        | "SW"
        | "CHAPLAIN"
        | "THERAPY"
        | "AIDE";
      if (query.discipline && query.discipline !== discipline) continue;

      const totalNotes = cRows.length;
      const firstPassCount = cRows.filter((r) => r.firstPassApproved).length;
      const firstPassApprovalRate = totalNotes > 0 ? firstPassCount / totalNotes : 0;
      const avgRevisions =
        totalNotes > 0 ? cRows.reduce((s, r) => s + (r.revisionCount ?? 0), 0) / totalNotes : 0;

      // Median turnaround hours (reviewed_at - created_at)
      const turnarounds = cRows
        .filter((r) => r.reviewedAt != null)
        .map((r) => (r.reviewedAt!.getTime() - r.createdAt.getTime()) / 3600000)
        .sort((a, b) => a - b);
      const medianTurnaround = median(turnarounds);

      // Overdue rate
      const overdueCount = cRows.filter(
        (r) => r.dueBy != null && r.reviewedAt != null && r.reviewedAt > r.dueBy,
      ).length;
      const overdueReviewRate = totalNotes > 0 ? overdueCount / totalNotes : 0;

      // Billing/compliance impact rates (% of notes with any billing/compliance revision)
      const billingCount = cRows.filter((r) => r.billingImpact).length;
      const complianceCount = cRows.filter((r) => r.complianceImpact).length;
      const billingImpactRate = totalNotes > 0 ? billingCount / totalNotes : 0;
      const complianceImpactRate = totalNotes > 0 ? complianceCount / totalNotes : 0;

      // Deficiency breakdown (aggregate from JSONB)
      const deficiencyBreakdown: Record<string, number> = {};
      for (const row of cRows) {
        const agg = aggregateDeficiencies(row.revisionRequests);
        for (const [type, cnt] of Object.entries(agg)) {
          deficiencyBreakdown[type] = (deficiencyBreakdown[type] ?? 0) + cnt;
        }
      }

      const commonDeficiencyTypes = Object.entries(deficiencyBreakdown)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([type, count]) => ({ type, count }));

      // Rolling 12-week revision trend
      const weekMap = new Map<string, number>();
      for (const row of cRows) {
        const week = toISOWeek(row.createdAt);
        weekMap.set(week, (weekMap.get(week) ?? 0) + (row.revisionCount ?? 0));
      }
      const revisionTrend = Array.from(weekMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([week, count]) => ({ week, count }));

      data.push({
        clinicianId,
        clinicianName: name,
        discipline,
        period: { from: fromDate.toISOString().split("T")[0] ?? "", to: toDate.toISOString().split("T")[0] ?? "" },
        totalNotes,
        firstPassApprovalRate: Math.round(firstPassApprovalRate * 1000) / 1000,
        averageRevisionCount: Math.round(avgRevisions * 100) / 100,
        medianTurnaroundHours: Math.round(medianTurnaround * 10) / 10,
        overdueReviewRate: Math.round(overdueReviewRate * 1000) / 1000,
        billingImpactRate: Math.round(billingImpactRate * 1000) / 1000,
        complianceImpactRate: Math.round(complianceImpactRate * 1000) / 1000,
        deficiencyBreakdown,
        commonDeficiencyTypes,
        revisionTrend,
      });
    }

    return {
      data,
      period: {
        from: fromDate.toISOString().split("T")[0] ?? "",
        to: toDate.toISOString().split("T")[0] ?? "",
      },
    };
  }

  /** Full scorecard for a single clinician */
  static async getClinicianScorecard(
    userId: string,
    query: ScorecardQueryType,
  ): Promise<ClinicianQualityScorecardType | null> {
    const all = await QualityAnalyticsService.getClinicianScorecards({ ...query });
    return all.data.find((s) => s.clinicianId === userId) ?? null;
  }

  /** Full deficiency trend report */
  static async getDeficiencyTrends(
    query: TrendQueryType,
  ): Promise<DeficiencyTrendReportType> {
    const period = defaultPeriod();
    const fromDate = query.from ? new Date(query.from) : period.from;
    const toDate = query.to ? new Date(query.to) : period.to;

    const conditions = [
      gte(encounters.createdAt, fromDate),
      lte(encounters.createdAt, toDate),
      sql`${encounters.reviewStatus} IN ('APPROVED', 'LOCKED', 'REVISION_REQUESTED', 'RESUBMITTED')`,
    ];
    if (query.locationId) conditions.push(eq(encounters.locationId, query.locationId));

    const rows = await db
      .select({
        locationId: encounters.locationId,
        clinicianId: encounters.clinicianId,
        visitType: encounters.visitType,
        firstPassApproved: encounters.firstPassApproved,
        revisionCount: encounters.revisionCount,
        revisionRequests: encounters.revisionRequests,
        assignedReviewerId: encounters.assignedReviewerId,
        reviewedAt: encounters.reviewedAt,
        dueBy: encounters.dueBy,
        createdAt: encounters.createdAt,
      })
      .from(encounters)
      .where(and(...conditions));

    // Top deficiency types overall
    const globalDefMap: Record<string, number> = {};
    for (const row of rows) {
      if (query.deficiencyType) {
        const agg = aggregateDeficiencies(row.revisionRequests);
        if (query.deficiencyType in agg) {
          globalDefMap[query.deficiencyType] =
            (globalDefMap[query.deficiencyType] ?? 0) + (agg[query.deficiencyType] ?? 0);
        }
      } else {
        const agg = aggregateDeficiencies(row.revisionRequests);
        for (const [type, cnt] of Object.entries(agg)) {
          globalDefMap[type] = (globalDefMap[type] ?? 0) + cnt;
        }
      }
    }

    const topDeficiencyTypes = Object.entries(globalDefMap)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 8)
      .map(([type, count]) => ({ type, count }));

    // Weekly trend
    const weekMap = new Map<
      string,
      { byType: Record<string, number>; total: number; firstPass: number; totalRows: number }
    >();
    for (const row of rows) {
      const week = toISOWeek(row.createdAt);
      if (!weekMap.has(week)) {
        weekMap.set(week, { byType: {}, total: 0, firstPass: 0, totalRows: 0 });
      }
      const w = weekMap.get(week)!;
      w.totalRows++;
      if (row.firstPassApproved) w.firstPass++;
      const agg = aggregateDeficiencies(row.revisionRequests);
      for (const [type, cnt] of Object.entries(agg)) {
        w.total += cnt;
        w.byType[type] = (w.byType[type] ?? 0) + cnt;
      }
    }

    const trend = Array.from(weekMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, w]) => ({
        week,
        byType: w.byType,
        totalDeficiencies: w.total,
        firstPassRate: w.totalRows > 0 ? Math.round((w.firstPass / w.totalRows) * 1000) / 1000 : 0,
      }));

    // Branch comparison
    const allLocationIds = await db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(eq(locations.isActive, true));

    const branchMap = new Map<string, { name: string; firstPass: number; total: number; defCount: number }>();
    for (const row of rows) {
      if (!branchMap.has(row.locationId)) {
        const loc = allLocationIds.find((l) => l.id === row.locationId);
        branchMap.set(row.locationId, { name: loc?.name ?? row.locationId, firstPass: 0, total: 0, defCount: 0 });
      }
      const b = branchMap.get(row.locationId)!;
      b.total++;
      if (row.firstPassApproved) b.firstPass++;
      const agg = aggregateDeficiencies(row.revisionRequests);
      b.defCount += Object.values(agg).reduce((s, c) => s + c, 0);
    }

    const branchComparison = Array.from(branchMap.entries()).map(([locationId, b]) => ({
      locationId,
      locationName: b.name,
      firstPassRate: b.total > 0 ? Math.round((b.firstPass / b.total) * 1000) / 1000 : 0,
      totalDeficiencies: b.defCount,
    }));

    // Discipline comparison (all RN for now — extends when more disciplines added)
    const disciplineMap = new Map<
      string,
      { firstPass: number; total: number; defMap: Record<string, number> }
    >();
    for (const row of rows) {
      const disc = disciplineFromVisitType(row.visitType);
      if (query.discipline && query.discipline !== disc) continue;
      if (!disciplineMap.has(disc)) {
        disciplineMap.set(disc, { firstPass: 0, total: 0, defMap: {} });
      }
      const d = disciplineMap.get(disc)!;
      d.total++;
      if (row.firstPassApproved) d.firstPass++;
      const agg = aggregateDeficiencies(row.revisionRequests);
      for (const [type, cnt] of Object.entries(agg)) {
        d.defMap[type] = (d.defMap[type] ?? 0) + cnt;
      }
    }

    const disciplineComparison = Array.from(disciplineMap.entries()).map(([discipline, d]) => {
      const topDef = Object.entries(d.defMap).sort(([, a], [, b]) => b - a)[0]?.[0] ?? "NONE";
      return {
        discipline,
        firstPassRate: d.total > 0 ? Math.round((d.firstPass / d.total) * 1000) / 1000 : 0,
        topDeficiency: topDef,
      };
    });

    // Branch × discipline matrix
    const matrixMap = new Map<string, { firstPass: number; total: number; defCount: number }>();
    for (const row of rows) {
      const disc = disciplineFromVisitType(row.visitType);
      const key = `${row.locationId}::${disc}`;
      if (!matrixMap.has(key)) {
        matrixMap.set(key, { firstPass: 0, total: 0, defCount: 0 });
      }
      const m = matrixMap.get(key)!;
      m.total++;
      if (row.firstPassApproved) m.firstPass++;
      m.defCount += Object.values(aggregateDeficiencies(row.revisionRequests)).reduce(
        (s, c) => s + c,
        0,
      );
    }

    const branchDisciplineMatrix = Array.from(matrixMap.entries()).map(([key, m]) => {
      const parts = key.split("::");
      const locationId = parts[0] ?? "";
      const discipline = parts[1] ?? "";
      return {
        locationId,
        discipline,
        firstPassRate: m.total > 0 ? Math.round((m.firstPass / m.total) * 1000) / 1000 : 0,
        deficiencyCount: m.defCount,
      };
    });

    // Reviewer workload
    const reviewerRows = await db
      .select({
        reviewerId: encounters.assignedReviewerId,
        reviewerName: users.name,
        reviewedAt: encounters.reviewedAt,
        dueBy: encounters.dueBy,
      })
      .from(encounters)
      .leftJoin(users, eq(encounters.assignedReviewerId, users.id))
      .where(
        and(
          gte(encounters.createdAt, fromDate),
          lte(encounters.createdAt, toDate),
          isNotNull(encounters.assignedReviewerId),
        ),
      );

    const reviewerMap = new Map<string, { name: string; assigned: number; resolved: number; overdue: number }>();
    for (const row of reviewerRows) {
      if (!row.reviewerId) continue;
      if (!reviewerMap.has(row.reviewerId)) {
        reviewerMap.set(row.reviewerId, { name: row.reviewerName ?? "Unknown", assigned: 0, resolved: 0, overdue: 0 });
      }
      const rv = reviewerMap.get(row.reviewerId)!;
      rv.assigned++;
      if (row.reviewedAt) rv.resolved++;
      else if (row.dueBy && row.dueBy < new Date()) rv.overdue++;
    }

    const reviewerWorkload = Array.from(reviewerMap.entries()).map(([reviewerId, rv]) => ({
      reviewerId,
      reviewerName: rv.name,
      assigned: rv.assigned,
      resolved: rv.resolved,
      overdueCount: rv.overdue,
    }));

    return {
      locationId: query.locationId ?? null,
      discipline: query.discipline ?? null,
      period: {
        from: fromDate.toISOString().split("T")[0] ?? "",
        to: toDate.toISOString().split("T")[0] ?? "",
      },
      topDeficiencyTypes,
      trend,
      branchComparison,
      disciplineComparison,
      branchDisciplineMatrix,
      reviewerWorkload,
    };
  }

  /**
   * Detect quality outliers for alert dashboard + "Raise QAPI event" CTA.
   * - First-pass rate drop ≥10pp week-over-week
   * - Billing-impact deficiency rate rising for 3+ consecutive weeks
   */
  static async getQualityOutliers(
    query: ScorecardQueryType,
  ): Promise<{ data: QualityOutlierType[]; period: { from: string; to: string } }> {
    const period = defaultPeriod();
    const fromDate = query.from ? new Date(query.from) : period.from;
    const toDate = query.to ? new Date(query.to) : period.to;

    const conditions = [
      gte(encounters.createdAt, fromDate),
      lte(encounters.createdAt, toDate),
    ];
    if (query.locationId) conditions.push(eq(encounters.locationId, query.locationId));

    const rows = await db
      .select({
        locationId: encounters.locationId,
        clinicianId: encounters.clinicianId,
        clinicianName: users.name,
        firstPassApproved: encounters.firstPassApproved,
        billingImpact: encounters.billingImpact,
        createdAt: encounters.createdAt,
      })
      .from(encounters)
      .leftJoin(users, eq(encounters.clinicianId, users.id))
      .where(and(...conditions));

    const now = new Date().toISOString();
    const outliers: QualityOutlierType[] = [];

    // Week-by-week first-pass rate per branch
    const branchWeekMap = new Map<string, Map<string, { firstPass: number; total: number }>>();
    for (const row of rows) {
      const week = toISOWeek(row.createdAt);
      if (!branchWeekMap.has(row.locationId))
        branchWeekMap.set(row.locationId, new Map());
      const wm = branchWeekMap.get(row.locationId)!;
      if (!wm.has(week)) wm.set(week, { firstPass: 0, total: 0 });
      const w = wm.get(week)!;
      w.total++;
      if (row.firstPassApproved) w.firstPass++;
    }

    for (const [locationId, weekMap] of branchWeekMap) {
      const weeks = Array.from(weekMap.entries()).sort(([a], [b]) => a.localeCompare(b));
      if (weeks.length < 2) continue;
      const [prevWeek, currWeek] = weeks.slice(-2) as [typeof weeks[0], typeof weeks[0]];
      const prevRate = prevWeek[1].total > 0 ? prevWeek[1].firstPass / prevWeek[1].total : null;
      const currRate = currWeek[1].total > 0 ? currWeek[1].firstPass / currWeek[1].total : null;
      if (prevRate !== null && currRate !== null && prevRate - currRate >= 0.1) {
        outliers.push({
          subjectType: "BRANCH",
          subjectId: locationId,
          subjectName: locationId,
          metric: "firstPassRate",
          value: Math.round(currRate * 1000) / 1000,
          threshold: Math.round((prevRate - 0.1) * 1000) / 1000,
          detectedAt: now,
        });
      }
    }

    // Billing-impact rate rising for 3+ consecutive weeks (per clinician)
    const clinicianWeekMap = new Map<
      string,
      { name: string; weeks: Map<string, { billing: number; total: number }> }
    >();
    for (const row of rows) {
      const week = toISOWeek(row.createdAt);
      if (!clinicianWeekMap.has(row.clinicianId)) {
        clinicianWeekMap.set(row.clinicianId, {
          name: row.clinicianName ?? "Unknown",
          weeks: new Map(),
        });
      }
      const cm = clinicianWeekMap.get(row.clinicianId)!;
      if (!cm.weeks.has(week)) cm.weeks.set(week, { billing: 0, total: 0 });
      const w = cm.weeks.get(week)!;
      w.total++;
      if (row.billingImpact) w.billing++;
    }

    for (const [clinicianId, { name, weeks }] of clinicianWeekMap) {
      const sorted = Array.from(weeks.entries()).sort(([a], [b]) => a.localeCompare(b));
      if (sorted.length < 3) continue;
      const last3 = sorted.slice(-3).map(([, w]) =>
        w.total > 0 ? w.billing / w.total : 0,
      );
      const rising = last3[0]! < last3[1]! && last3[1]! < last3[2]! && last3[2]! > 0.2;
      if (rising) {
        outliers.push({
          subjectType: "CLINICIAN",
          subjectId: clinicianId,
          subjectName: name,
          metric: "billingImpactRate",
          value: Math.round(last3[2]! * 1000) / 1000,
          threshold: 0.2,
          detectedAt: now,
        });
      }
    }

    return {
      data: outliers,
      period: {
        from: fromDate.toISOString().split("T")[0] ?? "",
        to: toDate.toISOString().split("T")[0] ?? "",
      },
    };
  }
}
