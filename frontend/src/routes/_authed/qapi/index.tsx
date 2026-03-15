// routes/_authed/qapi/index.tsx
// QAPI Workspace — T3-11
// Event list + Raise QAPI Event form + Event detail drawer with action items

import {
  addActionItemFn,
  closeQAPIEventFn,
  completeActionItemFn,
  createQAPIEventFn,
  getQualityOutliersFn,
  listQAPIEventsFn,
  patchQAPIEventFn,
} from "@/functions/qapi.functions.js";
import type {
  QAPIActionItem,
  QAPIEvent,
  QAPIEventStatus,
  QAPIEventType,
  QAPITrendContext,
  QualityOutlier,
} from "@hospici/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_authed/qapi/")({
  component: QAPIWorkspace,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<QAPIEventStatus, string> = {
  OPEN: "bg-yellow-100 text-yellow-800",
  IN_PROGRESS: "bg-blue-100 text-blue-800",
  CLOSED: "bg-green-100 text-green-800",
};

const EVENT_TYPE_LABELS: Record<QAPIEventType, string> = {
  ADVERSE_EVENT: "Adverse Event",
  NEAR_MISS: "Near Miss",
  COMPLAINT: "Complaint",
  GRIEVANCE: "Grievance",
  QUALITY_TREND: "Quality Trend",
};

function StatusBadge({ status }: { status: QAPIEventStatus }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[status]}`}>
      {status.replace("_", " ")}
    </span>
  );
}

// ── Raise QAPI Event Modal ─────────────────────────────────────────────────────

function RaiseEventModal({
  prefill,
  onClose,
  onCreated,
}: {
  prefill?: { description?: string; linkedTrendContext?: QAPITrendContext };
  onClose: () => void;
  onCreated: (e: QAPIEvent) => void;
}) {
  const [eventType, setEventType] = useState<QAPIEventType>("QUALITY_TREND");
  const [occurredAt, setOccurredAt] = useState(new Date().toISOString().split("T")[0] ?? "");
  const [description, setDescription] = useState(prefill?.description ?? "");
  const [rca, setRca] = useState("");

  const createMut = useMutation<QAPIEvent, Error>({
    mutationFn: () =>
      createQAPIEventFn({
        data: {
          eventType,
          occurredAt: new Date(occurredAt).toISOString(),
          description,
          rootCauseAnalysis: rca || undefined,
          linkedTrendContext: prefill?.linkedTrendContext,
        },
      }) as Promise<QAPIEvent>,
    onSuccess: (event) => {
      onCreated(event);
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-900">Raise QAPI Event</h2>

        {prefill?.linkedTrendContext && (
          <div className="text-xs bg-amber-50 border border-amber-200 rounded p-2 text-amber-800">
            Pre-filled from trend context
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Event Type</label>
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value as QAPIEventType)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            {(Object.keys(EVENT_TYPE_LABELS) as QAPIEventType[]).map((t) => (
              <option key={t} value={t}>
                {EVENT_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Occurred On</label>
          <input
            type="date"
            value={occurredAt}
            onChange={(e) => setOccurredAt(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Root Cause Analysis (optional)
          </label>
          <textarea
            value={rca}
            onChange={(e) => setRca(e.target.value)}
            rows={2}
            className="w-full border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {createMut.error && (
          <p className="text-sm text-red-600">{String(createMut.error)}</p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => createMut.mutate()}
            disabled={!description || createMut.isPending}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {createMut.isPending ? "Creating…" : "Create Event"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Event Detail Drawer ────────────────────────────────────────────────────────

function EventDetailDrawer({
  event,
  onClose,
  onUpdated,
}: {
  event: QAPIEvent;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const qc = useQueryClient();
  const [closureEvidence, setClosureEvidence] = useState("");
  const [showCloseForm, setShowCloseForm] = useState(false);
  const [newAction, setNewAction] = useState("");
  const [newAssignee, setNewAssignee] = useState("");
  const [newDueDate, setNewDueDate] = useState("");

  const closeMut = useMutation({
    mutationFn: () =>
      closeQAPIEventFn({ data: { id: event.id, body: { closureEvidence } } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["qapi-events"] });
      onUpdated();
      onClose();
    },
  });

  const addItemMut = useMutation({
    mutationFn: () =>
      addActionItemFn({
        data: {
          eventId: event.id,
          body: { action: newAction, assignedToId: newAssignee, dueDate: newDueDate },
        },
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["qapi-events"] });
      setNewAction("");
      setNewAssignee("");
      setNewDueDate("");
      onUpdated();
    },
  });

  const completeItemMut = useMutation({
    mutationFn: (itemId: string) =>
      completeActionItemFn({ data: { eventId: event.id, itemId } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["qapi-events"] });
      onUpdated();
    },
  });

  const isClosed = event.status === "CLOSED";

  return (
    <div className="fixed inset-0 z-40 flex">
      <button type="button" className="flex-1" onClick={onClose} />
      <div className="w-full max-w-xl bg-white shadow-2xl overflow-y-auto p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {EVENT_TYPE_LABELS[event.eventType]}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              Reported by {event.reportedByName} ·{" "}
              {new Date(event.occurredAt).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={event.status} />
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-xl"
            >
              ×
            </button>
          </div>
        </div>

        <div>
          <p className="text-sm text-gray-800">{event.description}</p>
          {event.rootCauseAnalysis && (
            <p className="text-xs text-gray-500 mt-2 italic">{event.rootCauseAnalysis}</p>
          )}
          {event.linkedTrendContext && (
            <div className="mt-2 text-xs bg-amber-50 border border-amber-200 rounded p-2 text-amber-700">
              Raised from trend
            </div>
          )}
        </div>

        {/* Action items */}
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Action Items</h3>
          {event.actionItems.length === 0 ? (
            <p className="text-sm text-gray-400">No action items yet.</p>
          ) : (
            <ul className="space-y-2">
              {event.actionItems.map((item: QAPIActionItem) => (
                <li
                  key={item.id}
                  className="flex items-start justify-between bg-gray-50 rounded p-2 text-sm"
                >
                  <div>
                    <p className={item.completedAt ? "line-through text-gray-400" : "text-gray-800"}>
                      {item.action}
                    </p>
                    <p className="text-xs text-gray-500">
                      → {item.assignedToName} · Due {item.dueDate}
                    </p>
                  </div>
                  {!item.completedAt && !isClosed && (
                    <button
                      type="button"
                      onClick={() => completeItemMut.mutate(item.id)}
                      className="text-xs text-green-600 hover:text-green-800 ml-2 shrink-0"
                    >
                      Complete
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {!isClosed && (
            <div className="mt-3 space-y-2">
              <input
                type="text"
                placeholder="Action description"
                value={newAction}
                onChange={(e) => setNewAction(e.target.value)}
                className="w-full border rounded px-3 py-1.5 text-sm"
              />
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Assignee user ID"
                  value={newAssignee}
                  onChange={(e) => setNewAssignee(e.target.value)}
                  className="flex-1 border rounded px-3 py-1.5 text-sm"
                />
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className="flex-1 border rounded px-3 py-1.5 text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => addItemMut.mutate()}
                disabled={!newAction || !newAssignee || !newDueDate || addItemMut.isPending}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                Add Action Item
              </button>
            </div>
          )}
        </div>

        {/* Close event */}
        {!isClosed && (
          <div>
            {!showCloseForm ? (
              <button
                type="button"
                onClick={() => setShowCloseForm(true)}
                className="px-4 py-2 text-sm bg-gray-800 text-white rounded-lg hover:bg-gray-900"
              >
                Close Event
              </button>
            ) : (
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700">
                  Closure Evidence (≥ 50 characters)
                </label>
                <textarea
                  value={closureEvidence}
                  onChange={(e) => setClosureEvidence(e.target.value)}
                  rows={3}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCloseForm(false)}
                    className="px-3 py-1.5 text-sm border rounded text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => closeMut.mutate()}
                    disabled={closureEvidence.length < 50 || closeMut.isPending}
                    className="px-3 py-1.5 text-sm bg-gray-800 text-white rounded hover:bg-gray-900 disabled:opacity-50"
                  >
                    {closeMut.isPending ? "Closing…" : "Confirm Close"}
                  </button>
                </div>
                {closeMut.error && (
                  <p className="text-sm text-red-600">{String(closeMut.error)}</p>
                )}
              </div>
            )}
          </div>
        )}

        {isClosed && (
          <div className="bg-green-50 border border-green-200 rounded p-3 text-sm text-green-800">
            <p className="font-medium">Event closed</p>
            {event.closureEvidence && (
              <p className="text-xs mt-1">{event.closureEvidence}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function QAPIWorkspace() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<QAPIEventStatus | "">("");
  const [showRaiseModal, setShowRaiseModal] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<QAPIEvent | null>(null);
  const [raisePrefill, setRaisePrefill] = useState<
    { description?: string; linkedTrendContext?: QAPITrendContext } | undefined
  >();

  const eventsQuery = useQuery({
    queryKey: ["qapi-events", statusFilter],
    queryFn: () =>
      listQAPIEventsFn({ data: statusFilter ? { status: statusFilter as QAPIEventStatus } : {} }),
  });

  const outliersQuery = useQuery({
    queryKey: ["quality-outliers"],
    queryFn: () => getQualityOutliersFn({ data: {} }),
  });

  function handleRaiseFromOutlier(outlier: QualityOutlier) {
    setRaisePrefill({
      description: `Quality outlier: ${outlier.metric} for ${outlier.subjectType} "${outlier.subjectName}" is ${(outlier.value * 100).toFixed(1)}% (threshold: ${(outlier.threshold * 100).toFixed(1)}%)`,
      linkedTrendContext: {
        metric: outlier.metric,
        value: outlier.value,
        threshold: outlier.threshold,
        subjectId: outlier.subjectId,
        detectedAt: outlier.detectedAt,
      },
    });
    setShowRaiseModal(true);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">QAPI Workspace</h1>
        <button
          type="button"
          onClick={() => {
            setRaisePrefill(undefined);
            setShowRaiseModal(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
        >
          Raise QAPI Event
        </button>
      </div>

      {/* Outlier cards */}
      {outliersQuery.data && outliersQuery.data.data.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Quality Outliers</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {outliersQuery.data.data.map((outlier: QualityOutlier, i: number) => (
              <div
                key={`${outlier.subjectId}-${i}`}
                className="bg-amber-50 border border-amber-200 rounded-lg p-3"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-amber-900">{outlier.subjectName}</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      {outlier.metric}: {(outlier.value * 100).toFixed(1)}%
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRaiseFromOutlier(outlier)}
                    className="text-xs text-amber-700 underline hover:text-amber-900"
                  >
                    Raise QAPI
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter */}
      <div className="flex gap-2">
        {(["", "OPEN", "IN_PROGRESS", "CLOSED"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
              statusFilter === s
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
            }`}
          >
            {s || "All"}
          </button>
        ))}
      </div>

      {/* Event list */}
      {eventsQuery.isLoading ? (
        <p className="text-sm text-gray-500">Loading events…</p>
      ) : eventsQuery.data?.data.length === 0 ? (
        <p className="text-sm text-gray-400">No QAPI events found.</p>
      ) : (
        <div className="space-y-2">
          {eventsQuery.data?.data.map((event: QAPIEvent) => (
            <button
              key={event.id}
              type="button"
              onClick={() => setSelectedEvent(event)}
              className="w-full text-left bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <StatusBadge status={event.status} />
                  <span className="text-sm font-medium text-gray-900">
                    {EVENT_TYPE_LABELS[event.eventType]}
                  </span>
                </div>
                <span className="text-xs text-gray-400">
                  {event.actionItems.length} action item(s)
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1 line-clamp-2">{event.description}</p>
              <p className="text-xs text-gray-400 mt-1">
                {new Date(event.occurredAt).toLocaleDateString()} · {event.reportedByName}
              </p>
            </button>
          ))}
        </div>
      )}

      {/* Modals / drawers */}
      {showRaiseModal && (
        <RaiseEventModal
          prefill={raisePrefill}
          onClose={() => setShowRaiseModal(false)}
          onCreated={() => void qc.invalidateQueries({ queryKey: ["qapi-events"] })}
        />
      )}

      {selectedEvent && (
        <EventDetailDrawer
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onUpdated={() => void qc.invalidateQueries({ queryKey: ["qapi-events"] })}
        />
      )}
    </div>
  );
}
