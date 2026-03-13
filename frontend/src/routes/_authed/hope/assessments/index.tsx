// routes/_authed/hope/assessments/index.tsx
// HOPE Assessment List — location-wide view of all assessments with status + completeness

import { getHOPEAssessmentsFn } from "@/functions/hope.functions.js";
import {
  type HOPEAssessmentListQuery,
  type HOPEAssessmentResponse,
  type HOPEAssessmentStatus,
  HOPE_ASSESSMENT_TYPE_LABELS,
  HOPE_STATUS_LABELS,
} from "@hospici/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/hope/assessments/")({
  loader: async () => {
    return getHOPEAssessmentsFn({ data: {} });
  },
  component: HOPEAssessmentListPage,
});

// ── Completeness ring (pure SVG, no extra deps) ────────────────────────────────

function CompletenessRing({
  score,
  size = 48,
  fatalErrors = 0,
}: { score: number; size?: number; fatalErrors?: number }) {
  const r = size / 2 - 4;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color =
    fatalErrors > 0 ? "#ef4444" : score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#94a3b8";
  return (
    <svg width={size} height={size} className="shrink-0" aria-label={`Completeness: ${score}%`}>
      <title>Completeness: {score}%</title>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="4" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="4"
        strokeDasharray={`${dash} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x={size / 2}
        y={size / 2 + 4}
        textAnchor="middle"
        fontSize={size * 0.25}
        fontWeight="600"
        fill={color}
      >
        {score}%
      </text>
    </svg>
  );
}

// ── Status badge ───────────────────────────────────────────────────────────────

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

// ── Window deadline indicator ──────────────────────────────────────────────────

function WindowDeadlinePill({
  deadline,
  status,
}: { deadline: string; status: HOPEAssessmentStatus }) {
  const today = new Date();
  const dl = new Date(deadline);
  const daysLeft = Math.ceil((dl.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const isActive = ["draft", "in_progress", "ready_for_review"].includes(status);

  if (!isActive) return <span className="text-xs text-gray-400">{deadline}</span>;

  if (daysLeft < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
        <span className="h-1.5 w-1.5 rounded-full bg-red-600 animate-pulse" />
        OVERDUE ({Math.abs(daysLeft)}d)
      </span>
    );
  }
  if (daysLeft === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
        Due TODAY
      </span>
    );
  }
  if (daysLeft <= 2) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        {deadline} ({daysLeft}d left)
      </span>
    );
  }
  return <span className="text-xs text-gray-600">{deadline}</span>;
}

// ── Main page ──────────────────────────────────────────────────────────────────

function HOPEAssessmentListPage() {
  const initialData = Route.useLoaderData();
  const { data, isLoading } = useQuery({
    queryKey: ["hope", "assessments"],
    queryFn: () => getHOPEAssessmentsFn({ data: {} }),
    initialData,
  });

  const assessments = data?.data ?? [];

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">HOPE Assessments</h1>
          <p className="text-sm text-gray-500 mt-1">
            Hospice Outcomes and Patient Evaluation — CMS Quality Reporting (42 CFR §418.312)
          </p>
        </div>
        <Link
          to="/hope/assessments/new"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          New Assessment
        </Link>
      </div>

      {/* Assessment table */}
      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading assessments…</div>
      ) : assessments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center text-gray-400">
          No HOPE assessments found. Create the first one.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Type</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Patient</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Assessment Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Window Deadline</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Completeness</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Follow-Up</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {assessments.map((a: HOPEAssessmentResponse) => (
                <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                      {HOPE_ASSESSMENT_TYPE_LABELS[a.assessmentType]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to="/hope/assessments/$id"
                      params={{ id: a.id }}
                      className="text-blue-600 hover:underline font-medium"
                    >
                      {a.patientId.slice(0, 8)}…
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{a.assessmentDate}</td>
                  <td className="px-4 py-3">
                    <WindowDeadlinePill deadline={a.windowDeadline} status={a.status} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={a.status} />
                    {a.fatalErrorCount > 0 && (
                      <span className="ml-1.5 text-xs text-red-500">
                        {a.fatalErrorCount} error{a.fatalErrorCount > 1 ? "s" : ""}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <CompletenessRing
                        score={a.completenessScore}
                        fatalErrors={a.fatalErrorCount}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {a.symptomFollowUpRequired && (
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 rounded-full px-2 py-0.5">
                        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                        Follow-up due {a.symptomFollowUpDueAt ?? "—"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Total count */}
      {data && <p className="text-xs text-gray-400">{data.total} total assessments</p>}
    </div>
  );
}
