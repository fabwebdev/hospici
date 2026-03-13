// routes/_authed/benefit-periods/index.tsx
// Benefit Period Manager — T3-4

import {
  getBenefitPeriodsFn,
  recertifyFn,
  setReportingPeriodFn,
} from "@/functions/benefit-period.functions.js";
import type { BenefitPeriodDetail, BenefitPeriodListResponse, BenefitPeriodStatus } from "@hospici/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authed/benefit-periods/")({
  component: BenefitPeriodsPage,
});

// ── Status display helpers ────────────────────────────────────────────────────

function statusBadge(status: BenefitPeriodStatus): string {
  switch (status) {
    case "current":
      return "bg-green-100 text-green-800";
    case "upcoming":
      return "bg-blue-100 text-blue-800";
    case "recert_due":
      return "bg-amber-100 text-amber-800";
    case "at_risk":
      return "bg-orange-100 text-orange-800";
    case "past_due":
      return "bg-red-100 text-red-800";
    case "closed":
    case "revoked":
    case "discharged":
    case "transferred_out":
      return "bg-gray-100 text-gray-600";
    case "concurrent_care":
      return "bg-purple-100 text-purple-800";
    default:
      return "bg-gray-100 text-gray-600";
  }
}

function f2fBadge(f2fRequired: boolean, f2fStatus: string): string | null {
  if (!f2fRequired) return null;
  switch (f2fStatus) {
    case "documented":
      return "F2F OK";
    case "due_soon":
      return "F2F Due";
    case "missing":
    case "invalid":
    case "recert_blocked":
      return "F2F Missing";
    default:
      return null;
  }
}

function f2fBadgeColor(f2fStatus: string): string {
  switch (f2fStatus) {
    case "documented":
      return "bg-green-100 text-green-700";
    case "due_soon":
      return "bg-amber-100 text-amber-700";
    case "missing":
    case "invalid":
    case "recert_blocked":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-500";
  }
}

// ── Status summary widgets ────────────────────────────────────────────────────

function StatusSummary({ items }: { items: BenefitPeriodDetail[] }) {
  const counts: Partial<Record<BenefitPeriodStatus, number>> = {};
  for (const item of items) {
    counts[item.status] = (counts[item.status] ?? 0) + 1;
  }
  const billingRiskCount = items.filter((i) => i.billingRisk).length;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
      {(["current", "recert_due", "at_risk", "past_due"] as const).map((s) => (
        <div key={s} className={`border rounded-lg p-3 ${statusBadge(s)} border-opacity-30`}>
          <div className="text-xs font-medium uppercase tracking-wide">{s.replace(/_/g, " ")}</div>
          <div className="text-2xl font-bold mt-1">{counts[s] ?? 0}</div>
        </div>
      ))}
      <div className="border rounded-lg p-3 bg-red-50 border-red-200">
        <div className="text-xs font-medium uppercase tracking-wide text-red-700">Billing Risk</div>
        <div className="text-2xl font-bold mt-1 text-red-700">{billingRiskCount}</div>
      </div>
    </div>
  );
}

// ── Period table row ──────────────────────────────────────────────────────────

function PeriodRow({
  period,
  onRecertify,
  onSetReporting,
}: {
  period: BenefitPeriodDetail;
  onRecertify: (period: BenefitPeriodDetail) => void;
  onSetReporting: (id: string) => void;
}) {
  const f2fLabel = f2fBadge(period.f2fRequired, period.f2fStatus);

  return (
    <tr className="border-b hover:bg-gray-50">
      <td className="py-2 pr-3">
        <Link
          to="/patients/$patientId"
          params={{ patientId: period.patientId }}
          className="text-blue-600 hover:underline font-medium"
        >
          {period.patient.name}
        </Link>
      </td>
      <td className="py-2 pr-3 text-center text-sm font-medium">{period.periodNumber}</td>
      <td className="py-2 pr-3 text-sm text-gray-600">
        {period.startDate} – {period.endDate}
      </td>
      <td className="py-2 pr-3">
        <span
          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(period.status)}`}
        >
          {period.status.replace(/_/g, " ")}
        </span>
      </td>
      <td className="py-2 pr-3">
        {f2fLabel && (
          <span
            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${f2fBadgeColor(period.f2fStatus)}`}
          >
            {f2fLabel}
          </span>
        )}
      </td>
      <td className="py-2 pr-3 text-center">
        {period.billingRisk && (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-red-100 text-red-700 font-medium">
            Risk
          </span>
        )}
      </td>
      <td className="py-2">
        <div className="flex items-center gap-2">
          {(period.status === "recert_due" || period.status === "at_risk") && (
            <button
              type="button"
              onClick={() => onRecertify(period)}
              className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Recertify
            </button>
          )}
          {!period.isReportingPeriod && period.status === "current" && (
            <button
              type="button"
              onClick={() => onSetReporting(period.id)}
              className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
            >
              Set Reporting
            </button>
          )}
          {period.isReportingPeriod && (
            <span className="text-xs text-green-700 font-medium">Reporting</span>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Period table ──────────────────────────────────────────────────────────────

function PeriodTable({
  items,
  onRecertify,
  onSetReporting,
}: {
  items: BenefitPeriodDetail[];
  onRecertify: (period: BenefitPeriodDetail) => void;
  onSetReporting: (id: string) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="text-center text-gray-400 py-10">No benefit periods in this view.</div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-gray-500 text-left">
          <th className="pb-2 font-medium">Patient</th>
          <th className="pb-2 font-medium text-center">Period #</th>
          <th className="pb-2 font-medium">Date Range</th>
          <th className="pb-2 font-medium">Status</th>
          <th className="pb-2 font-medium">F2F</th>
          <th className="pb-2 font-medium text-center">Billing Risk</th>
          <th className="pb-2 font-medium">Actions</th>
        </tr>
      </thead>
      <tbody>
        {items.map((p) => (
          <PeriodRow
            key={p.id}
            period={p}
            onRecertify={onRecertify}
            onSetReporting={onSetReporting}
          />
        ))}
      </tbody>
    </table>
  );
}

// ── Recertify drawer ──────────────────────────────────────────────────────────

function RecertifyDrawer({
  period,
  onClose,
  onSuccess,
}: {
  period: BenefitPeriodDetail;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [physicianId, setPhysicianId] = useState("");
  const [completedAt, setCompletedAt] = useState(new Date().toISOString().slice(0, 10));

  const mutation = useMutation({
    mutationFn: () =>
      recertifyFn({ data: { id: period.id, physicianId, completedAt } }),
    onSuccess: () => {
      onSuccess();
      onClose();
    },
  });

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-white border-l border-gray-200 shadow-xl z-40 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="font-semibold text-gray-900">Record Recertification</h2>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">
          ×
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-800">
          Period #{period.periodNumber} — {period.startDate} to {period.endDate}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="physicianId">
            Physician ID (UUID)
          </label>
          <input
            id="physicianId"
            type="text"
            className="w-full border rounded px-3 py-2 text-sm"
            value={physicianId}
            onChange={(e) => setPhysicianId(e.target.value)}
            placeholder="Physician UUID"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="completedAt">
            Completion Date
          </label>
          <input
            id="completedAt"
            type="date"
            className="w-full border rounded px-3 py-2 text-sm"
            value={completedAt}
            onChange={(e) => setCompletedAt(e.target.value)}
          />
        </div>
        {mutation.isError && (
          <div className="text-red-600 text-sm">
            {mutation.error instanceof Error ? mutation.error.message : "Failed to record recertification"}
          </div>
        )}
      </div>
      <div className="border-t px-4 py-3 flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !physicianId || !completedAt}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? "Saving..." : "Save Recertification"}
        </button>
      </div>
    </div>
  );
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = ["Recert Upcoming", "At Risk", "Past Due", "All Active"] as const;
type TabName = (typeof TABS)[number];

const TAB_STATUS_MAP: Record<TabName, BenefitPeriodStatus | null> = {
  "Recert Upcoming": "recert_due",
  "At Risk": "at_risk",
  "Past Due": "past_due",
  "All Active": null,
};

// ── Main page ─────────────────────────────────────────────────────────────────

function BenefitPeriodsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabName>("Recert Upcoming");
  const [recertifyPeriod, setRecertifyPeriod] = useState<BenefitPeriodDetail | null>(null);

  const statusFilter = TAB_STATUS_MAP[activeTab];

  const { data: listData, isLoading } = useQuery({
    queryKey: ["benefit-periods", statusFilter],
    queryFn: () =>
      getBenefitPeriodsFn({
        data: { query: statusFilter ? { status: statusFilter } : {} },
      }) as Promise<BenefitPeriodListResponse>,
  });

  const { data: allData } = useQuery({
    queryKey: ["benefit-periods", null],
    queryFn: () =>
      getBenefitPeriodsFn({ data: { query: {} } }) as Promise<BenefitPeriodListResponse>,
  });

  const setReportingMutation = useMutation({
    mutationFn: (id: string) => setReportingPeriodFn({ data: { id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["benefit-periods"] });
    },
  });

  // Listen for Socket.IO benefit period events via DOM events
  useEffect(() => {
    const handler = () => {
      void queryClient.invalidateQueries({ queryKey: ["benefit-periods"] });
    };
    window.addEventListener("benefit:period:status:changed", handler);
    return () => window.removeEventListener("benefit:period:status:changed", handler);
  }, [queryClient]);

  const items = listData?.items ?? [];
  const allItems = allData?.items ?? [];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Benefit Period Manager</h1>
        <p className="text-sm text-gray-500 mt-1">
          CMS hospice benefit period tracking — 42 CFR §418.21 / §418.22
        </p>
      </div>

      {/* Summary widgets */}
      {allItems.length > 0 && <StatusSummary items={allItems} />}

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-4">
        <div className="flex gap-1">
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

      {/* Table */}
      <div className="bg-white border rounded-lg p-4 min-h-[300px]">
        {isLoading ? (
          <div className="text-center text-gray-400 py-10">Loading...</div>
        ) : (
          <PeriodTable
            items={items}
            onRecertify={(p) => setRecertifyPeriod(p)}
            onSetReporting={(id) => setReportingMutation.mutate(id)}
          />
        )}
      </div>

      {/* Recertify drawer */}
      {recertifyPeriod && (
        <RecertifyDrawer
          period={recertifyPeriod}
          onClose={() => setRecertifyPeriod(null)}
          onSuccess={() => void queryClient.invalidateQueries({ queryKey: ["benefit-periods"] })}
        />
      )}
    </div>
  );
}
