// routes/_authed/hope/assessments/$id.tsx
// HOPE Assessment detail view with:
//   - Real-time completeness ring
//   - Section-level status (green/red/yellow)
//   - "Fix next required item" navigation
//   - Blocking errors shown inline
//   - Supervisor "Approve for Submission" button (role-gated)
//   - Submit button disabled until blockingErrors.length === 0

import {
  approveHOPEAssessmentFn,
  getHOPEAssessmentFn,
  validateHOPEAssessmentFn,
} from "@/functions/hope.functions.js";
import {
  type HOPEAssessmentResponse,
  type HOPEAssessmentStatus,
  type HOPEValidationResult,
  HOPE_ASSESSMENT_TYPE_LABELS,
  HOPE_STATUS_LABELS,
  IQIES_ERROR_GUIDANCE,
} from "@hospici/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/_authed/hope/assessments/$id")({
  loader: async ({ params }: { params: { id: string } }) => {
    return getHOPEAssessmentFn({ data: { id: params.id } });
  },
  component: HOPEAssessmentDetailPage,
});

// ── Completeness ring (pure SVG) ───────────────────────────────────────────────

function CompletenessRing({ score, fatalErrors }: { score: number; fatalErrors: number }) {
  const size = 80;
  const r = size / 2 - 6;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color =
    fatalErrors > 0
      ? "#ef4444"
      : score === 100
        ? "#22c55e"
        : score >= 70
          ? "#3b82f6"
          : score >= 40
            ? "#f59e0b"
            : "#94a3b8";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg
        width={size}
        height={size}
        className="drop-shadow-sm"
        aria-label={`Completeness ${score}%`}
      >
        <title>Completeness {score}%</title>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth="6" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 0.4s ease" }}
        />
        <text
          x={size / 2}
          y={size / 2 + 5}
          textAnchor="middle"
          fontSize="16"
          fontWeight="700"
          fill={color}
        >
          {score}%
        </text>
      </svg>
      <span className="text-xs font-medium text-gray-500">Completeness</span>
    </div>
  );
}

// ── Validation issue card ──────────────────────────────────────────────────────

function IssueCard({
  issue,
  type,
}: {
  issue: { field: string; code: string; message: string };
  type: "error" | "warning";
}) {
  const bg = type === "error" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200";
  const icon = type === "error" ? "✕" : "⚠";
  const iconColor = type === "error" ? "text-red-500" : "text-amber-500";
  const guidance = IQIES_ERROR_GUIDANCE[issue.code];

  return (
    <div className={`rounded-lg border p-3 ${bg}`}>
      <div className="flex items-start gap-2">
        <span className={`font-bold text-sm shrink-0 mt-0.5 ${iconColor}`}>{icon}</span>
        <div className="flex-1 space-y-1">
          <p className="text-sm font-medium text-gray-800">{issue.message}</p>
          <p className="text-xs font-mono text-gray-400">
            {issue.field} · {issue.code}
          </p>
          {guidance && <p className="text-xs text-gray-500 italic">{guidance}</p>}
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

function HOPEAssessmentDetailPage() {
  const { id } = Route.useParams();
  const initialData = Route.useLoaderData();
  const { session } = Route.useRouteContext();
  const queryClient = useQueryClient();

  const isSupervisor = ["supervisor", "admin", "super_admin"].includes(session?.role ?? "");

  const { data: assessment } = useQuery<HOPEAssessmentResponse>({
    queryKey: ["hope", "assessment", id],
    queryFn: () => getHOPEAssessmentFn({ data: { id } }),
    initialData,
    refetchInterval: 30_000,
  });

  const [validation, setValidation] = useState<HOPEValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [validateError, setValidateError] = useState<string | null>(null);
  const [firstMissingFieldIndex, setFirstMissingFieldIndex] = useState(0);

  const handleValidate = useCallback(async () => {
    setIsValidating(true);
    setValidateError(null);
    try {
      const result = await validateHOPEAssessmentFn({ data: { id } });
      setValidation(result);
      // Invalidate assessment query to get updated cached scores
      void queryClient.invalidateQueries({ queryKey: ["hope", "assessment", id] });
    } catch (err) {
      setValidateError(err instanceof Error ? err.message : "Validation failed");
    } finally {
      setIsValidating(false);
    }
  }, [id, queryClient]);

  // Auto-validate on first load if assessment has data
  useEffect(() => {
    if (assessment && Object.keys(assessment.data ?? {}).length > 0) {
      void handleValidate();
    }
  }, [assessment, handleValidate]);

  const approveMutation = useMutation({
    mutationFn: () => approveHOPEAssessmentFn({ data: { id } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["hope", "assessment", id] });
      void queryClient.invalidateQueries({ queryKey: ["hope", "assessments"] });
    },
  });

  if (!assessment) {
    return <div className="p-6 text-gray-400">Loading assessment…</div>;
  }

  const canApprove =
    isSupervisor &&
    assessment.status === "ready_for_review" &&
    (validation?.blockingErrors.length ?? assessment.fatalErrorCount) === 0;

  const blockingCount = validation?.blockingErrors.length ?? assessment.fatalErrorCount;
  const warningCount = validation?.warnings.length ?? assessment.warningCount;

  const nextMissingField = validation?.missingRequiredFields[firstMissingFieldIndex] ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
              {HOPE_ASSESSMENT_TYPE_LABELS[assessment.assessmentType]}
            </span>
            <span className="text-xs text-gray-400">#{id.slice(0, 8)}</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {HOPE_STATUS_LABELS[assessment.status as HOPEAssessmentStatus]}
          </h1>
          <p className="text-sm text-gray-500">
            Assessment date: <strong>{assessment.assessmentDate}</strong>
            {" · "}
            Window deadline:{" "}
            <WindowDeadlineInline
              deadline={assessment.windowDeadline}
              status={assessment.status as HOPEAssessmentStatus}
            />
          </p>
        </div>

        {/* Completeness ring */}
        <CompletenessRing
          score={validation?.completenessScore ?? assessment.completenessScore}
          fatalErrors={blockingCount}
        />
      </div>

      {/* Validation panel */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-700">Validation Status</h2>
            {blockingCount > 0 && (
              <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-600">
                {blockingCount} blocking error{blockingCount > 1 ? "s" : ""}
              </span>
            )}
            {warningCount > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-600">
                {warningCount} warning{warningCount > 1 ? "s" : ""}
              </span>
            )}
            {validation && blockingCount === 0 && (
              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-600">
                Ready to approve
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => void handleValidate()}
            disabled={isValidating}
            className="rounded-lg bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            {isValidating ? "Validating…" : "Run Validation"}
          </button>
        </div>

        {validateError && (
          <div className="px-4 py-3 bg-red-50 text-red-600 text-sm">{validateError}</div>
        )}

        {validation && (
          <div className="space-y-4 p-4">
            {/* "Fix next" navigation */}
            {validation.missingRequiredFields.length > 0 && (
              <div className="flex items-center gap-3 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2">
                <span className="text-xs font-semibold text-blue-700">Next required field:</span>
                <code className="text-xs font-mono text-blue-800 bg-blue-100 px-1.5 py-0.5 rounded">
                  {nextMissingField}
                </code>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFirstMissingFieldIndex((i) => Math.max(0, i - 1))}
                    disabled={firstMissingFieldIndex === 0}
                    className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <span className="text-xs text-blue-500">
                    {firstMissingFieldIndex + 1} / {validation.missingRequiredFields.length}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setFirstMissingFieldIndex((i) =>
                        Math.min(validation.missingRequiredFields.length - 1, i + 1),
                      )
                    }
                    disabled={firstMissingFieldIndex >= validation.missingRequiredFields.length - 1}
                    className="text-xs text-blue-600 hover:text-blue-800 disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}

            {/* Blocking errors */}
            {validation.blockingErrors.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-red-500">
                  Blocking Errors — must resolve before approval
                </h3>
                {validation.blockingErrors.map((err, i) => (
                  <IssueCard key={`${err.code}-${i}`} issue={err} type="error" />
                ))}
              </div>
            )}

            {/* Inconsistencies */}
            {validation.inconsistencies.length > 0 && (
              <div className="space-y-1">
                <h3 className="text-xs font-bold uppercase tracking-wide text-amber-500">
                  Clinical Inconsistencies
                </h3>
                {validation.inconsistencies.map((msg) => (
                  <p
                    key={msg}
                    className="text-sm text-amber-700 bg-amber-50 rounded px-3 py-1.5 border border-amber-200"
                  >
                    ⚠ {msg}
                  </p>
                ))}
              </div>
            )}

            {/* Warnings */}
            {validation.warnings.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wide text-amber-500">
                  Warnings
                </h3>
                {validation.warnings.map((w, i) => (
                  <IssueCard key={`${w.code}-${i}`} issue={w} type="warning" />
                ))}
              </div>
            )}

            {/* Suggested actions */}
            {validation.suggestedNextActions.length > 0 && (
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 space-y-1">
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">
                  Suggested Next Actions
                </h3>
                {validation.suggestedNextActions.map((action) => (
                  <p key={action} className="text-sm text-gray-600">
                    → {action}
                  </p>
                ))}
              </div>
            )}

            {/* All clear */}
            {validation.blockingErrors.length === 0 && validation.warnings.length === 0 && (
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700 font-medium">
                ✓ No blocking errors or warnings — assessment is ready for supervisor approval.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-3">
        {/* Submit button — disabled until no blocking errors */}
        <button
          type="button"
          disabled={!canApprove}
          onClick={() => void approveMutation.mutateAsync()}
          className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors ${
            canApprove ? "bg-green-600 hover:bg-green-700" : "bg-gray-300 cursor-not-allowed"
          }`}
          title={
            !isSupervisor
              ? "Only supervisors and admins can approve assessments for iQIES submission"
              : blockingCount > 0
                ? `Resolve ${blockingCount} blocking error(s) first`
                : assessment.status !== "ready_for_review"
                  ? `Status must be 'ready_for_review' (currently: ${assessment.status})`
                  : "Approve for iQIES submission"
          }
        >
          {approveMutation.isPending ? "Approving…" : "Approve for Submission"}
        </button>

        {approveMutation.isError && (
          <span className="text-sm text-red-600">
            {approveMutation.error instanceof Error
              ? approveMutation.error.message
              : "Approval failed"}
          </span>
        )}

        {approveMutation.isSuccess && (
          <span className="text-sm text-green-600">✓ Approved — queued for iQIES submission</span>
        )}
      </div>

      {/* Metadata */}
      <div className="text-xs text-gray-400 border-t border-gray-100 pt-3 grid grid-cols-3 gap-4">
        <span>Patient: {assessment.patientId.slice(0, 8)}…</span>
        <span>Election date: {assessment.electionDate}</span>
        <span>Updated: {new Date(assessment.updatedAt).toLocaleString()}</span>
      </div>
    </div>
  );
}

// ── Window deadline inline ─────────────────────────────────────────────────────

function WindowDeadlineInline({
  deadline,
  status,
}: { deadline: string; status: HOPEAssessmentStatus }) {
  const today = new Date();
  const dl = new Date(deadline);
  const daysLeft = Math.ceil((dl.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  const isActive = ["draft", "in_progress", "ready_for_review"].includes(status);

  if (!isActive) return <strong>{deadline}</strong>;
  if (daysLeft < 0) {
    return <strong className="text-red-600">OVERDUE — {deadline}</strong>;
  }
  if (daysLeft === 0) {
    return <strong className="text-red-600">TODAY — {deadline}</strong>;
  }
  if (daysLeft <= 2) {
    return (
      <strong className="text-amber-600">
        {deadline} ({daysLeft}d left)
      </strong>
    );
  }
  return <strong>{deadline}</strong>;
}
