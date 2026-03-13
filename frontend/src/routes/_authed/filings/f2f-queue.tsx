// routes/_authed/filings/f2f-queue.tsx
// F2F Queue — supervisor/admin view — T3-2b

import { getF2FQueueFn } from "@/functions/f2f.functions.js";
import type { F2FQueueItem, F2FStatus } from "@hospici/shared-types";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/filings/f2f-queue")({
  component: F2FQueue,
});

function statusBadge(status: F2FStatus) {
  const cfg = {
    valid: { cls: "bg-green-100 text-green-800", label: "Valid" },
    invalid: { cls: "bg-red-100 text-red-800", label: "Invalid" },
    missing: { cls: "bg-yellow-100 text-yellow-800", label: "Missing" },
  }[status];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function daysRemainingBadge(days: number) {
  const cls =
    days <= 0
      ? "bg-red-600 text-white"
      : days <= 5
        ? "bg-amber-500 text-white"
        : "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {days <= 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
    </span>
  );
}

function F2FQueue() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["f2f-queue"],
    queryFn: () => getF2FQueueFn(),
  });

  if (isLoading) {
    return <div className="p-8 text-center text-gray-500">Loading F2F queue…</div>;
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-600">
        Failed to load F2F queue. You may not have the required role (supervisor/admin).
      </div>
    );
  }

  const items = data?.items ?? [];

  return (
    <div className="px-4 py-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">F2F Documentation Queue</h1>
        <span className="text-sm text-gray-500">
          {items.length} patient{items.length !== 1 ? "s" : ""} in period 3+
        </span>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-6 text-sm text-amber-800">
        <strong>CMS Rule (42 CFR §418.22):</strong> Face-to-face encounter required for all benefit
        period 3+ recertifications, within 30 calendar days prior to recertification date.
      </div>

      {items.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          All patients in period 3+ have valid F2F documentation.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Patient
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Period
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Recert Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Days Remaining
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  F2F Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last F2F
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {items.map((item) => (
                <F2FQueueRow key={`${item.patientId}-${item.periodNumber}`} item={item} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function F2FQueueRow({ item }: { item: F2FQueueItem }) {
  return (
    <tr className="hover:bg-gray-50">
      <td className="px-4 py-3 text-sm text-gray-900">
        <Link
          to="/patients/$patientId"
          params={{ patientId: item.patientId }}
          className="text-indigo-600 hover:text-indigo-800 font-medium"
        >
          {item.patientName}
        </Link>
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">
        Period {item.periodNumber}
        <span className="ml-1 text-xs text-gray-500">({item.periodType})</span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-700">{item.recertDate}</td>
      <td className="px-4 py-3">{daysRemainingBadge(item.daysUntilRecert)}</td>
      <td className="px-4 py-3">{statusBadge(item.f2fStatus)}</td>
      <td className="px-4 py-3 text-sm text-gray-700">{item.lastF2FDate ?? "—"}</td>
      <td className="px-4 py-3">
        {item.f2fStatus !== "valid" && (
          <Link
            to="/patients/$patientId/f2f/new"
            params={{ patientId: item.patientId }}
            search={{ periodId: undefined }}
            className="inline-flex items-center px-3 py-1 text-xs font-medium text-white bg-indigo-600 rounded hover:bg-indigo-700"
          >
            Document F2F
          </Link>
        )}
      </td>
    </tr>
  );
}
