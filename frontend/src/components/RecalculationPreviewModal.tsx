// components/RecalculationPreviewModal.tsx
// Diff table + confirm button + expiry countdown for cascade recalculation — T3-4

import { recalculateCommitFn } from "@/functions/benefit-period.functions.js";
import type { RecalculationPreview } from "@hospici/shared-types";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";

// ── Countdown hook ────────────────────────────────────────────────────────────

function useCountdown(expiresAt: string): number {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)),
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining((r) => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return remaining;
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface RecalculationPreviewModalProps {
  periodId: string;
  preview: RecalculationPreview;
  onClose: () => void;
  onSuccess: () => void;
}

// ── Main component ────────────────────────────────────────────────────────────

export function RecalculationPreviewModal({
  periodId,
  preview,
  onClose,
  onSuccess,
}: RecalculationPreviewModalProps) {
  const countdown = useCountdown(preview.expiresAt);
  const isExpired = countdown === 0;

  const mutation = useMutation({
    mutationFn: () =>
      recalculateCommitFn({ data: { id: periodId, previewToken: preview.previewToken } }),
    onSuccess: () => {
      onSuccess();
      onClose();
    },
  });

  function formatSeconds(s: number): string {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <div>
            <h2 className="font-semibold text-gray-900 text-lg">Recalculation Preview</h2>
            <p className="text-sm text-gray-500 mt-0.5">{preview.changesSummary}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl px-2"
          >
            ×
          </button>
        </div>

        {/* Countdown */}
        <div
          className={`px-5 py-2 text-sm font-medium ${
            isExpired
              ? "bg-red-50 text-red-700"
              : countdown < 60
                ? "bg-amber-50 text-amber-700"
                : "bg-blue-50 text-blue-700"
          }`}
        >
          {isExpired
            ? "Preview expired — close and generate a new preview"
            : `Preview expires in ${formatSeconds(countdown)}`}
        </div>

        {/* Diff table */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {preview.affectedPeriods.length === 0 ? (
            <div className="text-center text-gray-400 py-6">
              No changes detected — periods are already aligned.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-gray-500 text-left">
                  <th className="pb-2 font-medium">Period #</th>
                  <th className="pb-2 font-medium">Field</th>
                  <th className="pb-2 font-medium text-red-700">Old Value</th>
                  <th className="pb-2 font-medium text-green-700">New Value</th>
                </tr>
              </thead>
              <tbody>
                {(
                  preview.affectedPeriods as Array<{
                    id: string;
                    periodNumber: number;
                    field: string;
                    oldValue: unknown;
                    newValue: unknown;
                  }>
                ).map((ap, idx) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static preview list
                  <tr key={idx} className="border-b hover:bg-gray-50">
                    <td className="py-2 font-medium">{ap.periodNumber}</td>
                    <td className="py-2 text-gray-600">{ap.field}</td>
                    <td className="py-2 text-red-600 font-mono">{String(ap.oldValue)}</td>
                    <td className="py-2 text-green-600 font-mono">{String(ap.newValue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="border-t px-5 py-4 flex items-center justify-between">
          <div className="text-xs text-gray-400">Token: {preview.previewToken.slice(0, 8)}...</div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm border rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={isExpired || mutation.isPending || preview.affectedPeriods.length === 0}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {mutation.isPending ? "Applying..." : "Confirm Recalculation"}
            </button>
          </div>
        </div>

        {mutation.isError && (
          <div className="px-5 pb-3 text-red-600 text-sm">
            {mutation.error instanceof Error
              ? mutation.error.message
              : "Failed to commit recalculation"}
          </div>
        )}
      </div>
    </div>
  );
}
