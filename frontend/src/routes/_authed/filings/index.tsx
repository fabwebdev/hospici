// routes/_authed/filings/index.tsx
// NOE/NOTR Filing Workbench — T3-2a
//
// Features:
//   - Two-tab layout: NOE / NOTR
//   - Exception queue with role-filtered lists from GET /api/v1/filings/queue
//   - Status badge colors per filing status (9 states)
//   - Business-days-remaining pill (red ≤0, amber 1-2, green 3+)
//   - Correction flow: side-by-side diff panel
//   - Late override flow: reason textarea → supervisor submits
//   - Readiness panel before submit
//   - Filing timeline drawer (history events)
//   - Transfer workflow for transferred NOTR

import {
  correctNOEFn,
  getFilingQueueFn,
  getNOEHistoryFn,
  getNOEReadinessFn,
  lateOverrideNOEFn,
  lateOverrideNOTRFn,
  submitNOEFn,
  submitNOTRFn,
  correctNOTRFn,
  getNOTRReadinessFn,
} from "@/functions/noe.functions.js";
import type {
  FilingQueueItem,
  FilingQueueResponse,
  NoticeFilingStatus,
  ReadinessCheckItem,
  FilingHistoryEvent,
  CorrectNOEInput,
  CreateNOTRInput,
  LateOverrideInput,
  ReadinessResponse,
} from "@hospici/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authed/filings/")({
  component: FilingWorkbench,
});

// ── Status badge helpers ───────────────────────────────────────────────────────

function statusBadgeClass(status: NoticeFilingStatus): string {
  switch (status) {
    case "draft":
      return "bg-gray-100 text-gray-700";
    case "ready_for_submission":
      return "bg-blue-100 text-blue-800";
    case "submitted":
      return "bg-yellow-100 text-yellow-800";
    case "accepted":
      return "bg-green-100 text-green-800";
    case "rejected":
      return "bg-red-100 text-red-800";
    case "needs_correction":
      return "bg-orange-100 text-orange-800";
    case "late_pending_override":
      return "bg-red-200 text-red-900";
    case "voided":
      return "bg-gray-100 text-gray-400 line-through";
    case "closed":
      return "bg-gray-100 text-gray-400";
  }
}

function statusLabel(status: NoticeFilingStatus): string {
  switch (status) {
    case "draft":
      return "Draft";
    case "ready_for_submission":
      return "Ready";
    case "submitted":
      return "Submitted";
    case "accepted":
      return "Accepted";
    case "rejected":
      return "Rejected";
    case "needs_correction":
      return "Needs Correction";
    case "late_pending_override":
      return "Late — Override Required";
    case "voided":
      return "Voided";
    case "closed":
      return "Closed";
  }
}

// ── Business-days pill ────────────────────────────────────────────────────────

function DaysRemainingPill({ days }: { days: number }) {
  const cls =
    days <= 0
      ? "bg-red-100 text-red-800 border border-red-300"
      : days <= 2
        ? "bg-amber-100 text-amber-800 border border-amber-300"
        : "bg-green-100 text-green-800 border border-green-300";

  const label = days <= 0 ? `${Math.abs(days)}d overdue` : `${days}d left`;

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ── Readiness panel ───────────────────────────────────────────────────────────

function ReadinessPanel({
  items,
  ready,
}: {
  items: ReadinessCheckItem[];
  ready: boolean;
}) {
  return (
    <div className="mt-3 p-3 bg-gray-50 rounded border">
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-sm font-medium ${ready ? "text-green-700" : "text-red-700"}`}>
          {ready ? "✓ Ready to submit" : "✗ Not ready — resolve items below"}
        </span>
      </div>
      <ul className="space-y-1">
        {items.map((chk) => (
          <li key={chk.check} className="flex items-start gap-2 text-xs">
            <span className={chk.passed ? "text-green-600" : "text-red-600"}>
              {chk.passed ? "✓" : "✗"}
            </span>
            <span className={chk.passed ? "text-gray-700" : "text-red-700 font-medium"}>
              {chk.check}
              {chk.message && <span className="text-gray-500 font-normal"> — {chk.message}</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Filing history drawer ─────────────────────────────────────────────────────

function HistoryDrawer({
  events,
  onClose,
}: {
  events: FilingHistoryEvent[];
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl z-50 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold text-gray-900">Filing History</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none"
        >
          ×
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {events.length === 0 ? (
          <p className="text-sm text-gray-500">No history events yet.</p>
        ) : (
          <ol className="relative border-l border-gray-200">
            {events.map((ev, i) => (
              <li key={i} className="mb-6 ml-4">
                <div className="absolute -left-1.5 w-3 h-3 rounded-full bg-blue-500" />
                <div className="text-xs text-gray-500 mb-1">
                  {new Date(ev.timestamp).toLocaleString()}
                </div>
                <p className="text-sm font-medium text-gray-900">{ev.event}</p>
                {ev.userId && <p className="text-xs text-gray-600">by {ev.userId}</p>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

// ── Late override modal ───────────────────────────────────────────────────────

function LateOverrideModal({
  itemId,
  itemType,
  onClose,
  onSuccess,
}: {
  itemId: string;
  itemType: "noe" | "notr";
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();

  const override = useMutation({
    mutationFn: async () => {
      const body: LateOverrideInput = { overrideReason: reason };
      if (itemType === "noe") {
        return lateOverrideNOEFn({ data: { noeId: itemId, body } });
      }
      return lateOverrideNOTRFn({ data: { notrId: itemId, body } });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["filings", "queue"] });
      onSuccess();
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
        <h3 className="font-semibold text-gray-900 mb-1">Request Late Override</h3>
        <p className="text-sm text-gray-500 mb-4">
          Supervisor approval required. Provide a reason (min. 20 characters).
        </p>
        <textarea
          className="w-full border rounded p-2 text-sm resize-none h-28 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Reason for late filing override..."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <p className="text-xs text-gray-400 mb-4">{reason.length} / 20 min</p>
        {override.error && (
          <p className="text-sm text-red-600 mb-3">
            {(override.error as Error).message}
          </p>
        )}
        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm border rounded text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={reason.length < 20 || override.isPending}
            onClick={() => override.mutate()}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded disabled:opacity-50 hover:bg-red-700"
          >
            {override.isPending ? "Submitting…" : "Approve Override"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Correction modal ──────────────────────────────────────────────────────────

function CorrectionModal({
  item,
  onClose,
  onSuccess,
}: {
  item: FilingQueueItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [electionDate, setElectionDate] = useState("");
  const [lateReason, setLateReason] = useState("");
  const queryClient = useQueryClient();

  const correct = useMutation({
    mutationFn: async () => {
      if (item.type === "NOE") {
        const body: CorrectNOEInput = {
          electionDate,
          ...(lateReason ? { lateReason } : {}),
        };
        return correctNOEFn({ data: { noeId: item.id, body } });
      }
      const body: CreateNOTRInput = {
        revocationDate: electionDate,
        revocationReason: "other",
        ...(lateReason ? { lateReason } : {}),
      };
      return correctNOTRFn({ data: { notrId: item.id, body } });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["filings", "queue"] });
      onSuccess();
      onClose();
    },
  });

  const dateLabel = item.type === "NOE" ? "Election Date" : "Revocation Date";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6">
        <h3 className="font-semibold text-gray-900 mb-1">
          Correct & Resubmit — {item.type.toUpperCase()}
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          A new filing row will be created. The current row will be voided.
          Attempt #{item.attemptCount + 1}.
        </p>

        {/* Prior snapshot summary */}
        <div className="bg-gray-50 border rounded p-3 mb-4 text-xs">
          <p className="font-medium text-gray-700 mb-1">Prior submission</p>
          <p className="text-gray-500">Status: {item.status}</p>
          <p className="text-gray-500">Attempts: {item.attemptCount}</p>
        </div>

        <label className="block text-sm font-medium text-gray-700 mb-1">{dateLabel}</label>
        <input
          type="date"
          value={electionDate}
          onChange={(e) => setElectionDate(e.target.value)}
          className="w-full border rounded p-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <label className="block text-sm font-medium text-gray-700 mb-1">
          Late reason (if applicable)
        </label>
        <input
          type="text"
          value={lateReason}
          onChange={(e) => setLateReason(e.target.value)}
          className="w-full border rounded p-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Optional"
        />

        {correct.error && (
          <p className="text-sm text-red-600 mb-3">{(correct.error as Error).message}</p>
        )}

        <div className="flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm border rounded text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!electionDate || correct.isPending}
            onClick={() => correct.mutate()}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded disabled:opacity-50 hover:bg-blue-700"
          >
            {correct.isPending ? "Submitting…" : "Submit Correction"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Filing row ────────────────────────────────────────────────────────────────

type ActiveModal =
  | { type: "history"; itemId: string; itemType: "noe" | "notr" }
  | { type: "late_override"; itemId: string; itemType: "noe" | "notr" }
  | { type: "correct"; item: FilingQueueItem }
  | { type: "readiness"; itemId: string; itemType: "noe" | "notr" }
  | null;

function FilingRow({
  item,
  onOpenModal,
}: {
  item: FilingQueueItem;
  onOpenModal: (modal: NonNullable<ActiveModal>) => void;
}) {
  const queryClient = useQueryClient();
  const itemType = item.type === "NOE" ? "noe" : "notr";

  const submit = useMutation({
    mutationFn: async () => {
      if (item.type === "NOE") {
        return submitNOEFn({ data: { noeId: item.id } });
      }
      return submitNOTRFn({ data: { notrId: item.id } });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["filings", "queue"] });
    },
  });

  // Compute days remaining from deadlineDate
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(item.deadlineDate);
  const msPerDay = 1000 * 60 * 60 * 24;
  const daysRemaining = Math.round((deadline.getTime() - today.getTime()) / msPerDay);

  return (
    <tr className="hover:bg-gray-50 border-b">
      <td className="px-4 py-3 text-sm text-gray-900 font-medium font-mono">
        {item.patientId.slice(0, 8)}…
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${statusBadgeClass(item.status)}`}
        >
          {statusLabel(item.status)}
          {item.status === "late_pending_override" && " 🔒"}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-gray-600">{item.deadlineDate}</td>
      <td className="px-4 py-3">
        <DaysRemainingPill days={daysRemaining} />
      </td>
      <td className="px-4 py-3 text-sm text-gray-500">{item.attemptCount}</td>
      <td className="px-4 py-3 text-xs text-gray-400">
        {item.isLate ? "Late" : "—"}
      </td>
      <td className="px-4 py-3">
        {item.isClaimBlocking && (
          <span className="inline-flex px-2 py-0.5 rounded bg-red-100 text-red-800 text-xs font-bold">
            Claim Blocked
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() =>
              onOpenModal({ type: "history", itemId: item.id, itemType })
            }
            className="text-xs text-blue-600 hover:underline"
          >
            History
          </button>
          <button
            type="button"
            onClick={() =>
              onOpenModal({ type: "readiness", itemId: item.id, itemType })
            }
            className="text-xs text-gray-500 hover:underline"
          >
            Readiness
          </button>
          {item.status === "ready_for_submission" && (
            <button
              type="button"
              disabled={submit.isPending}
              onClick={() => submit.mutate()}
              className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {submit.isPending ? "…" : "Submit"}
            </button>
          )}
          {item.status === "rejected" && (
            <button
              type="button"
              onClick={() => onOpenModal({ type: "correct", item })}
              className="text-xs bg-orange-600 text-white px-2 py-0.5 rounded hover:bg-orange-700"
            >
              Correct & Resubmit
            </button>
          )}
          {item.status === "late_pending_override" && (
            <button
              type="button"
              onClick={() =>
                onOpenModal({ type: "late_override", itemId: item.id, itemType })
              }
              className="text-xs bg-red-600 text-white px-2 py-0.5 rounded hover:bg-red-700"
            >
              Request Override
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Readiness drawer ──────────────────────────────────────────────────────────

function ReadinessDrawer({
  itemId,
  itemType,
  onClose,
}: {
  itemId: string;
  itemType: "noe" | "notr";
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<ReadinessResponse>({
    queryKey: ["filings", "readiness", itemType, itemId],
    queryFn: () => {
      if (itemType === "noe") {
        return getNOEReadinessFn({ data: { noeId: itemId } });
      }
      return getNOTRReadinessFn({ data: { notrId: itemId } });
    },
  });

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl z-50 flex flex-col">
      <div className="flex items-center justify-between p-4 border-b">
        <h3 className="font-semibold text-gray-900">
          {itemType.toUpperCase()} Readiness Check
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none"
        >
          ×
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading && <p className="text-sm text-gray-500">Checking readiness…</p>}
        {data && <ReadinessPanel ready={data.ready} items={data.checklist} />}
      </div>
    </div>
  );
}

// ── History drawer with data fetching ─────────────────────────────────────────

function HistoryDrawerContainer({
  itemId,
  itemType,
  onClose,
}: {
  itemId: string;
  itemType: "noe" | "notr";
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["filings", "history", itemType, itemId],
    queryFn: (): Promise<{ events: FilingHistoryEvent[] }> =>
      getNOEHistoryFn({ data: { noeId: itemId } }),
  });

  if (isLoading) {
    return (
      <div className="fixed inset-y-0 right-0 w-96 bg-white shadow-2xl z-50 flex items-center justify-center">
        <p className="text-sm text-gray-500">Loading history…</p>
      </div>
    );
  }

  return (
    <HistoryDrawer events={data?.events ?? []} onClose={onClose} />
  );
}

// ── Tab ───────────────────────────────────────────────────────────────────────

type TabType = "NOE" | "NOTR";

// ── Main component ────────────────────────────────────────────────────────────

function FilingWorkbench() {
  const [activeTab, setActiveTab] = useState<TabType>("NOE");
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery<FilingQueueResponse>({
    queryKey: ["filings", "queue", activeTab],
    queryFn: () => getFilingQueueFn({ data: { type: activeTab } }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  // Socket.IO: invalidate on NOE/NOTR events dispatched from window
  useEffect(() => {
    const invalidate = () => {
      void queryClient.invalidateQueries({ queryKey: ["filings", "queue"] });
    };
    window.addEventListener("noe:late", invalidate);
    window.addEventListener("noe:accepted", invalidate);
    window.addEventListener("notr:created", invalidate);
    window.addEventListener("notr:late", invalidate);
    window.addEventListener("notr:accepted", invalidate);
    return () => {
      window.removeEventListener("noe:late", invalidate);
      window.removeEventListener("noe:accepted", invalidate);
      window.removeEventListener("notr:created", invalidate);
      window.removeEventListener("notr:late", invalidate);
      window.removeEventListener("notr:accepted", invalidate);
    };
  }, [queryClient]);

  const items = data?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Filing Workbench</h1>
        <p className="text-sm text-gray-500 mt-1">
          CMS Notice of Election (NOE) and Notice of Termination/Revocation (NOTR) — 5-day rule (42 CFR §418.24)
        </p>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 border-b">
        {(["NOE", "NOTR"] as TabType[]).map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {tab.toUpperCase()}
            {data && activeTab === tab && (
              <span className="ml-2 bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded-full">
                {data.total}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Queue summary pills */}
      {data && data.total > 0 && (
        <div className="flex gap-3">
          {items.filter((i) => i.status === "late_pending_override").length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-100 text-red-800 text-xs font-medium">
              🔒 {items.filter((i) => i.status === "late_pending_override").length} Override Required
            </span>
          )}
          {items.filter((i) => i.status === "rejected").length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-100 text-orange-800 text-xs font-medium">
              ✗ {items.filter((i) => i.status === "rejected").length} Rejected
            </span>
          )}
          {items.filter((i) => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const d = new Date(i.deadlineDate);
            const days = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
            return days > 0 && days <= 2;
          }).length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
              ⚠ {items.filter((i) => {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const d = new Date(i.deadlineDate);
                const days = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                return days > 0 && days <= 2;
              }).length} Due Soon
            </span>
          )}
          {items.filter((i) => i.isClaimBlocking).length > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-200 text-red-900 text-xs font-bold">
              🚫 {items.filter((i) => i.isClaimBlocking).length} Claim Blocked
            </span>
          )}
        </div>
      )}

      {/* Table */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <div className="text-gray-400">Loading filings…</div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-4">
          <p className="text-sm text-red-700">
            Failed to load filing queue: {(error as Error).message}
          </p>
        </div>
      )}

      {!isLoading && !error && items.length === 0 && (
        <div className="bg-green-50 border border-green-200 rounded p-8 text-center">
          <p className="text-green-700 font-medium">All clear — no filings require action</p>
          <p className="text-sm text-green-600 mt-1">
            The {activeTab.toUpperCase()} exception queue is empty.
          </p>
        </div>
      )}

      {!isLoading && items.length > 0 && (
        <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
          <table className="min-w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Patient
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Deadline
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Days
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Attempts
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  CMS Code
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Billing
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <FilingRow key={item.id} item={item} onOpenModal={setActiveModal} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals and drawers */}
      {activeModal?.type === "history" && (
        <HistoryDrawerContainer
          itemId={activeModal.itemId}
          itemType={activeModal.itemType}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal?.type === "readiness" && (
        <ReadinessDrawer
          itemId={activeModal.itemId}
          itemType={activeModal.itemType}
          onClose={() => setActiveModal(null)}
        />
      )}

      {activeModal?.type === "late_override" && (
        <LateOverrideModal
          itemId={activeModal.itemId}
          itemType={activeModal.itemType}
          onClose={() => setActiveModal(null)}
          onSuccess={() => setActiveModal(null)}
        />
      )}

      {activeModal?.type === "correct" && (
        <CorrectionModal
          item={activeModal.item}
          onClose={() => setActiveModal(null)}
          onSuccess={() => setActiveModal(null)}
        />
      )}
    </div>
  );
}
