// routes/_authed/patients/$patientId/team-comm.tsx
// Patient Team Comm tab — secure HIPAA-compliant IDT messaging
// Layout: thread list (280px) | message pane (fill) | context panel (260px)

import {
  getCommMessagesFn,
  getCommThreadsFn,
  sendCommMessageFn,
} from "@/functions/team-comm.functions.js";
import type {
  CommMessageListResponse,
  CommMessageResponse,
  CommThreadListResponse,
  CommThreadResponse,
} from "@hospici/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_authed/patients/$patientId/team-comm")({
  component: PatientTeamCommPage,
});

function ThreadItem({
  thread,
  active,
  onSelect,
}: {
  thread: CommThreadResponse;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${active ? "bg-blue-50 border-l-2 border-l-blue-600" : ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium text-gray-900 truncate">{thread.subject}</span>
        <span className="shrink-0 text-xs text-gray-400">{thread.messageCount}</span>
      </div>
      {thread.lastMessageBody && (
        <p className="text-xs text-gray-500 mt-0.5 truncate">{thread.lastMessageBody}</p>
      )}
      {thread.lastMessageAt && (
        <p className="text-xs text-gray-400 mt-1">
          {new Date(thread.lastMessageAt).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </p>
      )}
    </button>
  );
}

function MessageBubble({ message, isMe }: { message: CommMessageResponse; isMe: boolean }) {
  const initials = (message.authorUserId ?? "?")[0]?.toUpperCase() ?? "?";
  return (
    <div className={`flex gap-3 ${isMe ? "flex-row-reverse" : ""}`}>
      <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center shrink-0">
        <span className="text-white text-xs font-semibold">{initials}</span>
      </div>
      <div className={`max-w-[65%] flex flex-col ${isMe ? "items-end" : "items-start"}`}>
        <div
          className={`rounded-lg px-3 py-2 text-sm ${isMe ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-800"}`}
        >
          {message.body}
        </div>
        <span className="text-xs text-gray-400 mt-1">
          {new Date(message.sentAt).toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          })}
        </span>
      </div>
    </div>
  );
}

function PatientTeamCommPage() {
  const { patientId } = Route.useParams();
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const queryClient = useQueryClient();

  const { data: threadsData, isLoading: threadsLoading } = useQuery<CommThreadListResponse>({
    queryKey: ["comm-threads", patientId],
    queryFn: () => getCommThreadsFn({ data: { patientId } }),
  });

  const threads = threadsData?.threads ?? [];
  const activeThread = threads.find((t) => t.id === activeThreadId) ?? threads[0] ?? null;
  const resolvedThreadId = activeThread?.id ?? null;

  const { data: messagesData, isLoading: messagesLoading } = useQuery<CommMessageListResponse>({
    queryKey: ["comm-messages", patientId, resolvedThreadId],
    queryFn: () =>
      getCommMessagesFn({ data: { patientId, threadId: resolvedThreadId as string } }),
    enabled: resolvedThreadId !== null,
  });

  const messages = messagesData?.messages ?? [];

  const { mutate: sendMessage, isPending: sending } = useMutation({
    mutationFn: (body: string) =>
      sendCommMessageFn({
        data: { patientId, threadId: resolvedThreadId as string, body },
      }),
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: ["comm-messages", patientId, resolvedThreadId] });
      void queryClient.invalidateQueries({ queryKey: ["comm-threads", patientId] });
    },
  });

  function handleSend() {
    const trimmed = draft.trim();
    if (!trimmed || !resolvedThreadId) return;
    sendMessage(trimmed);
  }

  return (
    <div className="flex h-[calc(100vh-170px)] min-h-[500px]">
      {/* Thread list */}
      <div className="w-[280px] shrink-0 border-r border-gray-200 flex flex-col bg-white">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900">Conversations</h3>
          <span className="text-xs text-gray-400">{threadsData?.total ?? 0}</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          {threadsLoading ? (
            <div className="p-4 text-xs text-gray-400">Loading…</div>
          ) : threads.length === 0 ? (
            <div className="p-4 text-xs text-gray-400">No conversations yet.</div>
          ) : (
            threads.map((t) => (
              <ThreadItem
                key={t.id}
                thread={t}
                active={t.id === (activeThreadId ?? threads[0]?.id)}
                onSelect={() => setActiveThreadId(t.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* Message pane */}
      <div className="flex-1 flex flex-col bg-white border-r border-gray-200">
        {activeThread ? (
          <>
            <div className="px-5 py-3 border-b border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900">{activeThread.subject}</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {activeThread.messageCount} message{activeThread.messageCount !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {messagesLoading ? (
                <div className="text-xs text-gray-400">Loading messages…</div>
              ) : messages.length === 0 ? (
                <div className="text-xs text-gray-400 italic">No messages in this thread.</div>
              ) : (
                messages.map((m) => (
                  <MessageBubble key={m.id} message={m} isMe={false} />
                ))
              )}
            </div>
            {/* Compose */}
            <div className="px-4 py-3 border-t border-gray-200 flex gap-3 items-end">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={2}
                placeholder="Type a secure message… (PHI — do not paste outside this system)"
                className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSend();
                }}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={!draft.trim() || sending}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50"
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Select a conversation
          </div>
        )}
      </div>

      {/* Context panel */}
      <div className="w-[260px] shrink-0 bg-gray-50 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Patient Context
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold text-amber-700">Compliance Notice</p>
            <p className="text-xs text-amber-600 mt-1">
              All messages are PHI. Retained per 45 CFR §164.530(j) for 6 years. Do not screenshot
              or copy outside this system.
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <p className="text-xs font-semibold text-gray-700 mb-2">Keyboard</p>
            <p className="text-xs text-gray-500">⌘↵ / Ctrl↵ to send</p>
          </div>
        </div>
      </div>
    </div>
  );
}
