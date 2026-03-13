// routes/_authed/compliance/recert-queue.tsx
// Recertifications Due Report — T3-4

import {
  getBenefitPeriodsFn,
  recertifyFn,
} from "@/functions/benefit-period.functions.js";
import type {
  BenefitPeriodDetail,
  BenefitPeriodListResponse,
  BenefitPeriodRecertStatus,
  BenefitPeriodStatus,
} from "@hospici/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_authed/compliance/recert-queue")({
  component: RecertQueuePage,
});

// ── Sort helpers ──────────────────────────────────────────────────────────────

type SortField = "recertDueDate" | "status" | "periodNumber";
type SortDir = "asc" | "desc";

function sortItems(
  items: BenefitPeriodDetail[],
  field: SortField,
  dir: SortDir,
): BenefitPeriodDetail[] {
  return [...items].sort((a, b) => {
    let cmp = 0;
    if (field === "recertDueDate") {
      const da = a.recertDueDate ?? "9999-99-99";
      const db = b.recertDueDate ?? "9999-99-99";
      cmp = da < db ? -1 : da > db ? 1 : 0;
    } else if (field === "status") {
      cmp = a.status.localeCompare(b.status);
    } else if (field === "periodNumber") {
      cmp = a.periodNumber - b.periodNumber;
    }
    return dir === "asc" ? cmp : -cmp;
  });
}

// ── Status filter options ─────────────────────────────────────────────────────

const RECERT_STATUSES: Array<BenefitPeriodStatus | ""> = [
  "",
  "recert_due",
  "at_risk",
  "past_due",
  "current",
];

// ── Recert status badge ───────────────────────────────────────────────────────

function recertStatusBadge(status: BenefitPeriodRecertStatus): string {
  switch (status) {
    case "completed":
      return "bg-green-100 text-green-700";
    case "pending_physician":
      return "bg-amber-100 text-amber-700";
    case "ready_for_recert":
      return "bg-blue-100 text-blue-700";
    case "missed":
      return "bg-red-100 text-red-700";
    default:
      return "bg-gray-100 text-gray-600";
  }
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
    <div className="fixed inset-y-0 right-0 w-[440px] bg-white border-l border-gray-200 shadow-xl z-40 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <h2 className="font-semibold text-gray-900">Record Recertification</h2>
        <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">
          ×
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-gray-50 border rounded p-3 text-sm text-gray-700 space-y-1">
          <div className="font-medium">{period.patient.name}</div>
          <div>Period #{period.periodNumber}</div>
          <div>
            {period.startDate} → {period.endDate}
          </div>
          {period.recertDueDate && (
            <div className="text-amber-700">Recert due: {period.recertDueDate}</div>
          )}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="recert-physician">
            Certifying Physician ID
          </label>
          <input
            id="recert-physician"
            type="text"
            className="w-full border rounded px-3 py-2 text-sm"
            value={physicianId}
            onChange={(e) => setPhysicianId(e.target.value)}
            placeholder="Physician UUID"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="recert-date">
            Certification Date
          </label>
          <input
            id="recert-date"
            type="date"
            className="w-full border rounded px-3 py-2 text-sm"
            value={completedAt}
            onChange={(e) => setCompletedAt(e.target.value)}
          />
        </div>
        {mutation.isError && (
          <div className="text-red-600 text-sm">
            {mutation.error instanceof Error
              ? mutation.error.message
              : "Failed to record recertification"}
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
          {mutation.isPending ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function RecertQueuePage() {
  const queryClient = useQueryClient();
  const [sortField, setSortField] = useState<SortField>("recertDueDate");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [statusFilter, setStatusFilter] = useState<BenefitPeriodStatus | "">("");
  const [recertifyPeriod, setRecertifyPeriod] = useState<BenefitPeriodDetail | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["recert-queue", statusFilter],
    queryFn: () =>
      getBenefitPeriodsFn({
        data: {
          query: statusFilter
            ? { status: statusFilter }
            : { status: "recert_due" },
        },
      }) as Promise<BenefitPeriodListResponse>,
  });

  const items = sortItems(data?.items ?? [], sortField, sortDir);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>;
    return <span className="text-blue-600 ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Recertifications Due</h1>
        <p className="text-sm text-gray-500 mt-1">
          Benefit periods requiring physician recertification — 42 CFR §418.21
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 mb-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mr-2" htmlFor="status-filter">
            Status:
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as BenefitPeriodStatus | "")}
            className="border rounded px-3 py-1.5 text-sm"
          >
            {RECERT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === "" ? "All Due Statuses" : s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div className="text-sm text-gray-500">
          {items.length} period{items.length !== 1 ? "s" : ""}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border rounded-lg overflow-x-auto">
        {isLoading ? (
          <div className="text-center text-gray-400 py-10">Loading...</div>
        ) : items.length === 0 ? (
          <div className="text-center text-gray-400 py-10">No recertifications due.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-gray-500 text-left bg-gray-50">
                <th className="px-4 py-3 font-medium">Patient</th>
                <th
                  className="px-4 py-3 font-medium cursor-pointer select-none"
                  onClick={() => toggleSort("periodNumber")}
                >
                  Period #
                  <SortIcon field="periodNumber" />
                </th>
                <th
                  className="px-4 py-3 font-medium cursor-pointer select-none"
                  onClick={() => toggleSort("recertDueDate")}
                >
                  Recert Due
                  <SortIcon field="recertDueDate" />
                </th>
                <th
                  className="px-4 py-3 font-medium cursor-pointer select-none"
                  onClick={() => toggleSort("status")}
                >
                  Status
                  <SortIcon field="status" />
                </th>
                <th className="px-4 py-3 font-medium">Recert Status</th>
                <th className="px-4 py-3 font-medium">F2F</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((period) => (
                <tr key={period.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link
                      to="/patients/$patientId"
                      params={{ patientId: period.patientId }}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {period.patient.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-center">{period.periodNumber}</td>
                  <td className="px-4 py-3">
                    {period.recertDueDate ?? (
                      <span className="text-gray-400 italic">N/A</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        period.status === "at_risk"
                          ? "bg-orange-100 text-orange-800"
                          : period.status === "past_due"
                            ? "bg-red-100 text-red-800"
                            : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {period.status.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${recertStatusBadge(period.recertStatus)}`}
                    >
                      {period.recertStatus.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {period.f2fRequired && (
                      <span
                        className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
                          period.f2fStatus === "documented"
                            ? "bg-green-100 text-green-700"
                            : period.f2fStatus === "missing" || period.f2fStatus === "invalid"
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {period.f2fStatus.replace(/_/g, " ")}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {period.recertStatus !== "completed" && (
                      <button
                        type="button"
                        onClick={() => setRecertifyPeriod(period)}
                        className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Record Recertification
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Recertify drawer */}
      {recertifyPeriod && (
        <RecertifyDrawer
          period={recertifyPeriod}
          onClose={() => setRecertifyPeriod(null)}
          onSuccess={() => void queryClient.invalidateQueries({ queryKey: ["recert-queue"] })}
        />
      )}
    </div>
  );
}
