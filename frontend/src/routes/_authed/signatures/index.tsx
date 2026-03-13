// routes/_authed/signatures/index.tsx
// Electronic signature workbench — outstanding signatures queue

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  getOutstandingSignaturesFn,
  sendForSignatureFn,
  voidSignatureFn,
} from "@/functions/signature.functions.js";
import type { OutstandingSignatureItem } from "@hospici/shared-types";
import {
  SIGNATURE_STATUS_LABELS,
  DOCUMENT_TYPE_LABELS,
} from "@hospici/shared-types";

export const Route = createFileRoute("/_authed/signatures/")({
  component: SignatureWorkbenchPage,
  loader: async ({ context }) => {
    await context.queryClient.prefetchQuery({
      queryKey: ["outstanding-signatures"],
      queryFn: () => getOutstandingSignaturesFn({}),
    });
  },
});

function SignatureCard({
  item,
  onSend,
  onVoid,
}: {
  item: OutstandingSignatureItem;
  onSend: (id: string) => void;
  onVoid: (id: string) => void;
}) {
  const isOverdue = item.daysOutstanding > 7;

  return (
    <div className="border rounded-lg p-4 hover:shadow-md transition-shadow bg-white">
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">
              <Link
                to="/patients/$patientId"
                params={{ patientId: item.patientId }}
                className="hover:underline text-blue-600"
              >
                {item.patientName}
              </Link>
            </h3>
            <span className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-800">
              {SIGNATURE_STATUS_LABELS[item.status]}
            </span>
            {isOverdue && (
              <span className="px-2 py-0.5 text-xs rounded bg-red-100 text-red-800">
                {item.daysOutstanding}d overdue
              </span>
            )}
          </div>
          <p className="text-sm text-gray-600">
            {DOCUMENT_TYPE_LABELS[item.documentType]}
          </p>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>Requested {new Date(item.requestedAt).toLocaleDateString()}</span>
            {item.sentAt && (
              <span>Sent {new Date(item.sentAt).toLocaleDateString()}</span>
            )}
            <span>Signatures: {item.signatureCount}</span>
            {item.requireCountersign && (
              <span className="text-xs border px-1 rounded">Countersign required</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/patients/$patientId"
            params={{ patientId: item.patientId }}
            className="text-sm text-blue-600 hover:underline"
          >
            View
          </Link>
          {item.status === "READY_FOR_SIGNATURE" && (
            <button
              className="px-3 py-1 text-sm border rounded hover:bg-gray-50"
              onClick={() => onSend(item.id)}
            >
              Send
            </button>
          )}
          <button
            className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
            onClick={() => onVoid(item.id)}
          >
            Void
          </button>
        </div>
      </div>
    </div>
  );
}

function SignatureWorkbenchPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<"all" | "pending" | "sent" | "overdue" | "exception">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["outstanding-signatures"],
    queryFn: () => getOutstandingSignaturesFn({}),
  });

  const sendMutation = useMutation({
    mutationFn: ({ requestId }: { requestId: string }) => 
      sendForSignatureFn({ data: { requestId } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outstanding-signatures"] });
    },
  });

  const voidMutation = useMutation({
    mutationFn: ({ requestId }: { requestId: string }) =>
      voidSignatureFn({ data: { requestId, input: { reason: "Voided from workbench" } } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outstanding-signatures"] });
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4" />
          <div className="h-32 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  const outstanding = data ?? { pending: [], sent: [], overdue: [], exception: [] };
  const allItems = [
    ...outstanding.pending,
    ...outstanding.sent,
    ...outstanding.overdue,
    ...outstanding.exception,
  ];

  const getItemsForTab = () => {
    switch (activeTab) {
      case "pending": return outstanding.pending;
      case "sent": return outstanding.sent;
      case "overdue": return outstanding.overdue;
      case "exception": return outstanding.exception;
      default: return allItems;
    }
  };

  const items = getItemsForTab();

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Signature Workbench</h1>
          <p className="text-gray-600">
            Manage outstanding signature requests and track document signing workflow
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 text-sm border rounded bg-red-50 text-red-700">
            {outstanding.overdue.length} Overdue
          </span>
          <span className="px-3 py-1 text-sm border rounded bg-yellow-50 text-yellow-700">
            {outstanding.pending.length + outstanding.sent.length} Pending
          </span>
        </div>
      </div>

      <div className="border-b">
        <div className="flex gap-4">
          {[
            { key: "all", label: "All", count: allItems.length },
            { key: "pending", label: "Pending", count: outstanding.pending.length },
            { key: "sent", label: "Sent", count: outstanding.sent.length },
            { key: "overdue", label: "Overdue", count: outstanding.overdue.length },
            { key: "exception", label: "Partial", count: outstanding.exception.length },
          ].map((tab) => (
            <button
              key={tab.key}
              className={`px-4 py-2 text-sm font-medium border-b-2 ${
                activeTab === tab.key
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-600 hover:text-gray-800"
              }`}
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
            >
              {tab.label} ({tab.count})
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        {items.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <div className="text-4xl mb-2">✓</div>
            No {activeTab === "all" ? "outstanding" : activeTab} signature requests
          </div>
        ) : (
          items.map((item) => (
            <SignatureCard
              key={item.id}
              item={item}
              onSend={(id) => sendMutation.mutate({ requestId: id })}
              onVoid={(id) => voidMutation.mutate({ requestId: id })}
            />
          ))
        )}
      </div>
    </div>
  );
}
