// routes/_authed/analytics/deficiency-trends.tsx
// Deficiency Trend Reporting — T3-11
// Top deficiency types, weekly trend, branch + discipline comparison, reviewer workload

import { createQAPIEventFn, getDeficiencyTrendsFn } from "@/functions/qapi.functions.js";
import type { QAPIEventType, TrendQuery } from "@hospici/shared-types";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_authed/analytics/deficiency-trends")({
  component: DeficiencyTrendsPage,
});

// ── Mini bar chart ────────────────────────────────────────────────────────────

function HBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-40 truncate text-gray-600 text-xs">{label.replace(/_/g, " ")}</span>
      <div className="flex-1 bg-gray-100 rounded-full h-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right text-xs font-medium text-gray-700">{value}</span>
    </div>
  );
}

// ── Rate pill ─────────────────────────────────────────────────────────────────

function RatePill({ rate }: { rate: number }) {
  const color =
    rate >= 0.8 ? "bg-green-100 text-green-800" : rate >= 0.6 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800";
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${color}`}>
      {(rate * 100).toFixed(1)}%
    </span>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

function DeficiencyTrendsPage() {
  const [query, setQuery] = useState<TrendQuery>({});
  const [raisingFrom, setRaisingFrom] = useState<{
    locationId?: string;
    discipline?: string;
    metric: string;
  } | null>(null);
  const [raisingDesc, setRaisingDesc] = useState("");

  const trendsQ = useQuery({
    queryKey: ["deficiency-trends", query],
    queryFn: () => getDeficiencyTrendsFn({ data: query }),
  });

  const raiseMut = useMutation({
    mutationFn: (eventType: QAPIEventType) =>
      createQAPIEventFn({
        data: {
          eventType,
          occurredAt: new Date().toISOString(),
          description: raisingDesc,
          linkedTrendContext: raisingFrom,
        },
      }),
    onSuccess: () => setRaisingFrom(null),
  });

  const report = trendsQ.data;
  const maxDefCount = report ? Math.max(...report.topDeficiencyTypes.map((d) => d.count), 1) : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Deficiency Trend Reporting</h1>
        {report && (
          <p className="text-sm text-gray-500">
            {report.period.from} — {report.period.to}
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 bg-white border rounded-lg p-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Discipline</label>
          <select
            value={query.discipline ?? ""}
            onChange={(e) =>
              setQuery((q) => ({
                ...q,
                discipline: (e.target.value as TrendQuery["discipline"]) || undefined,
              }))
            }
            className="border rounded px-2 py-1 text-sm"
          >
            <option value="">All disciplines</option>
            {["RN", "SW", "CHAPLAIN", "THERAPY", "AIDE"].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input
            type="date"
            value={query.from ?? ""}
            onChange={(e) => setQuery((q) => ({ ...q, from: e.target.value || undefined }))}
            className="border rounded px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input
            type="date"
            value={query.to ?? ""}
            onChange={(e) => setQuery((q) => ({ ...q, to: e.target.value || undefined }))}
            className="border rounded px-2 py-1 text-sm"
          />
        </div>
      </div>

      {trendsQ.isLoading ? (
        <p className="text-sm text-gray-400">Loading trend data…</p>
      ) : !report ? (
        <p className="text-sm text-gray-400">No data available.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top deficiency types */}
          <div className="bg-white border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Top Deficiency Types</h2>
            {report.topDeficiencyTypes.length === 0 ? (
              <p className="text-xs text-gray-400">No deficiencies in period.</p>
            ) : (
              <div className="space-y-2">
                {report.topDeficiencyTypes.map((d) => (
                  <HBar key={d.type} label={d.type} value={d.count} max={maxDefCount} />
                ))}
              </div>
            )}
          </div>

          {/* Weekly trend table */}
          <div className="bg-white border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Weekly Trend</h2>
            {report.trend.length === 0 ? (
              <p className="text-xs text-gray-400">No weekly data.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="text-gray-500 border-b">
                      <th className="py-1 pr-2 text-left">Week</th>
                      <th className="py-1 pr-2 text-right">Deficiencies</th>
                      <th className="py-1 text-right">First-Pass</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.trend.slice(-12).map((pt) => (
                      <tr key={pt.week} className="border-b last:border-0">
                        <td className="py-1 pr-2 text-gray-600">{pt.week}</td>
                        <td className="py-1 pr-2 text-right text-gray-800">
                          {pt.totalDeficiencies}
                        </td>
                        <td className="py-1 text-right">
                          <RatePill rate={pt.firstPassRate} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Branch comparison */}
          <div className="bg-white border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Branch Comparison</h2>
            {report.branchComparison.length === 0 ? (
              <p className="text-xs text-gray-400">No branch data.</p>
            ) : (
              <table className="text-xs w-full">
                <thead>
                  <tr className="text-gray-500 border-b">
                    <th className="py-1 pr-2 text-left">Branch</th>
                    <th className="py-1 pr-2 text-right">First Pass</th>
                    <th className="py-1 pr-2 text-right">Deficiencies</th>
                    <th className="py-1 text-right" />
                  </tr>
                </thead>
                <tbody>
                  {report.branchComparison.map((b) => (
                    <tr key={b.locationId} className="border-b last:border-0">
                      <td className="py-1 pr-2 text-gray-700">{b.locationName}</td>
                      <td className="py-1 pr-2 text-right">
                        <RatePill rate={b.firstPassRate} />
                      </td>
                      <td className="py-1 pr-2 text-right text-gray-700">
                        {b.totalDeficiencies}
                      </td>
                      <td className="py-1 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setRaisingFrom({ locationId: b.locationId, metric: "branchFirstPass" });
                            setRaisingDesc(
                              `Branch "${b.locationName}" first-pass rate is ${(b.firstPassRate * 100).toFixed(1)}% — quality trend event`,
                            );
                          }}
                          className="text-xs text-blue-600 underline hover:text-blue-800"
                        >
                          Raise QAPI
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Discipline comparison */}
          <div className="bg-white border rounded-lg p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Discipline Comparison</h2>
            {report.disciplineComparison.length === 0 ? (
              <p className="text-xs text-gray-400">No discipline data.</p>
            ) : (
              <table className="text-xs w-full">
                <thead>
                  <tr className="text-gray-500 border-b">
                    <th className="py-1 pr-2 text-left">Discipline</th>
                    <th className="py-1 pr-2 text-right">First Pass</th>
                    <th className="py-1 text-left">Top Deficiency</th>
                  </tr>
                </thead>
                <tbody>
                  {report.disciplineComparison.map((d) => (
                    <tr key={d.discipline} className="border-b last:border-0">
                      <td className="py-1 pr-2 text-gray-700">{d.discipline}</td>
                      <td className="py-1 pr-2 text-right">
                        <RatePill rate={d.firstPassRate} />
                      </td>
                      <td className="py-1 text-xs text-gray-500">
                        {d.topDeficiency.replace(/_/g, " ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Branch × discipline heatmap */}
          {report.branchDisciplineMatrix.length > 0 && (
            <div className="bg-white border rounded-lg p-4 col-span-full">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">
                Branch × Discipline Matrix
              </h2>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="text-gray-500 border-b">
                      <th className="py-1 pr-2 text-left">Branch</th>
                      <th className="py-1 pr-2 text-left">Discipline</th>
                      <th className="py-1 pr-2 text-right">First Pass</th>
                      <th className="py-1 text-right">Deficiencies</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.branchDisciplineMatrix.map((m) => (
                      <tr
                        key={`${m.locationId}::${m.discipline}`}
                        className="border-b last:border-0"
                      >
                        <td className="py-1 pr-2 text-gray-600">{m.locationId.slice(0, 8)}…</td>
                        <td className="py-1 pr-2 text-gray-700">{m.discipline}</td>
                        <td className="py-1 pr-2 text-right">
                          <RatePill rate={m.firstPassRate} />
                        </td>
                        <td className="py-1 text-right text-gray-700">{m.deficiencyCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Reviewer workload */}
          {report.reviewerWorkload.length > 0 && (
            <div className="bg-white border rounded-lg p-4 col-span-full">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Reviewer Workload</h2>
              <table className="text-xs w-full">
                <thead>
                  <tr className="text-gray-500 border-b">
                    <th className="py-1 pr-2 text-left">Reviewer</th>
                    <th className="py-1 pr-2 text-right">Assigned</th>
                    <th className="py-1 pr-2 text-right">Resolved</th>
                    <th className="py-1 text-right">Overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {report.reviewerWorkload.map((rv) => (
                    <tr key={rv.reviewerId} className="border-b last:border-0">
                      <td className="py-1 pr-2 text-gray-700">{rv.reviewerName}</td>
                      <td className="py-1 pr-2 text-right text-gray-700">{rv.assigned}</td>
                      <td className="py-1 pr-2 text-right text-gray-700">{rv.resolved}</td>
                      <td
                        className={`py-1 text-right font-medium ${rv.overdueCount > 0 ? "text-red-600" : "text-gray-700"}`}
                      >
                        {rv.overdueCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Raise QAPI event from trend modal */}
      {raisingFrom && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <h2 className="text-lg font-semibold">Raise QAPI Event from Trend</h2>
            <p className="text-sm text-gray-600">{raisingDesc}</p>
            <textarea
              value={raisingDesc}
              onChange={(e) => setRaisingDesc(e.target.value)}
              rows={3}
              className="w-full border rounded px-3 py-2 text-sm"
            />
            {raiseMut.error && (
              <p className="text-sm text-red-600">{String(raiseMut.error)}</p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setRaisingFrom(null)}
                className="px-4 py-2 text-sm border rounded text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => raiseMut.mutate("QUALITY_TREND")}
                disabled={!raisingDesc || raiseMut.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {raiseMut.isPending ? "Creating…" : "Create Event"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
