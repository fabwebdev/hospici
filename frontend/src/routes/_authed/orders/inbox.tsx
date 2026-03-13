// routes/_authed/orders/inbox.tsx
// T3-9: Physician Order Inbox — 5-tab view with real-time Socket.IO updates

import { listOrderInboxFn } from "@/functions/orders.functions.js";
import { computeOrderUrgency } from "@/lib/order-urgency.js";
import type { OrderInboxResponse, OrderResponse } from "@hospici/shared-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authed/orders/inbox")({
  component: PhysicianOrderInboxPage,
});

type InboxTab = "pending" | "overdue" | "rejected" | "exceptions" | "completed";

const TAB_LABELS: Record<InboxTab, string> = {
  pending: "Pending",
  overdue: "Overdue",
  rejected: "Rejected",
  exceptions: "Exceptions",
  completed: "Completed",
};

const ORDER_TYPE_BADGE: Record<string, string> = {
  VERBAL: "bg-orange-100 text-orange-800",
  DME: "bg-blue-100 text-blue-800",
  FREQUENCY_CHANGE: "bg-purple-100 text-purple-800",
  MEDICATION: "bg-green-100 text-green-800",
  F2F_DOCUMENTATION: "bg-red-100 text-red-800",
};

const STATUS_BADGE: Record<string, string> = {
  PENDING_SIGNATURE: "bg-yellow-100 text-yellow-800",
  VIEWED: "bg-blue-100 text-blue-800",
  SIGNED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  EXPIRED: "bg-gray-100 text-gray-800",
  VOIDED: "bg-gray-100 text-gray-500",
  NO_SIGNATURE_REQUIRED: "bg-purple-100 text-purple-800",
  COMPLETED_RETURNED: "bg-teal-100 text-teal-800",
  DRAFT: "bg-gray-100 text-gray-600",
};

function UrgencyPill({ dueAt, status }: { dueAt: string; status: string }) {
  const info = computeOrderUrgency(dueAt, status);
  if (!info.label) return null;
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${info.color}`}>
      {info.label}
    </span>
  );
}

function OrderCard({
  order,
  onSign,
  onReject,
  onException,
  isSupervisor,
}: {
  order: OrderResponse;
  onSign: (id: string) => void;
  onReject: (id: string) => void;
  onException: (id: string) => void;
  isSupervisor: boolean;
}) {
  const isActionable = order.status === "PENDING_SIGNATURE" || order.status === "VIEWED";

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
      {/* Blocked downstream banner */}
      {order.blockedDownstream && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          <span className="text-amber-600 text-xs font-medium">{order.blockedDownstream}</span>
        </div>
      )}

      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${ORDER_TYPE_BADGE[order.type] ?? "bg-gray-100"}`}
            >
              {order.type.replace(/_/g, " ")}
            </span>
            <span
              className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[order.status] ?? "bg-gray-100"}`}
            >
              {order.status.replace(/_/g, " ")}
            </span>
            <UrgencyPill dueAt={order.dueAt} status={order.status} />
          </div>
          <p className="text-sm text-gray-500">
            Patient:{" "}
            <span className="font-mono text-xs text-gray-700">{order.patientId}</span>
          </p>
          {order.urgencyReason && (
            <p className="text-xs text-gray-500 italic">{order.urgencyReason}</p>
          )}
          <p className="text-xs text-gray-400">
            Due: {new Date(order.dueAt).toLocaleDateString("en-US", { dateStyle: "medium" })}
            {order.reminderCount > 0 && (
              <span className="ml-2 text-amber-500">
                ({order.reminderCount} reminder{order.reminderCount !== 1 ? "s" : ""} sent)
              </span>
            )}
          </p>
        </div>
      </div>

      {order.content && (
        <p className="text-sm text-gray-700 line-clamp-2 border-t border-gray-100 pt-2">
          {order.content}
        </p>
      )}

      {isActionable && (
        <div className="flex items-center gap-2 pt-1">
          {/* Sign button — placeholder for T3-5 signature drawer integration */}
          <button
            type="button"
            onClick={() => onSign(order.id)}
            className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 font-medium"
          >
            Sign
          </button>
          <button
            type="button"
            onClick={() => onReject(order.id)}
            className="px-3 py-1.5 bg-red-50 text-red-700 text-sm rounded hover:bg-red-100 border border-red-200 font-medium"
          >
            Reject
          </button>
          {isSupervisor && (
            <button
              type="button"
              onClick={() => onException(order.id)}
              className="px-3 py-1.5 bg-purple-50 text-purple-700 text-sm rounded hover:bg-purple-100 border border-purple-200 font-medium"
            >
              No Sig Required
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PhysicianOrderInboxPage() {
  const [activeTab, setActiveTab] = useState<InboxTab>("pending");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<OrderInboxResponse>({
    queryKey: ["orders", "inbox", activeTab],
    queryFn: () => listOrderInboxFn({ data: { status: activeTab === "pending" ? undefined : activeTab.toUpperCase() } }),
  });

  // Socket.IO listener: refresh counts when order:overdue fires
  useEffect(() => {
    // The socket connection is managed globally; here we listen to window events
    // dispatched by the socket plugin when order:overdue is received.
    function handleOrderOverdue() {
      void queryClient.invalidateQueries({ queryKey: ["orders", "inbox"] });
    }
    window.addEventListener("order:overdue", handleOrderOverdue);
    return () => {
      window.removeEventListener("order:overdue", handleOrderOverdue);
    };
  }, [queryClient]);

  // Placeholder handlers — in production these open modals/drawers
  function handleSign(orderId: string) {
    // T3-5 signature drawer integration point
    void orderId;
  }

  function handleReject(orderId: string) {
    // Open rejection reason modal
    void orderId;
  }

  function handleException(orderId: string) {
    // Open no-signature-required modal
    void orderId;
  }

  const counts = data?.counts;
  const items = data?.items ?? [];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Physician Order Inbox</h1>
        <p className="text-sm text-gray-500 mt-1">
          Review and sign pending physician orders
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200 mb-6">
        {(Object.entries(TAB_LABELS) as [InboxTab, string][]).map(([tab, label]) => {
          const count =
            tab === "pending"
              ? counts?.pending
              : tab === "overdue"
                ? counts?.overdue
                : tab === "rejected"
                  ? counts?.rejected
                  : tab === "exceptions"
                    ? counts?.exceptions
                    : counts?.completed;

          return (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-900"
              }`}
            >
              {label}
              {count !== undefined && count > 0 && (
                <span
                  className={`ml-1.5 px-1.5 py-0.5 text-xs rounded-full ${
                    tab === "overdue"
                      ? "bg-red-100 text-red-700"
                      : "bg-gray-100 text-gray-700"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Order list */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading orders...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          No {TAB_LABELS[activeTab].toLowerCase()} orders
        </div>
      ) : (
        <div className="space-y-4">
          {items.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              onSign={handleSign}
              onReject={handleReject}
              onException={handleException}
              isSupervisor={false}
            />
          ))}
        </div>
      )}
    </div>
  );
}
