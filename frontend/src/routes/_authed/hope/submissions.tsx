// routes/_authed/hope/submissions.tsx
// HOPE Submission Workbench — manage iQIES lifecycle by tab (T3-1b)
// Tabs: Pending Approval / Ready to Submit / Submitted / Rejected / History

import {
  getHOPEAssessmentsFn,
  reprocessHOPESubmissionFn,
  revertHOPEToReviewFn,
} from "@/functions/hope.functions.js";
import {
  HOPE_ASSESSMENT_TYPE_LABELS,
  HOPE_STATUS_LABELS,
  IQIES_ERROR_GUIDANCE,
  type HOPEAssessmentListResponse,
  type HOPEAssessmentResponse,
  type HOPEAssessmentStatus,
} from "@hospici/shared-types";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

export const Route = createFileRoute("/_authed/hope/submissions")({
  loader: async () => {
    return getHOPEAssessmentsFn({ data: {} });
  },
  component: HOPESubmissionsPage,
});

// ── Tab definitions ───────────────────────────────────────────────────────────

type Tab = "pending_approval" | "ready" | "submitted" | "rejected" | "history";

const TABS: Array<{ id: Tab; label: string; statuses: HOPEAssessmentStatus[] }> = [
  { id: "pending_approval", label: "Pending Approval", statuses: ["ready_for_review"] },
  { id: "ready", label: "Ready to Submit", statuses: ["approved_for_submission"] },
  { id: "submitted", label: "Submitted", statuses: ["submitted"] },
  { id: "rejected", label: "Rejected", statuses: ["rejected", "needs_correction"] },
  { id: "history", label: "History", statuses: ["accepted"] },
];

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
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[status]}`}>
      {HOPE_STATUS_LABELS[status]}
    </span>
  );
}

// ── Rejection guidance ────────────────────────────────────────────────────────

function RejectionGuidance({ codes }: { codes: string[] }) {
  if (codes.length === 0) return null;
  return (
    <div className="mt-2 space-y-1">
      {codes.map((code) => (
        <div key={code} className="rounded-md bg-red-50 px-3 py-2 text-xs">
          <span className="font-mono font-semibold text-red-700">{code}</span>
          <span className="ml-2 text-red-600">
            — {IQIES_ERROR_GUIDANCE[code] ?? "Contact iQIES helpdesk for resolution."}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Assessment workbench row ──────────────────────────────────────────────────

function WorkbenchRow({
  assessment,
  onReprocess,
  onRevert,
}: {
  assessment: HOPEAssessmentResponse;
  onReprocess?: (assessmentId: string) => void;
  onRevert?: (assessmentId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr className="hover:bg-gray-50 transition-colors">
        <td className="px-4 py-3">
          <Link
            to="/hope/assessments/$id"
            params={{ id: assessment.id }}
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            {assessment.id.slice(0, 8)}…
          </Link>
        </td>
        <td className="px-4 py-3">
          <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
            {HOPE_ASSESSMENT_TYPE_LABELS[assessment.assessmentType]}
          </span>
        </td>
        <td className="px-4 py-3">
          <StatusBadge status={assessment.status} />
        </td>
        <td className="px-4 py-3 text-xs text-gray-600">{assessment.windowDeadline}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {assessment.status === "rejected" && onReprocess && (
              <button
                type="button"
                onClick={() => onReprocess(assessment.id)}
                className="rounded-md bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700"
              >
                Reprocess
              </button>
            )}
            {assessment.status === "approved_for_submission" && onRevert && (
              <button
                type="button"
                onClick={() => onRevert(assessment.id)}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                Revert to Review
              </button>
            )}
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-blue-600 hover:underline"
            >
              {expanded ? "Hide" : "Details"}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={5} className="bg-gray-50 px-4 pb-4">
            <div className="pt-2 text-xs text-gray-600 space-y-1">
              <div>
                <span className="font-medium">Assessment ID:</span> {assessment.id}
              </div>
              <div>
                <span className="font-medium">Patient ID:</span> {assessment.patientId}
              </div>
              <div>
                <span className="font-medium">Completeness:</span> {assessment.completenessScore}%
                {assessment.fatalErrorCount > 0 && (
                  <span className="ml-2 text-red-600">
                    ({assessment.fatalErrorCount} blocking error{assessment.fatalErrorCount > 1 ? "s" : ""})
                  </span>
                )}
              </div>
              {assessment.warningCount > 0 && (
                <div>
                  <span className="font-medium">Warnings:</span> {assessment.warningCount}
                </div>
              )}
              {assessment.symptomFollowUpRequired && (
                <div className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-amber-700">
                  Symptom follow-up required — due {assessment.symptomFollowUpDueAt ?? "ASAP"}
                </div>
              )}
              {assessment.status === "rejected" && (
                <div className="mt-2">
                  <p className="font-medium text-red-700">Rejection Guidance:</p>
                  <div className="mt-1 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
                    No rejection codes available. Check the iQIES portal for details.
                  </div>
                </div>
              )}
              <div className="mt-2">
                <Link
                  to="/hope/assessments/$id"
                  params={{ id: assessment.id }}
                  className="text-xs font-medium text-blue-600 hover:underline"
                >
                  Open full assessment →
                </Link>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function HOPESubmissionsPage() {
  const initialData = Route.useLoaderData();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<Tab>("pending_approval");

  const { data, isLoading } = useQuery<HOPEAssessmentListResponse>({
    queryKey: ["hope", "assessments"],
    queryFn: () => getHOPEAssessmentsFn({ data: {} }),
    initialData,
    refetchInterval: 60_000,
  });

  const reprocessMutation = useMutation({
    mutationFn: (submissionId: string) =>
      reprocessHOPESubmissionFn({ data: { submissionId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["hope", "assessments"] });
    },
  });

  const revertMutation = useMutation({
    mutationFn: (submissionId: string) =>
      revertHOPEToReviewFn({ data: { submissionId } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["hope", "assessments"] });
    },
  });

  const currentTab = TABS.find((t) => t.id === activeTab);
  const filteredAssessments = (data?.data ?? []).filter(
    (a) => currentTab?.statuses.includes(a.status),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">HOPE Submission Workbench</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage iQIES submission lifecycle for all HOPE assessments
          </p>
        </div>
        <Link
          to="/hope/dashboard"
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          ← Command Center
        </Link>
      </div>

      {/* Error states */}
      {reprocessMutation.isError && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          Reprocess failed: {reprocessMutation.error instanceof Error
            ? reprocessMutation.error.message
            : "Unknown error"}
        </div>
      )}
      {revertMutation.isError && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
          Revert failed: {revertMutation.error instanceof Error
            ? revertMutation.error.message
            : "Unknown error"}
        </div>
      )}

      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="flex -mb-px gap-6">
          {TABS.map((tab) => {
            const count = (data?.data ?? []).filter((a) =>
              tab.statuses.includes(a.status),
            ).length;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
                {count > 0 && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-xs font-bold ${
                      activeTab === tab.id
                        ? "bg-blue-100 text-blue-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab content */}
      {isLoading ? (
        <div className="py-12 text-center text-gray-400">Loading assessments…</div>
      ) : filteredAssessments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-12 text-center text-sm text-gray-400">
          No assessments in this state.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-gray-100 bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assessment</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Window Deadline</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredAssessments.map((assessment) => (
                <WorkbenchRow
                  key={assessment.id}
                  assessment={assessment}
                  onReprocess={(id) => reprocessMutation.mutate(id)}
                  onRevert={(id) => revertMutation.mutate(id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
