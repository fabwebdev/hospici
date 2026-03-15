// routes/_authed/patients/$patientId/clinical-notes.tsx
// Clinical Notes — encounter list with review status for a patient.
// Loads encounters + review queue items; links each to its VantageChart.

import {
  createEncounterFn,
  listEncountersFn,
} from "@/functions/vantage-chart.functions.js";
import { getReviewQueueFn } from "@/functions/noteReview.functions.js";
import type { RouterContext } from "@/routes/__root.js";
import type {
  CreateEncounterInput,
  EncounterListResponse,
  EncounterResponse,
  EncounterStatus,
  NoteReviewStatus,
  ReviewQueueResponse,
  VisitType,
} from "@hospici/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_authed/patients/$patientId/clinical-notes")({
  loader: ({
    context: { queryClient },
    params: { patientId },
  }: { context: RouterContext; params: { patientId: string } }) =>
    Promise.all([
      queryClient.ensureQueryData({
        queryKey: ["encounters", patientId],
        queryFn: () => listEncountersFn({ data: { patientId } }),
      }),
      queryClient.ensureQueryData({
        queryKey: ["review-queue", patientId],
        queryFn: () => getReviewQueueFn({ data: { patientId } }),
      }),
    ]),
  component: ClinicalNotesPage,
});

// ── Status badge helpers ───────────────────────────────────────────────────────

const ENCOUNTER_STATUS_STYLES: Record<EncounterStatus, string> = {
  DRAFT: "bg-yellow-100 text-yellow-800",
  COMPLETED: "bg-blue-100 text-blue-800",
  SIGNED: "bg-green-100 text-green-800",
};

const REVIEW_STATUS_STYLES: Record<NoteReviewStatus, string> = {
  PENDING: "bg-gray-100 text-gray-600",
  IN_REVIEW: "bg-blue-100 text-blue-700",
  REVISION_REQUESTED: "bg-amber-100 text-amber-800",
  RESUBMITTED: "bg-purple-100 text-purple-700",
  APPROVED: "bg-green-100 text-green-700",
  LOCKED: "bg-green-100 text-green-800",
  ESCALATED: "bg-red-100 text-red-800",
};

function EncounterStatusBadge({ status }: { status: EncounterStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${ENCOUNTER_STATUS_STYLES[status]}`}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
}

function ReviewStatusBadge({ status }: { status: NoteReviewStatus }) {
  const label = status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${REVIEW_STATUS_STYLES[status]}`}>
      {label}
    </span>
  );
}

// ── Visit type label ───────────────────────────────────────────────────────────

function visitTypeLabel(vt: VisitType): string {
  return vt.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── New encounter modal ────────────────────────────────────────────────────────

const VISIT_TYPES: VisitType[] = [
  "routine_rn",
  "admission",
  "recertification",
  "supervisory",
  "prn",
  "discharge",
  "social_work",
  "chaplain",
  "physician_attestation",
  "progress_note",
];

interface NewEncounterFormProps {
  patientId: string;
  onSuccess: (encounterId: string) => void;
  onCancel: () => void;
}

function NewEncounterForm({ patientId, onSuccess, onCancel }: NewEncounterFormProps) {
  const [visitType, setVisitType] = useState<VisitType>("routine_rn");
  const [visitedAt, setVisitedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [error, setError] = useState<string | null>(null);

  const { mutate, isPending } = useMutation<EncounterResponse, Error>({
    mutationFn: () =>
      createEncounterFn({
        data: {
          patientId,
          body: {
            visitType,
            visitedAt: new Date(visitedAt).toISOString(),
          } satisfies CreateEncounterInput,
        },
      }) as Promise<EncounterResponse>,
    onSuccess: (enc) => {
      onSuccess(enc.id);
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    mutate();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6 space-y-4"
      >
        <h2 className="text-base font-semibold text-gray-900">New Clinical Note</h2>

        <div className="space-y-3">
          <div>
            <label htmlFor="visitType" className="block text-xs font-medium text-gray-700 mb-1">
              Visit Type
            </label>
            <select
              id="visitType"
              value={visitType}
              onChange={(e) => setVisitType(e.target.value as VisitType)}
              className="block w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm"
            >
              {VISIT_TYPES.map((vt) => (
                <option key={vt} value={vt}>
                  {visitTypeLabel(vt)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="visitedAt" className="block text-xs font-medium text-gray-700 mb-1">
              Visit Date &amp; Time
            </label>
            <input
              id="visitedAt"
              type="datetime-local"
              value={visitedAt}
              onChange={(e) => setVisitedAt(e.target.value)}
              required
              className="block w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm"
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="text-xs text-red-600">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-gray-300 px-3.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded bg-blue-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {isPending ? "Creating…" : "Create & Open"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Encounter row ──────────────────────────────────────────────────────────────

interface EncounterRowProps {
  encounter: EncounterResponse;
  reviewStatus: NoteReviewStatus | null;
  patientId: string;
}

function EncounterRow({ encounter, reviewStatus, patientId }: EncounterRowProps) {
  const date = new Date(encounter.visitedAt);
  const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const timeStr = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

  const hasRevisions = reviewStatus === "REVISION_REQUESTED" || reviewStatus === "RESUBMITTED";
  const isEscalated = reviewStatus === "ESCALATED";

  return (
    <div
      className={`flex items-center justify-between gap-4 px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 ${
        isEscalated ? "bg-red-50" : hasRevisions ? "bg-amber-50" : ""
      }`}
    >
      {/* Left: date + type */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-900 tabular-nums">
            {dateStr}
          </span>
          <span className="text-xs text-gray-400">{timeStr}</span>
          <span className="text-xs text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
            {visitTypeLabel(encounter.visitType)}
          </span>
        </div>
        {encounter.addenda.length > 0 && (
          <p className="mt-0.5 text-xs text-gray-500">
            {encounter.addenda.length} addendum{encounter.addenda.length !== 1 ? "a" : ""}
          </p>
        )}
      </div>

      {/* Middle: status badges */}
      <div className="flex items-center gap-2 shrink-0">
        <EncounterStatusBadge status={encounter.status} />
        {reviewStatus && <ReviewStatusBadge status={reviewStatus} />}
      </div>

      {/* Right: action */}
      <div className="shrink-0">
        <Link
          to="/patients/$patientId/encounters/$encounterId/vantage-chart"
          params={{ patientId, encounterId: encounter.id }}
          className="text-xs font-medium text-blue-600 hover:text-blue-800"
        >
          {encounter.status === "DRAFT" ? "Continue" : "View"} Note →
        </Link>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

function ClinicalNotesPage() {
  const { patientId } = Route.useParams();
  const queryClient = useQueryClient();
  const [showNewForm, setShowNewForm] = useState(false);

  const { data: encounterData } = useQuery<EncounterListResponse>({
    queryKey: ["encounters", patientId],
    queryFn: () => listEncountersFn({ data: { patientId } }) as Promise<EncounterListResponse>,
  });

  const { data: reviewData } = useQuery<ReviewQueueResponse>({
    queryKey: ["review-queue", patientId],
    queryFn: () => getReviewQueueFn({ data: { patientId } }) as Promise<ReviewQueueResponse>,
  });

  // Build lookup: encounterId → reviewStatus
  const reviewMap = new Map<string, NoteReviewStatus>(
    (reviewData?.data ?? []).map((item) => [item.encounterId, item.reviewStatus]),
  );

  const encounters = (encounterData?.encounters ?? []).sort(
    (a, b) => new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime(),
  );

  // Summary counts
  const draftCount = encounters.filter((e) => e.status === "DRAFT").length;
  const pendingReviewCount = (reviewData?.data ?? []).filter(
    (r) => r.reviewStatus === "PENDING" || r.reviewStatus === "IN_REVIEW",
  ).length;
  const revisionCount = (reviewData?.data ?? []).filter(
    (r) => r.reviewStatus === "REVISION_REQUESTED",
  ).length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Clinical Notes</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {encounterData?.total ?? 0} total encounters
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNewForm(true)}
          className="rounded bg-blue-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-blue-500"
        >
          + New Note
        </button>
      </div>

      {/* Summary bar */}
      {encounters.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "Draft", count: draftCount, style: draftCount > 0 ? "bg-yellow-50 text-yellow-800" : "bg-gray-50 text-gray-500" },
            { label: "Pending Review", count: pendingReviewCount, style: pendingReviewCount > 0 ? "bg-blue-50 text-blue-800" : "bg-gray-50 text-gray-500" },
            { label: "Needs Revision", count: revisionCount, style: revisionCount > 0 ? "bg-amber-50 text-amber-800" : "bg-gray-50 text-gray-500" },
          ].map(({ label, count, style }) => (
            <div key={label} className={`rounded-lg p-3 text-center ${style}`}>
              <div className="text-2xl font-bold">{count}</div>
              <div className="text-xs font-medium">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Encounter list */}
      {encounters.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-200 py-12 text-center">
          <p className="text-sm text-gray-500">No clinical notes yet.</p>
          <p className="text-xs text-gray-400 mt-1">
            Use "New Note" to start the first VantageChart documentation.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {encounters.map((enc) => (
            <EncounterRow
              key={enc.id}
              encounter={enc}
              reviewStatus={reviewMap.get(enc.id) ?? null}
              patientId={patientId}
            />
          ))}
        </div>
      )}

      {/* New encounter modal */}
      {showNewForm && (
        <NewEncounterForm
          patientId={patientId}
          onSuccess={(encounterId) => {
            queryClient.invalidateQueries({ queryKey: ["encounters", patientId] });
            setShowNewForm(false);
            // Navigate happens via Link in the form's success — open VantageChart directly
            window.location.href = `/patients/${patientId}/encounters/${encounterId}/vantage-chart`;
          }}
          onCancel={() => setShowNewForm(false)}
        />
      )}
    </div>
  );
}
