// routes/_authed/review-queue/index.tsx
// Note Review Queue — T2-9
//
// Supervisor view: 6 client-side filter tabs + ReviewCard + RevisionHistoryPanel.
// Real-time: Socket.IO events invalidate query + show toast notification.
// Tabs: Needs Review | Revision Requested | Resubmitted | Overdue | High Priority | Billing Impact

import {
  assignReviewerFn,
  bulkAcknowledgeFn,
  escalateReviewFn,
  getReviewHistoryFn,
  getReviewQueueFn,
  submitReviewFn,
} from "@/functions/noteReview.functions.js";
import type { NoteReviewStatus, ReviewQueueItem, RevisionRequest } from "@hospici/shared-types";
import type { DeficiencyType } from "@hospici/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { diffWords } from "diff";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authed/review-queue/")({
  component: ReviewQueuePage,
});

// ── Tab definitions ───────────────────────────────────────────────────────────

type TabId =
  | "needs_review"
  | "revision_requested"
  | "resubmitted"
  | "overdue"
  | "high_priority"
  | "billing_impact";

const TABS: { id: TabId; label: string; count?: number }[] = [
  { id: "needs_review", label: "Needs Review" },
  { id: "revision_requested", label: "Revision Requested" },
  { id: "resubmitted", label: "Resubmitted" },
  { id: "overdue", label: "Overdue" },
  { id: "high_priority", label: "High Priority" },
  { id: "billing_impact", label: "Billing Impact" },
];

function applyTabFilter(items: ReviewQueueItem[], tab: TabId): ReviewQueueItem[] {
  const now = new Date();
  switch (tab) {
    case "needs_review":
      return items.filter((i) => i.reviewStatus === "PENDING" || i.reviewStatus === "IN_REVIEW");
    case "revision_requested":
      return items.filter((i) => i.reviewStatus === "REVISION_REQUESTED");
    case "resubmitted":
      return items.filter((i) => i.reviewStatus === "RESUBMITTED");
    case "overdue":
      return items.filter(
        (i) =>
          i.dueBy !== null &&
          new Date(i.dueBy) < now &&
          i.reviewStatus !== "APPROVED" &&
          i.reviewStatus !== "LOCKED",
      );
    case "high_priority":
      return items.filter((i) => i.priority >= 1);
    case "billing_impact":
      return items.filter((i) => i.billingImpact);
  }
}

// ── Status helpers ────────────────────────────────────────────────────────────

function statusChip(status: NoteReviewStatus): string {
  const map: Record<NoteReviewStatus, string> = {
    PENDING: "bg-blue-100 text-blue-800",
    IN_REVIEW: "bg-yellow-100 text-yellow-800",
    REVISION_REQUESTED: "bg-orange-100 text-orange-800",
    RESUBMITTED: "bg-purple-100 text-purple-800",
    APPROVED: "bg-green-100 text-green-800",
    LOCKED: "bg-gray-100 text-gray-800",
    ESCALATED: "bg-red-100 text-red-800",
  };
  return map[status] ?? "bg-gray-100 text-gray-800";
}

function priorityBadge(priority: number): string | null {
  if (priority === 2) return "CRITICAL";
  if (priority === 1) return "HIGH";
  return null;
}

function deficiencyChip(type: keyof typeof DeficiencyType): string {
  const map: Record<keyof typeof DeficiencyType, string> = {
    CLINICAL_SUPPORT: "bg-blue-50 text-blue-700",
    COMPLIANCE_MISSING: "bg-red-50 text-red-700",
    SIGNATURE_MISSING: "bg-orange-50 text-orange-700",
    CARE_PLAN_MISMATCH: "bg-yellow-50 text-yellow-700",
    VISIT_FREQUENCY_MISMATCH: "bg-purple-50 text-purple-700",
    MEDICATION_ISSUE: "bg-pink-50 text-pink-700",
    HOPE_RELATED: "bg-indigo-50 text-indigo-700",
    BILLING_IMPACT: "bg-green-50 text-green-700",
  };
  return map[type] ?? "bg-gray-50 text-gray-700";
}

// ── RevisionHistoryPanel ──────────────────────────────────────────────────────

function RevisionHistoryPanel({
  encounterId,
  currentDraft,
  onClose,
}: {
  encounterId: string;
  currentDraft: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["review-history", encounterId],
    queryFn: () => getReviewHistoryFn({ data: { encounterId } }),
  });

  const previousDraft =
    (data?.history[0] as { draftSnapshot?: string } | undefined)?.draftSnapshot ?? null;
  const diffResult = previousDraft && currentDraft ? diffWords(previousDraft, currentDraft) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-16">
      <div className="w-full max-w-5xl rounded-xl bg-white shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Revision History</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl font-bold"
          >
            ✕
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-500">Loading history…</div>
        ) : (
          <div className="flex-1 overflow-auto p-4">
            {diffResult ? (
              <div className="font-mono text-sm whitespace-pre-wrap leading-relaxed">
                {diffResult.map((part, i) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: stable diff output
                    key={i}
                    className={
                      part.added
                        ? "bg-green-100 text-green-900"
                        : part.removed
                          ? "bg-red-100 text-red-900 line-through"
                          : "text-gray-800"
                    }
                  >
                    {part.value}
                  </span>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2 uppercase">
                    Previous draft
                  </p>
                  <pre className="text-sm bg-gray-50 p-3 rounded whitespace-pre-wrap">
                    {previousDraft ?? "(no previous draft)"}
                  </pre>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2 uppercase">
                    Current draft
                  </p>
                  <pre className="text-sm bg-gray-50 p-3 rounded whitespace-pre-wrap">
                    {currentDraft ?? "(no current draft)"}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── ReviewCard ────────────────────────────────────────────────────────────────

function ReviewCard({
  item,
  onStatusChange,
  onAssign,
  onEscalate,
  onViewHistory,
}: {
  item: ReviewQueueItem;
  onStatusChange: (encounterId: string, status: NoteReviewStatus) => void;
  onAssign: (encounterId: string, assignedReviewerId: string) => void;
  onEscalate: (encounterId: string) => void;
  onViewHistory: (item: ReviewQueueItem) => void;
}) {
  const now = new Date();
  const isOverdue = item.dueBy !== null && new Date(item.dueBy) < now;
  const badge = priorityBadge(item.priority);
  const isLocked = item.reviewStatus === "APPROVED" || item.reviewStatus === "LOCKED";

  const uniqueDeficiencies = [
    ...new Set(item.revisionRequests.map((r: RevisionRequest) => r.deficiencyType)),
  ] as (keyof typeof DeficiencyType)[];

  return (
    <div
      className={`border rounded-lg p-4 mb-3 ${
        isOverdue ? "border-red-300 bg-red-50" : "border-gray-200 bg-white"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              to="/patients/$patientId"
              params={{ patientId: item.patientId }}
              className="font-semibold text-blue-700 hover:underline truncate"
            >
              {item.patientName}
            </Link>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusChip(item.reviewStatus)}`}
            >
              {item.reviewStatus.replace(/_/g, " ")}
            </span>
            {badge && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-800 font-bold">
                {badge}
              </span>
            )}
            {isOverdue && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-red-200 text-red-900 font-bold animate-pulse">
                OVERDUE
              </span>
            )}
            {item.billingImpact && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">
                💰 Billing
              </span>
            )}
            {item.complianceImpact && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                ⚖️ Compliance
              </span>
            )}
          </div>

          {/* Meta row */}
          <div className="text-xs text-gray-500 mt-1 flex gap-3 flex-wrap">
            <span>{item.visitType.replace(/_/g, " ")}</span>
            <span>{new Date(item.visitedAt).toLocaleDateString()}</span>
            {item.dueBy && (
              <span className={isOverdue ? "text-red-600 font-medium" : ""}>
                Due: {new Date(item.dueBy).toLocaleDateString()}
              </span>
            )}
            {item.revisionCount > 0 && <span>Revisions: {item.revisionCount}</span>}
            {item.firstPassApproved && (
              <span className="text-green-700 font-medium">✓ First pass</span>
            )}
          </div>

          {/* Deficiency chips */}
          {uniqueDeficiencies.length > 0 && (
            <div className="flex gap-1 flex-wrap mt-2">
              {uniqueDeficiencies.map((dt) => (
                <span key={dt} className={`text-xs px-2 py-0.5 rounded-full ${deficiencyChip(dt)}`}>
                  {dt.replace(/_/g, " ")}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        {!isLocked && (
          <div className="flex flex-col gap-1 shrink-0">
            {item.reviewStatus === "PENDING" && (
              <button
                type="button"
                onClick={() => onStatusChange(item.encounterId, "IN_REVIEW")}
                className="text-xs px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Start Review
              </button>
            )}
            {item.reviewStatus === "IN_REVIEW" && (
              <>
                <button
                  type="button"
                  onClick={() => onStatusChange(item.encounterId, "APPROVED")}
                  className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => onStatusChange(item.encounterId, "REVISION_REQUESTED")}
                  className="text-xs px-3 py-1 bg-orange-500 text-white rounded hover:bg-orange-600"
                >
                  Request Revision
                </button>
              </>
            )}
            {(item.reviewStatus === "IN_REVIEW" || item.reviewStatus === "REVISION_REQUESTED") && (
              <button
                type="button"
                onClick={() => onEscalate(item.encounterId)}
                className="text-xs px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700"
              >
                Escalate
              </button>
            )}
            {item.reviewStatus === "RESUBMITTED" && (
              <button
                type="button"
                onClick={() => onStatusChange(item.encounterId, "IN_REVIEW")}
                className="text-xs px-3 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700"
              >
                Re-open Review
              </button>
            )}
            <button
              type="button"
              onClick={() => onViewHistory(item)}
              className="text-xs px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
            >
              History
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function ReviewQueuePage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>("needs_review");
  const [historyItem, setHistoryItem] = useState<ReviewQueueItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [escalateTarget, setEscalateTarget] = useState<string | null>(null);
  const [escalationReason, setEscalationReason] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["review-queue"],
    queryFn: () => getReviewQueueFn({ data: {} }),
    refetchInterval: 30_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({
      encounterId,
      status,
    }: {
      encounterId: string;
      status: NoteReviewStatus;
    }) => submitReviewFn({ data: { encounterId, body: { status } } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      showToast("Review updated");
    },
  });

  const escalateMutation = useMutation({
    mutationFn: ({
      encounterId,
      reason,
    }: {
      encounterId: string;
      reason: string;
    }) =>
      escalateReviewFn({
        data: { encounterId, body: { escalationReason: reason } },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
      setEscalateTarget(null);
      setEscalationReason("");
      showToast("Review escalated");
    },
  });

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  // Socket.IO integration — invalidate on relevant events
  useEffect(() => {
    // Events emitted to the location room that warrant queue refresh
    const events = [
      "encounter:revision-requested",
      "encounter:resubmitted",
      "review:assigned",
      "review:approved",
      "review:escalated",
      "review:overdue",
    ];

    // Access the socket from window if available (set up in _authed.tsx)
    const win = window as unknown as {
      __hospiciSocket?: {
        on: (e: string, cb: () => void) => void;
        off: (e: string, cb: () => void) => void;
      };
    };
    const socket = win.__hospiciSocket;
    if (!socket) return;

    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ["review-queue"] });
    };

    for (const event of events) socket.on(event, handler);
    return () => {
      for (const event of events) socket.off(event, handler);
    };
  }, [queryClient]);

  const allItems = data?.data ?? [];
  const tabItems = applyTabFilter(allItems, activeTab);

  const tabsWithCounts = TABS.map((tab) => ({
    ...tab,
    count: applyTabFilter(allItems, tab.id).length,
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Note Review Queue</h1>
            <p className="text-sm text-gray-500 mt-1">{data?.total ?? 0} items in queue</p>
          </div>
          {allItems.filter((i) => i.reviewStatus === "PENDING").length > 0 && (
            <button
              type="button"
              onClick={() => {
                const pendingIds = allItems
                  .filter((i) => i.reviewStatus === "PENDING")
                  .map((i) => i.encounterId);
                bulkAcknowledgeFn({ data: { encounterIds: pendingIds } }).then(() => {
                  queryClient.invalidateQueries({ queryKey: ["review-queue"] });
                  showToast(`${pendingIds.length} items acknowledged`);
                });
              }}
              className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Acknowledge All Pending ({allItems.filter((i) => i.reviewStatus === "PENDING").length}
              )
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 mb-4 border-b border-gray-200 overflow-x-auto">
          {tabsWithCounts.map((tab) => (
            <button
              type="button"
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.id ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Queue list */}
        {isLoading ? (
          <div className="text-center py-12 text-gray-400">Loading queue…</div>
        ) : tabItems.length === 0 ? (
          <div className="text-center py-12 text-gray-400">No items in this view</div>
        ) : (
          <div>
            {tabItems.map((item) => (
              <ReviewCard
                key={item.encounterId}
                item={item}
                onStatusChange={(encounterId, status) =>
                  statusMutation.mutate({ encounterId, status })
                }
                onAssign={(encounterId, assignedReviewerId) =>
                  assignReviewerFn({
                    data: { encounterId, body: { assignedReviewerId } },
                  }).then(() => {
                    queryClient.invalidateQueries({ queryKey: ["review-queue"] });
                    showToast("Reviewer assigned");
                  })
                }
                onEscalate={(encounterId) => setEscalateTarget(encounterId)}
                onViewHistory={(i) => setHistoryItem(i)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Escalation dialog */}
      {escalateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h3 className="text-lg font-semibold mb-3">Escalate Review</h3>
            <p className="text-sm text-gray-600 mb-4">
              Escalation reason is required and will be logged for audit.
            </p>
            <textarea
              className="w-full border rounded-lg p-3 text-sm resize-none h-24 focus:outline-none focus:ring-2 focus:ring-red-300"
              placeholder="Describe the escalation reason…"
              value={escalationReason}
              onChange={(e) => setEscalationReason(e.target.value)}
            />
            <div className="flex gap-3 mt-4 justify-end">
              <button
                type="button"
                onClick={() => {
                  setEscalateTarget(null);
                  setEscalationReason("");
                }}
                className="text-sm px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!escalationReason.trim() || escalateMutation.isPending}
                onClick={() =>
                  escalateMutation.mutate({
                    encounterId: escalateTarget,
                    reason: escalationReason,
                  })
                }
                className="text-sm px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                Escalate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Revision history panel */}
      {historyItem && (
        <RevisionHistoryPanel
          encounterId={historyItem.encounterId}
          currentDraft={historyItem.vantageChartDraft}
          onClose={() => setHistoryItem(null)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-4 right-4 bg-gray-900 text-white text-sm px-4 py-2 rounded-lg shadow-lg z-50">
          {toast}
        </div>
      )}
    </div>
  );
}
