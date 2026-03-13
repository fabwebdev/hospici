// routes/_authed/cap/index.tsx
// Cap Intelligence Dashboard — T3-3

import {
  getCapPatientsFn,
  getCapSnapshotFn,
  getCapSummaryFn,
  getCapTrendsFn,
  recalculateCapFn,
} from "@/functions/cap.functions.js";
import type {
  CapPatientListResponse,
  CapSnapshotResponse,
  CapSummaryResponse,
  CapTrendResponse,
} from "@hospici/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authed/cap/")({
  component: CapDashboard,
});

// ── Utilization gauge color ───────────────────────────────────────────────────

function utilizationColor(pct: number): string {
  if (pct >= 90) return "text-red-600";
  if (pct >= 70) return "text-amber-600";
  return "text-green-600";
}

function utilizationBg(pct: number): string {
  if (pct >= 90) return "bg-red-100 border-red-200";
  if (pct >= 70) return "bg-amber-50 border-amber-200";
  return "bg-green-50 border-green-200";
}

// ── Gauge component ───────────────────────────────────────────────────────────

function UtilizationGauge({ percent }: { percent: number }) {
  const clamped = Math.min(Math.max(percent, 0), 100);
  const color = percent >= 90 ? "#dc2626" : percent >= 70 ? "#d97706" : "#16a34a";
  const circumference = 2 * Math.PI * 40;
  const dashOffset = circumference * (1 - clamped / 100);

  return (
    <div className="flex flex-col items-center">
      <svg
        width="100"
        height="100"
        viewBox="0 0 100 100"
        aria-label={`${clamped.toFixed(1)}% utilized`}
      >
        <title>{`Hospice cap utilization: ${clamped.toFixed(1)}%`}</title>
        <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          transform="rotate(-90 50 50)"
        />
        <text x="50" y="54" textAnchor="middle" fontSize="14" fontWeight="bold" fill={color}>
          {clamped.toFixed(1)}%
        </text>
      </svg>
      <span className="text-xs text-gray-500 mt-1">Utilization</span>
    </div>
  );
}

// ── Summary widgets ───────────────────────────────────────────────────────────

function SummaryWidgets({ summary }: { summary: CapSummaryResponse }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      <div className={`border rounded-lg p-4 ${utilizationBg(summary.utilizationPercent)}`}>
        <div className="text-sm text-gray-500 mb-1">Current Utilization</div>
        <div className={`text-2xl font-bold ${utilizationColor(summary.utilizationPercent)}`}>
          {summary.utilizationPercent.toFixed(1)}%
        </div>
      </div>
      <div className={`border rounded-lg p-4 ${utilizationBg(summary.projectedYearEndPercent)}`}>
        <div className="text-sm text-gray-500 mb-1">Projected Year-End</div>
        <div className={`text-2xl font-bold ${utilizationColor(summary.projectedYearEndPercent)}`}>
          {summary.projectedYearEndPercent.toFixed(1)}%
        </div>
      </div>
      <div className="border rounded-lg p-4 bg-white">
        <div className="text-sm text-gray-500 mb-1">Est. Liability</div>
        <div className="text-2xl font-bold text-gray-900">
          ${summary.estimatedLiability.toLocaleString("en-US", { maximumFractionDigits: 0 })}
        </div>
      </div>
      <div className="border rounded-lg p-4 bg-white">
        <div className="text-sm text-gray-500 mb-1">Days Remaining</div>
        <div className="text-2xl font-bold text-gray-900">{summary.daysRemainingInYear}</div>
      </div>
    </div>
  );
}

// ── Trend arrow ───────────────────────────────────────────────────────────────

function TrendArrow({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up") return <span className="text-red-500 font-bold">↑</span>;
  if (trend === "down") return <span className="text-green-500 font-bold">↓</span>;
  return <span className="text-gray-400">→</span>;
}

// ── Tab panels ────────────────────────────────────────────────────────────────

const TABS = [
  "Current Utilization",
  "Projected Year-End",
  "Top 25 Contributors",
  "Trend by Month",
  "By Branch",
  "High-Risk Patients",
  "Recalculation History",
] as const;

type TabName = (typeof TABS)[number];

// ── Panel: Current Utilization ────────────────────────────────────────────────

function CurrentUtilizationPanel({ summary }: { summary: CapSummaryResponse }) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-6">
        <UtilizationGauge percent={summary.utilizationPercent} />
        <div className="flex-1 space-y-2">
          <div className="text-sm text-gray-500">
            Cap Year: {summary.capYearStart} – {summary.capYearEnd}
          </div>
          <div className="text-sm text-gray-500">
            Patients in cap year: <span className="font-medium">{summary.patientCount}</span>
          </div>
          {summary.priorYearUtilizationPercent !== null && (
            <div className="text-sm text-gray-500">
              Prior year:{" "}
              <span className="font-medium">{summary.priorYearUtilizationPercent.toFixed(1)}%</span>
            </div>
          )}
          {summary.lastCalculatedAt && (
            <div className="text-xs text-gray-400">
              Last calculated: {new Date(summary.lastCalculatedAt).toLocaleString()}
            </div>
          )}
        </div>
      </div>
      {summary.thresholdAlerts.length > 0 && (
        <div>
          <h3 className="font-medium text-gray-700 mb-2">Threshold Alert History</h3>
          <div className="space-y-2">
            {summary.thresholdAlerts.map((a) => (
              <div
                key={`${a.type}-${a.firedAt}`}
                className={`flex justify-between text-sm p-2 rounded ${
                  a.type === "CAP_PROJECTED_OVERAGE" || a.type === "CAP_THRESHOLD_90"
                    ? "bg-red-50 text-red-700"
                    : "bg-amber-50 text-amber-700"
                }`}
              >
                <span>{a.type.replace("CAP_", "").replace(/_/g, " ")}</span>
                <span>{new Date(a.firedAt).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Panel: Projected Year-End ─────────────────────────────────────────────────

function ProjectedYearEndPanel({
  summary,
  trends,
}: {
  summary: CapSummaryResponse;
  trends: CapTrendResponse | undefined;
}) {
  const months = trends?.months ?? [];
  const maxPct = Math.max(...months.map((m) => m.projectedYearEndPercent), 100);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <div className={`text-3xl font-bold ${utilizationColor(summary.projectedYearEndPercent)}`}>
          {summary.projectedYearEndPercent.toFixed(1)}%
        </div>
        <div className="text-sm text-gray-500">projected year-end utilization</div>
      </div>
      {summary.projectedYearEndPercent >= 100 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
          Cap overage projected. CMS repayment obligation may apply (42 CFR §418.309). Consult
          billing specialist immediately.
        </div>
      )}
      {months.length > 0 && (
        <div>
          <h3 className="font-medium text-gray-700 mb-3">Monthly Trend</h3>
          <div className="space-y-1">
            {months.map((m) => (
              <div key={m.month} className="flex items-center gap-2 text-sm">
                <span className="w-16 text-gray-500">{m.month}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      m.utilizationPercent >= 90
                        ? "bg-red-500"
                        : m.utilizationPercent >= 70
                          ? "bg-amber-400"
                          : "bg-green-500"
                    }`}
                    style={{ width: `${Math.min((m.utilizationPercent / maxPct) * 100, 100)}%` }}
                  />
                </div>
                <span
                  className={`w-12 text-right font-medium ${utilizationColor(m.utilizationPercent)}`}
                >
                  {m.utilizationPercent.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── CTA action labels ─────────────────────────────────────────────────────────

function getCtaLabel(losDays: number, contributionPercent: number): string {
  if (losDays > 365) return "Review discharge planning";
  if (losDays > 180) return "Review level of care";
  if (contributionPercent > 5) return "Review documentation strength";
  return "Review eligibility";
}

// ── Panel: Top 25 Contributors ────────────────────────────────────────────────

function Top25ContributorsPanel({ patients }: { patients: CapPatientListResponse | undefined }) {
  const items = patients?.data ?? [];
  return (
    <div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-gray-500 text-left">
            <th className="pb-2 font-medium">Patient</th>
            <th className="pb-2 font-medium">Admission</th>
            <th className="pb-2 font-medium">LOS (days)</th>
            <th className="pb-2 font-medium">Care Model</th>
            <th className="pb-2 font-medium text-right">Contribution</th>
            <th className="pb-2 font-medium text-right">% of Total</th>
            <th className="pb-2 font-medium">Action</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.patientId} className="border-b hover:bg-gray-50">
              <td className="py-2">
                <Link
                  to="/patients/$patientId"
                  params={{ patientId: p.patientId }}
                  className="text-blue-600 hover:underline"
                >
                  {p.patientName}
                </Link>
              </td>
              <td className="py-2 text-gray-600">{p.admissionDate}</td>
              <td className="py-2">{p.losDays}</td>
              <td className="py-2 text-gray-600">{p.careModel}</td>
              <td className="py-2 text-right font-medium">
                ${p.capContributionAmount.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </td>
              <td className="py-2 text-right text-gray-600">{p.contributionPercent.toFixed(1)}%</td>
              <td className="py-2">
                <Link
                  to="/patients/$patientId"
                  params={{ patientId: p.patientId }}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {getCtaLabel(p.losDays, p.contributionPercent)}
                </Link>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={7} className="py-8 text-center text-gray-400">
                No data. Run a cap recalculation to populate contributors.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ── Panel: Trend by Month ─────────────────────────────────────────────────────

function TrendByMonthPanel({ trends }: { trends: CapTrendResponse | undefined }) {
  const months = trends?.months ?? [];
  if (months.length === 0) {
    return (
      <div className="text-center text-gray-400 py-8">
        No trend data. Run a cap recalculation to see monthly trends.
      </div>
    );
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-gray-500 text-left">
          <th className="pb-2 font-medium">Month</th>
          <th className="pb-2 font-medium text-right">Utilization %</th>
          <th className="pb-2 font-medium text-right">Projected Year-End %</th>
          <th className="pb-2 font-medium text-right">Patients</th>
        </tr>
      </thead>
      <tbody>
        {months.map((m) => (
          <tr key={m.month} className="border-b hover:bg-gray-50">
            <td className="py-2">{m.month}</td>
            <td className={`py-2 text-right font-medium ${utilizationColor(m.utilizationPercent)}`}>
              {m.utilizationPercent.toFixed(1)}%
            </td>
            <td className={`py-2 text-right ${utilizationColor(m.projectedYearEndPercent)}`}>
              {m.projectedYearEndPercent.toFixed(1)}%
            </td>
            <td className="py-2 text-right text-gray-600">{m.patientCount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Panel: By Branch ──────────────────────────────────────────────────────────

function ByBranchPanel({ trends }: { trends: CapTrendResponse | undefined }) {
  const branches = trends?.branchComparison ?? [];
  if (branches.length === 0) {
    return <div className="text-center text-gray-400 py-8">No branch data available.</div>;
  }
  const sorted = [...branches].sort((a, b) => b.utilizationPercent - a.utilizationPercent);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-gray-500 text-left">
          <th className="pb-2 font-medium">Location</th>
          <th className="pb-2 font-medium text-right">Utilization %</th>
          <th className="pb-2 font-medium text-right">Projected %</th>
          <th className="pb-2 font-medium text-center">Trend</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((b) => (
          <tr key={b.locationId} className="border-b hover:bg-gray-50">
            <td className="py-2 font-medium">{b.locationName}</td>
            <td className={`py-2 text-right font-medium ${utilizationColor(b.utilizationPercent)}`}>
              {b.utilizationPercent.toFixed(1)}%
            </td>
            <td className={`py-2 text-right ${utilizationColor(b.projectedYearEndPercent)}`}>
              {b.projectedYearEndPercent.toFixed(1)}%
            </td>
            <td className="py-2 text-center">
              <TrendArrow trend={b.trend} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Panel: High-Risk Patients ─────────────────────────────────────────────────

function HighRiskPatientsPanel({
  patients,
}: {
  patients: CapPatientListResponse | undefined;
}) {
  const allItems = patients?.data ?? [];
  const totalAmount = allItems.reduce((s, p) => s + p.capContributionAmount, 0);
  const top10Count = Math.max(1, Math.ceil(allItems.length * 0.1));
  const sorted = [...allItems].sort((a, b) => b.capContributionAmount - a.capContributionAmount);
  const top10Threshold = sorted[top10Count - 1]?.capContributionAmount ?? 0;

  const highRisk = allItems.filter(
    (p) => p.losDays > 180 || p.capContributionAmount >= top10Threshold,
  );

  if (highRisk.length === 0) {
    return (
      <div className="text-center text-gray-400 py-8">
        No high-risk patients identified in this snapshot.
      </div>
    );
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-3">
        Patients with LOS &gt; 180 days or contribution in top 10% ({highRisk.length} patients)
      </p>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-gray-500 text-left">
            <th className="pb-2 font-medium">Patient</th>
            <th className="pb-2 font-medium text-right">LOS</th>
            <th className="pb-2 font-medium text-right">Contribution</th>
            <th className="pb-2 font-medium text-right">% of Total</th>
            <th className="pb-2 font-medium">Risk Factor</th>
          </tr>
        </thead>
        <tbody>
          {highRisk.map((p) => (
            <tr key={p.patientId} className="border-b hover:bg-gray-50">
              <td className="py-2">
                <Link
                  to="/patients/$patientId"
                  params={{ patientId: p.patientId }}
                  className="text-blue-600 hover:underline"
                >
                  {p.patientName}
                </Link>
              </td>
              <td className="py-2 text-right">{p.losDays}</td>
              <td className="py-2 text-right font-medium">
                $
                {p.capContributionAmount.toLocaleString("en-US", {
                  maximumFractionDigits: 0,
                })}
              </td>
              <td className="py-2 text-right text-gray-600">
                {totalAmount > 0
                  ? ((p.capContributionAmount / totalAmount) * 100).toFixed(1)
                  : "0.0"}
                %
              </td>
              <td className="py-2 text-xs text-amber-700">
                {p.losDays > 180 ? "Extended LOS" : "Top 10% contributor"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Panel: Recalculation History ──────────────────────────────────────────────

function RecalculationHistoryPanel({
  trends,
  onCompare,
}: {
  trends: CapTrendResponse | undefined;
  onCompare: (snapshotId: string) => void;
}) {
  const months = trends?.months ?? [];

  if (months.length === 0) {
    return <div className="text-center text-gray-400 py-8">No recalculation history.</div>;
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-gray-500 text-left">
          <th className="pb-2 font-medium">Month</th>
          <th className="pb-2 font-medium text-right">Utilization %</th>
          <th className="pb-2 font-medium text-right">Projected %</th>
          <th className="pb-2 font-medium text-right">Patients</th>
          <th className="pb-2 font-medium" />
        </tr>
      </thead>
      <tbody>
        {[...months].reverse().map((m) => (
          <tr key={m.snapshotId} className="border-b hover:bg-gray-50">
            <td className="py-2">{m.month}</td>
            <td className={`py-2 text-right font-medium ${utilizationColor(m.utilizationPercent)}`}>
              {m.utilizationPercent.toFixed(1)}%
            </td>
            <td className={`py-2 text-right ${utilizationColor(m.projectedYearEndPercent)}`}>
              {m.projectedYearEndPercent.toFixed(1)}%
            </td>
            <td className="py-2 text-right text-gray-600">{m.patientCount}</td>
            <td className="py-2 text-right">
              <button
                type="button"
                onClick={() => onCompare(m.snapshotId)}
                className="text-xs text-blue-600 hover:underline"
              >
                Compare
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Snapshot compare drawer ───────────────────────────────────────────────────

function SnapshotCompareDrawer({
  snapshotId,
  onClose,
}: {
  snapshotId: string;
  onClose: () => void;
}) {
  const { data: snapshot } = useQuery<CapSnapshotResponse>({
    queryKey: ["cap", "snapshot", snapshotId],
    queryFn: () => getCapSnapshotFn({ data: { snapshotId } }),
  });

  return (
    <div className="fixed inset-y-0 right-0 w-[500px] bg-white border-l border-gray-200 shadow-xl z-40 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="font-semibold text-gray-900">Snapshot Detail</h2>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl"
        >
          ×
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {!snapshot ? (
          <div className="text-center text-gray-400 py-8">Loading...</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="bg-gray-50 rounded p-3">
                <div className="text-gray-500">Utilization</div>
                <div
                  className={`text-xl font-bold ${utilizationColor(snapshot.utilizationPercent)}`}
                >
                  {snapshot.utilizationPercent.toFixed(1)}%
                </div>
              </div>
              <div className="bg-gray-50 rounded p-3">
                <div className="text-gray-500">Projected</div>
                <div
                  className={`text-xl font-bold ${utilizationColor(snapshot.projectedYearEndPercent)}`}
                >
                  {snapshot.projectedYearEndPercent.toFixed(1)}%
                </div>
              </div>
              <div className="bg-gray-50 rounded p-3">
                <div className="text-gray-500">Est. Liability</div>
                <div className="text-xl font-bold">
                  $
                  {snapshot.estimatedLiability.toLocaleString("en-US", {
                    maximumFractionDigits: 0,
                  })}
                </div>
              </div>
              <div className="bg-gray-50 rounded p-3">
                <div className="text-gray-500">Patients</div>
                <div className="text-xl font-bold">{snapshot.patientCount}</div>
              </div>
            </div>
            <div className="text-xs text-gray-400 space-y-1">
              <div>Formula: {snapshot.formulaVersion}</div>
              <div>Triggered by: {snapshot.triggeredBy}</div>
              <div>Calculated: {new Date(snapshot.calculatedAt).toLocaleString()}</div>
              <div className="font-mono text-[10px] break-all">Hash: {snapshot.inputHash}</div>
            </div>
            <div>
              <h3 className="font-medium text-gray-700 mb-2">
                Contributors ({snapshot.contributions.length})
              </h3>
              <div className="space-y-1 text-sm">
                {snapshot.contributions.slice(0, 20).map((c) => (
                  <div key={c.patientId} className="flex justify-between">
                    <span className="text-gray-700 truncate">{c.patientName}</span>
                    <span className="font-medium ml-2">
                      $
                      {c.capContributionAmount.toLocaleString("en-US", {
                        maximumFractionDigits: 0,
                      })}
                    </span>
                  </div>
                ))}
                {snapshot.contributions.length > 20 && (
                  <div className="text-gray-400 text-xs">
                    + {snapshot.contributions.length - 20} more
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

function CapDashboard() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabName>("Current Utilization");
  const [compareSnapshotId, setCompareSnapshotId] = useState<string | null>(null);
  const [priorYear, setPriorYear] = useState(false);

  const currentCapYear =
    new Date().getMonth() >= 10 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const displayCapYear = priorYear ? currentCapYear - 1 : currentCapYear;

  const { data: summary, isLoading: summaryLoading } = useQuery<CapSummaryResponse>({
    queryKey: ["cap", "summary", displayCapYear],
    queryFn: () => getCapSummaryFn({ data: { capYear: displayCapYear } }),
  });

  const { data: patients } = useQuery<CapPatientListResponse>({
    queryKey: ["cap", "patients", displayCapYear],
    queryFn: () => getCapPatientsFn({ data: { capYear: displayCapYear, limit: 25 } }),
    enabled: activeTab === "Top 25 Contributors" || activeTab === "High-Risk Patients",
  });

  const { data: trends } = useQuery<CapTrendResponse>({
    queryKey: ["cap", "trends", displayCapYear],
    queryFn: () => getCapTrendsFn({ data: { capYear: displayCapYear } }),
    enabled:
      activeTab === "Projected Year-End" ||
      activeTab === "Trend by Month" ||
      activeTab === "By Branch" ||
      activeTab === "Recalculation History",
  });

  const recalculateMutation = useMutation({
    mutationFn: () => recalculateCapFn(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["cap"] });
    },
  });

  // Listen for Socket.IO cap:calculation:complete DOM events
  useEffect(() => {
    const handler = () => {
      void queryClient.invalidateQueries({ queryKey: ["cap"] });
    };
    window.addEventListener("cap:calculation:complete", handler);
    return () => window.removeEventListener("cap:calculation:complete", handler);
  }, [queryClient]);

  if (summaryLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">Loading cap data...</div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cap Intelligence</h1>
          <p className="text-sm text-gray-500 mt-1">
            Medicare Hospice Aggregate Cap — 42 CFR §418.309
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={priorYear}
              onChange={(e) => setPriorYear(e.target.checked)}
              className="rounded border-gray-300"
            />
            Prior year ({currentCapYear - 1})
          </label>
          <button
            type="button"
            onClick={() => recalculateMutation.mutate()}
            disabled={recalculateMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {recalculateMutation.isPending ? "Recalculating..." : "Recalculate"}
          </button>
        </div>
      </div>

      {/* Cap year badge */}
      <div className="inline-flex items-center gap-2 bg-gray-100 rounded-full px-3 py-1 text-sm text-gray-600 mb-4">
        Cap Year {displayCapYear}/{displayCapYear + 1}
        {summary && (
          <span>
            — {summary.capYearStart} to {summary.capYearEnd}
          </span>
        )}
      </div>

      {summary && <SummaryWidgets summary={summary} />}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-4">
        <div className="flex gap-1 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-2 text-sm font-medium whitespace-nowrap rounded-t-md transition-colors ${
                activeTab === tab
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="bg-white border rounded-lg p-4 min-h-[300px]">
        {activeTab === "Current Utilization" && summary && (
          <CurrentUtilizationPanel summary={summary} />
        )}
        {activeTab === "Projected Year-End" && summary && (
          <ProjectedYearEndPanel summary={summary} trends={trends} />
        )}
        {activeTab === "Top 25 Contributors" && <Top25ContributorsPanel patients={patients} />}
        {activeTab === "Trend by Month" && <TrendByMonthPanel trends={trends} />}
        {activeTab === "By Branch" && <ByBranchPanel trends={trends} />}
        {activeTab === "High-Risk Patients" && <HighRiskPatientsPanel patients={patients} />}
        {activeTab === "Recalculation History" && (
          <RecalculationHistoryPanel trends={trends} onCompare={(id) => setCompareSnapshotId(id)} />
        )}
      </div>

      {/* Snapshot compare drawer */}
      {compareSnapshotId && (
        <SnapshotCompareDrawer
          snapshotId={compareSnapshotId}
          onClose={() => setCompareSnapshotId(null)}
        />
      )}
    </div>
  );
}
