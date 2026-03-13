// routes/_authed/analytics/scorecards.tsx
// Clinician Quality Scorecard Dashboard — T3-11
// Summary table + clinician detail view with 8 metrics + 12-week revision trend

import { getScorecardFn, listScorecardsFn } from "@/functions/qapi.functions.js";
import type { ClinicianQualityScorecard, QAPIDiscipline } from "@hospici/shared-types";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_authed/analytics/scorecards")({
  component: ScorecardsPage,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function rateColor(rate: number, good = "low"): string {
  if (good === "high") return rate >= 0.8 ? "text-green-600" : rate >= 0.6 ? "text-yellow-600" : "text-red-600";
  return rate <= 0.1 ? "text-green-600" : rate <= 0.25 ? "text-yellow-600" : "text-red-600";
}

// Mini sparkline using SVG
function Sparkline({ data }: { data: { week: string; count: number }[] }) {
  if (data.length < 2) return <span className="text-xs text-gray-400">—</span>;
  const maxVal = Math.max(...data.map((d) => d.count), 1);
  const w = 80;
  const h = 24;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - (d.count / maxVal) * h;
    return `${x},${y}`;
  });
  return (
    <svg width={w} height={h} className="inline-block">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="#3b82f6"
        strokeWidth={1.5}
      />
    </svg>
  );
}

// ── Detail drawer ─────────────────────────────────────────────────────────────

function ScorecardDetailDrawer({
  clinicianId,
  query,
  onClose,
}: {
  clinicianId: string;
  query: { from?: string; to?: string };
  onClose: () => void;
}) {
  const detailQ = useQuery({
    queryKey: ["scorecard-detail", clinicianId, query],
    queryFn: () => getScorecardFn({ data: { userId: clinicianId, query } }),
  });

  const sc = detailQ.data;

  return (
    <div className="fixed inset-0 z-40 flex">
      <button type="button" className="flex-1" onClick={onClose} />
      <div className="w-full max-w-xl bg-white shadow-2xl overflow-y-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            {sc ? sc.clinicianName : "Loading…"}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">
            ×
          </button>
        </div>

        {detailQ.isLoading && <p className="text-sm text-gray-400">Loading scorecard…</p>}
        {detailQ.error && <p className="text-sm text-red-600">Failed to load scorecard.</p>}

        {sc && (
          <>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="bg-gray-100 px-2 py-0.5 rounded text-xs">{sc.discipline}</span>
              <span>
                {sc.period.from} — {sc.period.to}
              </span>
              <span>{sc.totalNotes} notes reviewed</span>
            </div>

            {/* 8 metric grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">First-Pass Rate</p>
                <p className={`text-xl font-bold ${rateColor(sc.firstPassApprovalRate, "high")}`}>
                  {pct(sc.firstPassApprovalRate)}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Avg Revisions</p>
                <p className="text-xl font-bold text-gray-800">
                  {sc.averageRevisionCount.toFixed(1)}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Median Turnaround</p>
                <p className="text-xl font-bold text-gray-800">
                  {sc.medianTurnaroundHours.toFixed(1)}h
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Overdue Review Rate</p>
                <p className={`text-xl font-bold ${rateColor(sc.overdueReviewRate)}`}>
                  {pct(sc.overdueReviewRate)}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Billing Impact Rate</p>
                <p className={`text-xl font-bold ${rateColor(sc.billingImpactRate)}`}>
                  {pct(sc.billingImpactRate)}
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500">Compliance Impact Rate</p>
                <p className={`text-xl font-bold ${rateColor(sc.complianceImpactRate)}`}>
                  {pct(sc.complianceImpactRate)}
                </p>
              </div>
            </div>

            {/* Deficiency breakdown */}
            {sc.commonDeficiencyTypes.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  Top Deficiency Types
                </h3>
                <div className="space-y-1">
                  {sc.commonDeficiencyTypes.map((d) => (
                    <div key={d.type} className="flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div
                          className="bg-blue-500 h-2 rounded-full"
                          style={{
                            width: `${Math.min(100, (d.count / (sc.commonDeficiencyTypes[0]?.count ?? 1)) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs text-gray-600 w-32 truncate">{d.type}</span>
                      <span className="text-xs font-medium text-gray-800">{d.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 12-week trend */}
            {sc.revisionTrend.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-2">
                  12-Week Revision Trend
                </h3>
                <Sparkline data={sc.revisionTrend} />
                <div className="mt-1 flex gap-1 overflow-x-auto">
                  {sc.revisionTrend.slice(-6).map((pt) => (
                    <div key={pt.week} className="text-center min-w-[40px]">
                      <div className="text-xs font-medium text-gray-800">{pt.count}</div>
                      <div className="text-xs text-gray-400">{pt.week.slice(-3)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

function ScorecardsPage() {
  const [discipline, setDiscipline] = useState<QAPIDiscipline | "">("");
  const [sortKey, setSortKey] = useState<keyof ClinicianQualityScorecard>("firstPassApprovalRate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [detailId, setDetailId] = useState<string | null>(null);

  const scorecardsQ = useQuery({
    queryKey: ["scorecards", discipline],
    queryFn: () =>
      listScorecardsFn({
        data: discipline ? { discipline: discipline as QAPIDiscipline } : {},
      }),
  });

  const sorted = [...(scorecardsQ.data?.data ?? [])].sort((a, b) => {
    const av = a[sortKey] as number;
    const bv = b[sortKey] as number;
    return sortDir === "desc" ? bv - av : av - bv;
  });

  function toggleSort(key: keyof ClinicianQualityScorecard) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const cols: { key: keyof ClinicianQualityScorecard; label: string }[] = [
    { key: "firstPassApprovalRate", label: "First Pass" },
    { key: "averageRevisionCount", label: "Avg Revisions" },
    { key: "overdueReviewRate", label: "Overdue Rate" },
    { key: "billingImpactRate", label: "Billing Impact" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Clinician Quality Scorecards</h1>
        <p className="text-sm text-gray-500">
          {scorecardsQ.data?.period?.from} — {scorecardsQ.data?.period?.to}
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        {(["", "RN", "SW", "CHAPLAIN", "THERAPY", "AIDE"] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDiscipline(d)}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
              discipline === d
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
            }`}
          >
            {d || "All"}
          </button>
        ))}
      </div>

      {/* Table */}
      {scorecardsQ.isLoading ? (
        <p className="text-sm text-gray-400">Loading scorecards…</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-gray-400">No clinicians with completed reviews in this period.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-gray-500">
                <th className="py-2 pr-4 font-medium">Clinician</th>
                <th className="py-2 pr-4 font-medium">Discipline</th>
                <th className="py-2 pr-4 font-medium">Notes</th>
                {cols.map((col) => (
                  <th
                    key={col.key}
                    className="py-2 pr-4 font-medium cursor-pointer select-none hover:text-blue-600"
                    onClick={() => toggleSort(col.key)}
                    onKeyDown={(e) => e.key === "Enter" && toggleSort(col.key)}
                    tabIndex={0}
                    role="columnheader"
                    aria-sort={sortKey === col.key ? (sortDir === "desc" ? "descending" : "ascending") : "none"}
                  >
                    {col.label}
                    {sortKey === col.key ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
                  </th>
                ))}
                <th className="py-2 font-medium">Trend</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((sc) => {
                const isOutlier =
                  sc.firstPassApprovalRate < 0.6 || sc.billingImpactRate > 0.3;
                return (
                  <tr
                    key={sc.clinicianId}
                    className={`border-b hover:bg-gray-50 cursor-pointer ${isOutlier ? "bg-red-50" : ""}`}
                    onClick={() => setDetailId(sc.clinicianId)}
                    onKeyDown={(e) => e.key === "Enter" && setDetailId(sc.clinicianId)}
                    tabIndex={0}
                  >
                    <td className="py-2 pr-4 font-medium text-gray-900">
                      {sc.clinicianName}
                      {isOutlier && (
                        <span className="ml-2 text-xs text-red-500">⚠</span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-gray-500">{sc.discipline}</td>
                    <td className="py-2 pr-4 text-gray-700">{sc.totalNotes}</td>
                    <td className={`py-2 pr-4 ${rateColor(sc.firstPassApprovalRate, "high")}`}>
                      {pct(sc.firstPassApprovalRate)}
                    </td>
                    <td className="py-2 pr-4 text-gray-700">
                      {sc.averageRevisionCount.toFixed(1)}
                    </td>
                    <td className={`py-2 pr-4 ${rateColor(sc.overdueReviewRate)}`}>
                      {pct(sc.overdueReviewRate)}
                    </td>
                    <td className={`py-2 pr-4 ${rateColor(sc.billingImpactRate)}`}>
                      {pct(sc.billingImpactRate)}
                    </td>
                    <td className="py-2">
                      <Sparkline data={sc.revisionTrend} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detailId && (
        <ScorecardDetailDrawer
          clinicianId={detailId}
          query={{}}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  );
}
