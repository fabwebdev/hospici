// routes/_authed/patients/$patientId/visits/index.tsx
// Visit schedule for a patient — T2-10.
// Shows scheduled visits grouped by week. Allows scheduling new visits
// and updating status (completed / missed / cancelled / reschedule).

import {
  createScheduledVisitFn,
  getScheduledVisitsFn,
  patchVisitStatusFn,
} from "@/functions/visitSchedule.functions.js";
import type {
  CreateScheduledVisitInput,
  ScheduledVisitListResponse,
  ScheduledVisitResponse,
  VisitScheduleDiscipline,
  VisitStatus,
} from "@hospici/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_authed/patients/$patientId/visits/")({
  loader: ({ context: { queryClient }, params: { patientId } }) =>
    queryClient.ensureQueryData({
      queryKey: ["scheduled-visits", patientId],
      queryFn: () => getScheduledVisitsFn({ data: { patientId } }),
    }),
  component: VisitSchedulePage,
});

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<VisitStatus, string> = {
  scheduled: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  missed: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-600",
};

function StatusBadge({ status }: { status: VisitStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ── Group visits by ISO week ───────────────────────────────────────────────────

function getISOWeek(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

function groupByWeek(
  visits: ScheduledVisitResponse[],
): Map<string, ScheduledVisitResponse[]> {
  const map = new Map<string, ScheduledVisitResponse[]>();
  for (const v of visits) {
    const wk = getISOWeek(v.scheduledDate);
    const existing = map.get(wk) ?? [];
    existing.push(v);
    map.set(wk, existing);
  }
  return map;
}

// ── New visit form ─────────────────────────────────────────────────────────────

interface NewVisitFormProps {
  patientId: string;
  onSuccess: () => void;
}

const DISCIPLINES: VisitScheduleDiscipline[] = ["RN", "SW", "CHAPLAIN", "THERAPY", "AIDE"];
const VISIT_TYPES = ["routine_rn", "admission", "recertification", "supervisory", "prn", "discharge"];

function NewVisitForm({ patientId, onSuccess }: NewVisitFormProps) {
  const [visitType, setVisitType] = useState("routine_rn");
  const [discipline, setDiscipline] = useState<VisitScheduleDiscipline>("RN");
  const [scheduledDate, setScheduledDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [visitsPerWeek, setVisitsPerWeek] = useState(3);
  const [notes, setNotes] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const { mutate, isPending } = useMutation<ScheduledVisitResponse, Error & { code?: string }>({
    mutationFn: () =>
      createScheduledVisitFn({
        data: {
          patientId,
          body: {
            visitType,
            discipline,
            scheduledDate,
            frequencyPlan: { visitsPerWeek },
            notes: notes.trim() || undefined,
          } satisfies CreateScheduledVisitInput,
        },
      }) as Promise<ScheduledVisitResponse>,
    onSuccess: () => {
      setFormError(null);
      onSuccess();
    },
    onError: (err) => {
      setFormError(err.message);
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    mutate();
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-900">Schedule New Visit</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="visitType" className="block text-xs font-medium text-gray-700 mb-1">
            Visit Type
          </label>
          <select
            id="visitType"
            value={visitType}
            onChange={(e) => setVisitType(e.target.value)}
            className="block w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            {VISIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="discipline" className="block text-xs font-medium text-gray-700 mb-1">
            Discipline
          </label>
          <select
            id="discipline"
            value={discipline}
            onChange={(e) => setDiscipline(e.target.value as VisitScheduleDiscipline)}
            className="block w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            {DISCIPLINES.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="scheduledDate" className="block text-xs font-medium text-gray-700 mb-1">
            Scheduled Date
          </label>
          <input
            id="scheduledDate"
            type="date"
            value={scheduledDate}
            onChange={(e) => setScheduledDate(e.target.value)}
            required
            className="block w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label htmlFor="visitsPerWeek" className="block text-xs font-medium text-gray-700 mb-1">
            Visits/Week (frequency plan)
          </label>
          <input
            id="visitsPerWeek"
            type="number"
            min={1}
            max={14}
            value={visitsPerWeek}
            onChange={(e) => setVisitsPerWeek(Number(e.target.value))}
            required
            className="block w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
      </div>
      <div>
        <label htmlFor="notes" className="block text-xs font-medium text-gray-700 mb-1">
          Notes (optional)
        </label>
        <textarea
          id="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Per POC order…"
          className="block w-full rounded border border-gray-300 px-2 py-1.5 text-sm resize-none"
        />
      </div>
      {formError && (
        <p role="alert" className="text-xs text-red-600">{formError}</p>
      )}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
      >
        {isPending ? "Scheduling…" : "Schedule Visit"}
      </button>
    </form>
  );
}

// ── Visit row ──────────────────────────────────────────────────────────────────

interface VisitRowProps {
  visit: ScheduledVisitResponse;
  onStatusChange: (visitId: string, status: VisitStatus, missedReason?: string) => void;
  isPending: boolean;
}

function VisitRow({ visit, onStatusChange, isPending }: VisitRowProps) {
  const [showMissedInput, setShowMissedInput] = useState(false);
  const [missedReason, setMissedReason] = useState("");

  const isTerminal = visit.status === "completed";
  const canMarkCompleted = visit.status === "scheduled";
  const canMarkMissed = visit.status === "scheduled";
  const canCancel = visit.status === "scheduled";
  const canReschedule = visit.status === "missed" || visit.status === "cancelled";

  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-gray-100 last:border-0">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">
            {visit.scheduledDate}
          </span>
          <StatusBadge status={visit.status} />
          <span className="text-xs text-gray-500 bg-gray-100 rounded px-1.5 py-0.5">
            {visit.discipline}
          </span>
          <span className="text-xs text-gray-500">
            {visit.visitType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </span>
        </div>
        <div className="mt-0.5 text-xs text-gray-500">
          {visit.frequencyPlan.visitsPerWeek}x/week planned
          {visit.notes ? ` · ${visit.notes}` : ""}
        </div>
        {visit.missedReason && (
          <div className="mt-0.5 text-xs text-red-600">Reason: {visit.missedReason}</div>
        )}
        {showMissedInput && (
          <div className="mt-2 flex gap-2 items-center">
            <input
              type="text"
              placeholder="Reason for missed visit (optional)"
              value={missedReason}
              onChange={(e) => setMissedReason(e.target.value)}
              className="text-xs rounded border border-gray-300 px-2 py-1 flex-1"
            />
            <button
              type="button"
              onClick={() => {
                onStatusChange(visit.id, "missed", missedReason || undefined);
                setShowMissedInput(false);
              }}
              className="text-xs rounded bg-red-600 text-white px-2 py-1 hover:bg-red-500"
            >
              Confirm
            </button>
            <button
              type="button"
              onClick={() => setShowMissedInput(false)}
              className="text-xs rounded border border-gray-300 px-2 py-1 hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {!isTerminal && (
        <div className="flex items-center gap-1.5 shrink-0">
          {canMarkCompleted && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => onStatusChange(visit.id, "completed")}
              className="text-xs rounded bg-green-600 text-white px-2 py-1 hover:bg-green-500 disabled:opacity-50"
            >
              Complete
            </button>
          )}
          {canMarkMissed && !showMissedInput && (
            <button
              type="button"
              onClick={() => setShowMissedInput(true)}
              className="text-xs rounded border border-red-300 text-red-700 px-2 py-1 hover:bg-red-50"
            >
              Missed
            </button>
          )}
          {canCancel && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => onStatusChange(visit.id, "cancelled")}
              className="text-xs rounded border border-gray-300 text-gray-600 px-2 py-1 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          )}
          {canReschedule && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => onStatusChange(visit.id, "scheduled")}
              className="text-xs rounded border border-blue-300 text-blue-700 px-2 py-1 hover:bg-blue-50 disabled:opacity-50"
            >
              Reschedule
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

function VisitSchedulePage() {
  const { patientId } = Route.useParams();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading } = useQuery<ScheduledVisitListResponse>({
    queryKey: ["scheduled-visits", patientId],
    queryFn: () => getScheduledVisitsFn({ data: { patientId } }),
  });

  const { mutate: updateStatus, isPending: isStatusPending } = useMutation<
    ScheduledVisitResponse,
    Error & { code?: string },
    { visitId: string; status: VisitStatus; missedReason?: string }
  >({
    mutationFn: ({ visitId, status, missedReason }) =>
      patchVisitStatusFn({
        data: {
          visitId,
          body: { status, ...(missedReason ? { missedReason } : {}) },
        },
      }) as Promise<ScheduledVisitResponse>,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scheduled-visits", patientId] });
    },
  });

  const visits = data?.data ?? [];
  const grouped = groupByWeek(visits);
  const weeks = Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b));

  const missedCount = visits.filter((v) => v.status === "missed").length;
  const completedCount = visits.filter((v) => v.status === "completed").length;
  const scheduledCount = visits.filter((v) => v.status === "scheduled").length;

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <Link
            to="/patients/$patientId"
            params={{ patientId }}
            className="text-blue-600 hover:text-blue-900 text-sm"
          >
            ← Back to Patient
          </Link>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">Visit Schedule</h1>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
        >
          {showForm ? "Cancel" : "+ Schedule Visit"}
        </button>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Scheduled", count: scheduledCount, color: "bg-blue-50 text-blue-700" },
          { label: "Completed", count: completedCount, color: "bg-green-50 text-green-700" },
          { label: "Missed", count: missedCount, color: missedCount > 0 ? "bg-red-50 text-red-700" : "bg-gray-50 text-gray-500" },
        ].map(({ label, count, color }) => (
          <div key={label} className={`rounded-lg p-3 text-center ${color}`}>
            <div className="text-2xl font-bold">{count}</div>
            <div className="text-xs font-medium">{label}</div>
          </div>
        ))}
      </div>

      {/* New visit form */}
      {showForm && (
        <div className="mb-6">
          <NewVisitForm
            patientId={patientId}
            onSuccess={() => {
              setShowForm(false);
              queryClient.invalidateQueries({ queryKey: ["scheduled-visits", patientId] });
            }}
          />
        </div>
      )}

      {/* Visit list grouped by week */}
      {isLoading ? (
        <div className="text-sm text-gray-500 text-center py-8">Loading visits…</div>
      ) : weeks.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <p className="text-sm">No visits scheduled yet.</p>
          <p className="text-xs mt-1">Use the button above to schedule the first visit.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {weeks.map(([week, weekVisits]) => {
            const weekCompleted = weekVisits.filter((v) => v.status === "completed").length;
            const weekPlanned = weekVisits[0]?.frequencyPlan.visitsPerWeek ?? 0;
            const isVariance = weekCompleted < weekPlanned && weekVisits.every((v) => v.status !== "scheduled");

            return (
              <div key={week} className="bg-white rounded-lg border border-gray-200">
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-900">{week}</h2>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">
                      {weekCompleted}/{weekPlanned} planned
                    </span>
                    {isVariance && (
                      <span className="inline-flex items-center rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-medium">
                        Frequency variance
                      </span>
                    )}
                  </div>
                </div>
                <div className="px-4">
                  {weekVisits.map((visit) => (
                    <VisitRow
                      key={visit.id}
                      visit={visit}
                      isPending={isStatusPending}
                      onStatusChange={(visitId, status, missedReason) =>
                        updateStatus({ visitId, status, missedReason })
                      }
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
