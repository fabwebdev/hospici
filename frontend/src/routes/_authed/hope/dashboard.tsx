// routes/_authed/hope/dashboard.tsx
// HOPE Command Center — location-wide operational dashboard (T3-1b)
// Tracks HOPE-A / HOPE-UV / HOPE-D windows, symptom follow-ups, iQIES status, HQRP penalty risk

import { getHOPEDashboardFn, reprocessHOPESubmissionFn } from "@/functions/hope.functions.js";
import {
  type HOPEAssessmentStatus,
  type HOPEDashboardAssessmentItem,
  type HOPEDashboardResponse,
  HOPE_ASSESSMENT_TYPE_LABELS,
  HOPE_STATUS_LABELS,
  IQIES_ERROR_GUIDANCE,
} from "@hospici/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/_authed/hope/dashboard")({
  loader: async () => {
    return getHOPEDashboardFn();
  },
  component: HOPEDashboardPage,
});

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<HOPEAssessmentStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  in_progress: "bg-blue-100 text-blue-700",
  ready_for_review: "bg-amber-100 text-amber-700",
  approved_for_submission: "bg-purple-100 text-purple-700",
  submitted: "bg-indigo-100 text-indigo-700",
  accepted: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-700",
  needs_correction: "bg-orange-100 text-orange-700",
};

function StatusBadge({ status }: { status: HOPEAssessmentStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}
    >
      {HOPE_STATUS_LABELS[status]}
    </span>
  );
}

// ── Deadline pill ─────────────────────────────────────────────────────────────

function DeadlinePill({ deadline }: { deadline: string }) {
  const today = new Date();
  const dl = new Date(deadline);
  const daysLeft = Math.ceil((dl.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
        OVERDUE {Math.abs(daysLeft)}d
      </span>
    );
  }
  if (daysLeft === 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
        Due TODAY
      </span>
    );
  }
  if (daysLeft <= 2) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        {deadline} ({daysLeft}d)
      </span>
    );
  }
  return <span className="text-xs text-gray-600">{deadline}</span>;
}

// ── Completeness ring ─────────────────────────────────────────────────────────

function CompletenessRing({ score }: { score: number }) {
  const r = 16;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <svg width={40} height={40} className="shrink-0" aria-label={`${score}% complete`}>
      <title>{score}% complete</title>
      <circle cx={20} cy={20} r={r} fill="none" stroke="#e2e8f0" strokeWidth="3" />
      <circle
        cx={20}
        cy={20}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 20 20)"
      />
      <text x={20} y={24} textAnchor="middle" fontSize={9} fontWeight="600" fill={color}>
        {score}%
      </text>
    </svg>
  );
}

// ── Widget card ───────────────────────────────────────────────────────────────

function WidgetCard({
  label,
  value,
  color,
  pulse,
}: {
  label: string;
  value: number | boolean;
  color: string;
  pulse?: boolean;
}) {
  const displayValue = typeof value === "boolean" ? (value ? "YES" : "NO") : value;
  const valueColor =
    typeof value === "boolean" ? (value ? "text-red-600" : "text-green-600") : color;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</span>
        {pulse && typeof value === "number" && value > 0 && (
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
        )}
      </div>
      <div className={`mt-2 text-2xl font-bold ${valueColor}`}>{displayValue}</div>
    </div>
  );
}

// ── Assessment row ────────────────────────────────────────────────────────────

function AssessmentRow({ item }: { item: HOPEDashboardAssessmentItem }) {
  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3">
        <Link
          to="/hope/assessments/$id"
          params={{ id: item.id }}
          className="font-medium text-blue-600 hover:underline text-sm"
        >
          {item.patientName}
        </Link>
      </td>
      <td className="px-4 py-3">
        <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
          {HOPE_ASSESSMENT_TYPE_LABELS[item.assessmentType]}
        </span>
      </td>
      <td className="px-4 py-3">
        <DeadlinePill deadline={item.windowDeadline} />
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={item.status} />
      </td>
      <td className="px-4 py-3">
        <CompletenessRing score={item.completenessScore} />
      </td>
      <td className="px-4 py-3">
        {item.symptomFollowUpRequired && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Follow-up
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-xs text-gray-500">{item.nextAction}</td>
      <td className="px-4 py-3">
        <Link
          to="/hope/assessments/$id"
          params={{ id: item.id }}
          className="text-xs text-blue-600 hover:underline"
        >
          Open
        </Link>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function HOPEDashboardPage() {
  const initialData = Route.useLoaderData();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<HOPEDashboardResponse>({
    queryKey: ["hope", "dashboard"],
    queryFn: () => getHOPEDashboardFn(),
    initialData,
    refetchInterval: 120_000,
    staleTime: 60_000,
  });

  // Socket.IO: live refresh on hope events (dispatched via DOM events)
  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["hope", "dashboard"] });
    };
    window.addEventListener("hope:deadline:warning", refresh);
    window.addEventListener("hope:assessment:overdue", refresh);
    window.addEventListener("hope:submission:rejected", refresh);
    return () => {
      window.removeEventListener("hope:deadline:warning", refresh);
      window.removeEventListener("hope:assessment:overdue", refresh);
      window.removeEventListener("hope:submission:rejected", refresh);
    };
  }, [queryClient]);

  if (isLoading || !data) {
    return <div className="py-12 text-center text-gray-400">Loading HOPE dashboard…</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">HOPE Command Center</h1>
          <p className="mt-1 text-sm text-gray-500">
            Hospice Outcomes and Patient Evaluation — 42 CFR §418.312
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            to="/hope/submissions"
            className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Submission Workbench
          </Link>
          <Link
            to="/hope/assessments/new"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            New Assessment
          </Link>
        </div>
      </div>

      {/* HQRP penalty warning */}
      {data.hqrpPenaltyRisk && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-semibold text-red-800">
            ⚠ HQRP Penalty Risk — One or more quality measures are below the 70% target threshold.
            Missing the submission deadline results in a 2% Medicare payment reduction.
          </p>
        </div>
      )}

      {/* Widget row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-7">
        <WidgetCard label="Due Today" value={data.dueToday} color="text-red-600" pulse />
        <WidgetCard label="Due 48h" value={data.due48h} color="text-amber-600" pulse />
        <WidgetCard label="Overdue" value={data.overdue} color="text-red-700" pulse />
        <WidgetCard
          label="Symptom Follow-Up"
          value={data.needsSymptomFollowUp}
          color="text-orange-600"
        />
        <WidgetCard
          label="Rejected by iQIES"
          value={data.rejectedByIQIES}
          color="text-red-600"
          pulse
        />
        <WidgetCard label="Ready to Submit" value={data.readyToSubmit} color="text-purple-600" />
        <WidgetCard label="HQRP Penalty Risk" value={data.hqrpPenaltyRisk} color="text-red-600" />
      </div>

      {/* Operational list */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 bg-gray-50 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-700">
            Active Assessments ({data.assessmentList.length})
          </h2>
        </div>
        {data.assessmentList.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">
            No active HOPE assessments for this location.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Patient
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Deadline
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Complete
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Follow-Up
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Next Action
                  </th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {data.assessmentList.map((item) => (
                  <AssessmentRow key={item.id} item={item} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
