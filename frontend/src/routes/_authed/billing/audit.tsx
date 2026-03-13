// routes/_authed/billing/audit.tsx
// Billing Audit Dashboard — T3-12
// 7 dashboard sections: claim status summary, aging by rule group, aging by hold reason,
// aging by branch, owner lane queue, top denial drivers (T3-7b stub), warn override volume.

import { getAuditDashboardFn } from "@/functions/claimAudit.functions.js";
import type {
  AgingBucket,
  AgingByBranchItem,
  AgingByHoldReasonItem,
  AgingByRuleGroupItem,
  AuditDashboardResponse,
  OwnerLaneQueueItem,
  WarnOverrideDayBucket,
} from "@hospici/shared-types";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/billing/audit")({
  component: BillingAuditDashboard,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function agingTotal(a: AgingBucket): number {
  return a.d0_2 + a.d3_7 + a.d8_14 + a.d14plus;
}

function agingBar(bucket: AgingBucket) {
  const total = agingTotal(bucket);
  if (total === 0)
    return (
      <span className="text-sm text-gray-400">—</span>
    );
  return (
    <div className="flex gap-1 items-center text-xs">
      <span className="bg-green-200 text-green-800 px-1 rounded" title="0-2 days">
        {bucket.d0_2}
      </span>
      <span className="bg-yellow-200 text-yellow-800 px-1 rounded" title="3-7 days">
        {bucket.d3_7}
      </span>
      <span className="bg-orange-200 text-orange-800 px-1 rounded" title="8-14 days">
        {bucket.d8_14}
      </span>
      <span className="bg-red-200 text-red-800 px-1 rounded" title="14+ days">
        {bucket.d14plus}
      </span>
      <span className="text-gray-500 ml-1">{total} total</span>
    </div>
  );
}

function ownerBadge(role: string): string {
  const map: Record<string, string> = {
    billing: "bg-blue-100 text-blue-800",
    supervisor: "bg-purple-100 text-purple-800",
    clinician: "bg-green-100 text-green-800",
    physician: "bg-teal-100 text-teal-800",
    admin: "bg-gray-100 text-gray-800",
  };
  return map[role] ?? "bg-gray-100 text-gray-800";
}

// ── Section 1: Claim Status Summary ──────────────────────────────────────────

function ClaimStatusSummary({ data }: { data: AuditDashboardResponse["claimStatusSummary"] }) {
  const tiles = [
    { label: "Ready to Bill", value: data.readyToBill, color: "bg-green-50 border-green-200 text-green-700" },
    { label: "Audit Failed", value: data.auditFailed, color: "bg-red-50 border-red-200 text-red-700" },
    { label: "On Hold", value: data.onHold, color: "bg-amber-50 border-amber-200 text-amber-700" },
    { label: "Draft", value: data.draft, color: "bg-gray-50 border-gray-200 text-gray-700" },
    { label: "Queued", value: data.queued, color: "bg-blue-50 border-blue-200 text-blue-700" },
    { label: "Submitted", value: data.submitted, color: "bg-indigo-50 border-indigo-200 text-indigo-700" },
  ];
  return (
    <section>
      <h2 className="text-base font-semibold text-gray-900 mb-3">Claim Status Summary</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {tiles.map((t) => (
          <div key={t.label} className={`border rounded-lg p-3 text-center ${t.color}`}>
            <div className="text-2xl font-bold">{t.value}</div>
            <div className="text-xs mt-1">{t.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Section 2: Aging by Rule Group ────────────────────────────────────────────

function AgingByRuleGroup({ data }: { data: AgingByRuleGroupItem[] }) {
  if (data.length === 0)
    return (
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Aging by Rule Group</h2>
        <p className="text-sm text-gray-500">No audit failures on record.</p>
      </section>
    );
  return (
    <section>
      <h2 className="text-base font-semibold text-gray-900 mb-3">Aging by Rule Group</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b">
              <th className="py-2 pr-4">Rule Group</th>
              <th className="py-2 pr-4">Claims</th>
              <th className="py-2">Aging (0-2d / 3-7d / 8-14d / 14+d)</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.ruleGroup} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-4 font-mono text-xs">{row.ruleGroup}</td>
                <td className="py-2 pr-4">{row.claimCount}</td>
                <td className="py-2">{agingBar(row.aging)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Section 3: Aging by Hold Reason ───────────────────────────────────────────

function AgingByHoldReason({ data }: { data: AgingByHoldReasonItem[] }) {
  if (data.length === 0)
    return (
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Aging by Hold Reason</h2>
        <p className="text-sm text-gray-500">No active holds.</p>
      </section>
    );
  return (
    <section>
      <h2 className="text-base font-semibold text-gray-900 mb-3">Aging by Hold Reason</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b">
              <th className="py-2 pr-4">Hold Reason</th>
              <th className="py-2 pr-4">Claims</th>
              <th className="py-2">Aging</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.reason} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-4 text-xs">{row.reason.replace(/_/g, " ")}</td>
                <td className="py-2 pr-4">{row.claimCount}</td>
                <td className="py-2">{agingBar(row.aging)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Section 4: Aging by Branch ────────────────────────────────────────────────

function AgingByBranch({ data }: { data: AgingByBranchItem[] }) {
  if (data.length === 0)
    return (
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Aging by Branch</h2>
        <p className="text-sm text-gray-500">No claims found.</p>
      </section>
    );
  return (
    <section>
      <h2 className="text-base font-semibold text-gray-900 mb-3">Aging by Branch</h2>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b">
              <th className="py-2 pr-4">Branch</th>
              <th className="py-2 pr-4">Claims</th>
              <th className="py-2">Aging</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.locationId} className="border-b hover:bg-gray-50">
                <td className="py-2 pr-4 font-mono text-xs">{row.locationId}</td>
                <td className="py-2 pr-4">{row.claimCount}</td>
                <td className="py-2">{agingBar(row.aging)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── Section 5: Owner Lane Queue ────────────────────────────────────────────────

function OwnerLaneQueue({ data }: { data: OwnerLaneQueueItem[] }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-gray-900 mb-3">Owner Lane Queue</h2>
      {data.length === 0 ? (
        <p className="text-sm text-gray-500">No pending items.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {data.map((item) => (
            <div key={item.ownerRole} className="border rounded-lg p-3">
              <div className={`inline-block text-xs px-2 py-0.5 rounded mb-2 ${ownerBadge(item.ownerRole)}`}>
                {item.ownerRole}
              </div>
              <div className="text-2xl font-bold text-gray-900">{item.claimCount}</div>
              <div className="text-xs text-gray-500 mt-1">
                {item.oldestAuditedAt
                  ? `Oldest: ${new Date(item.oldestAuditedAt).toLocaleDateString()}`
                  : "No items"}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Section 6: Top Denial Drivers (T3-7b stub) ────────────────────────────────

function TopDenialDrivers({ data }: { data: AuditDashboardResponse["topDenialDrivers"] }) {
  return (
    <section>
      <h2 className="text-base font-semibold text-gray-900 mb-3">Top Denial Drivers</h2>
      <div className="border border-dashed border-gray-200 rounded-lg p-4 text-center text-sm text-gray-400">
        Available after{" "}
        <span className="font-mono">{data.availableAfter}</span> — ERA 835 remittance data
        required.
      </div>
    </section>
  );
}

// ── Section 7: Warn Override Volume (30-day trend) ────────────────────────────

function WarnOverrideVolume({ data }: { data: WarnOverrideDayBucket[] }) {
  if (data.length === 0)
    return (
      <section>
        <h2 className="text-base font-semibold text-gray-900 mb-3">Warn Override Volume (30 days)</h2>
        <p className="text-sm text-gray-500">No overrides recorded.</p>
      </section>
    );

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <section>
      <h2 className="text-base font-semibold text-gray-900 mb-3">Warn Override Volume (30 days)</h2>
      <div className="flex items-end gap-1 h-24 overflow-x-auto pb-2">
        {data.map((day) => (
          <div key={day.date} className="flex flex-col items-center flex-shrink-0">
            <div
              className="w-4 bg-amber-400 rounded-t"
              style={{ height: `${(day.count / maxCount) * 80}px` }}
              title={`${day.date}: ${day.count} override${day.count !== 1 ? "s" : ""}`}
            />
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-1">
        {data.reduce((s, d) => s + d.count, 0)} total overrides in the last 30 days
      </p>
    </section>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────────────────

function BillingAuditDashboard() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["billing", "audit-dashboard"],
    queryFn: () => getAuditDashboardFn(),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-500 text-sm">
        Loading billing audit dashboard…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-red-600 text-sm gap-2">
        <p>Failed to load audit dashboard.</p>
        <button
          type="button"
          onClick={() => void refetch()}
          className="text-blue-600 underline text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Billing Audit Dashboard</h1>
        <button
          type="button"
          onClick={() => void refetch()}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          Refresh
        </button>
      </div>

      <ClaimStatusSummary data={data.claimStatusSummary} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <AgingByRuleGroup data={data.agingByRuleGroup} />
        <AgingByHoldReason data={data.agingByHoldReason} />
      </div>

      <AgingByBranch data={data.agingByBranch} />

      <OwnerLaneQueue data={data.ownerLaneQueue} />

      <TopDenialDrivers data={data.topDenialDrivers} />

      <WarnOverrideVolume data={data.warnOverrideVolume} />

      {/* Aging legend */}
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span className="font-medium">Aging legend:</span>
        <span className="bg-green-200 text-green-800 px-2 py-0.5 rounded">0-2d</span>
        <span className="bg-yellow-200 text-yellow-800 px-2 py-0.5 rounded">3-7d</span>
        <span className="bg-orange-200 text-orange-800 px-2 py-0.5 rounded">8-14d</span>
        <span className="bg-red-200 text-red-800 px-2 py-0.5 rounded">14+d</span>
      </div>
    </div>
  );
}
