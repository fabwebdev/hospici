// routes/_authed/patients/$patientId/audit-export.tsx
// T3-10: ADR / TPE / Survey Record Packet Export — patient-scoped page.

import {
  createAuditExportFn,
  getAuditExportDownloadUrlFn,
  listAuditExportsFn,
} from "@/functions/audit-export.functions.js";
import type {
  AuditRecordExport,
  AuditRecordExportManifest,
  CreateAuditRecordExportInput,
  ExportPurpose,
  ExportSectionKey,
  ExportStatus,
} from "@hospici/shared-types";
import {
  CANONICAL_SECTION_ORDER,
  EXPORT_PURPOSE_LABELS,
  EXPORT_SECTION_LABELS,
  EXPORT_STATUS_LABELS,
} from "@hospici/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute(
  "/_authed/patients/$patientId/audit-export",
)({
  component: AuditExportPage,
});

// ── Status badge styles ───────────────────────────────────────────────────────

const STATUS_BADGE: Record<ExportStatus, string> = {
  REQUESTED: "bg-gray-100 text-gray-600",
  GENERATING: "bg-blue-100 text-blue-800",
  READY: "bg-green-100 text-green-800",
  EXPORTED: "bg-teal-100 text-teal-800",
  FAILED: "bg-red-100 text-red-800",
};

// ── Purpose options ───────────────────────────────────────────────────────────

const PURPOSE_OPTIONS = (Object.entries(EXPORT_PURPOSE_LABELS) as [ExportPurpose, string][]).map(
  ([value, label]) => ({ value, label }),
);

// ── Section checkboxes (ordered) ──────────────────────────────────────────────

const SELECTABLE_SECTIONS: ExportSectionKey[] = CANONICAL_SECTION_ORDER.filter(
  (k) => k !== "AUDIT_LOG" && k !== "COMPLETENESS_SUMMARY",
);

// ── Form state ────────────────────────────────────────────────────────────────

interface ExportFormState {
  purpose: ExportPurpose;
  dateRangeFrom: string;
  dateRangeTo: string;
  selectedSections: ExportSectionKey[];
  includeAuditLog: boolean;
  includeCompletenessSummary: boolean;
}

const DEFAULT_FORM: ExportFormState = {
  purpose: "ADR",
  dateRangeFrom: "",
  dateRangeTo: "",
  selectedSections: [...SELECTABLE_SECTIONS],
  includeAuditLog: false,
  includeCompletenessSummary: false,
};

// ── Request export modal ──────────────────────────────────────────────────────

function RequestExportModal({
  patientId,
  onClose,
}: {
  patientId: string;
  onClose: () => void;
}) {
  const [form, setForm] = useState<ExportFormState>(DEFAULT_FORM);
  const queryClient = useQueryClient();

  const { mutate, isPending, error } = useMutation({
    mutationFn: (input: CreateAuditRecordExportInput) =>
      createAuditExportFn({ data: { patientId, body: input } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["audit-exports", patientId] });
      onClose();
    },
  });

  function toggleSection(key: ExportSectionKey) {
    setForm((f) => ({
      ...f,
      selectedSections: f.selectedSections.includes(key)
        ? f.selectedSections.filter((s) => s !== key)
        : [...f.selectedSections, key],
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutate({
      purpose: form.purpose,
      dateRangeFrom: form.dateRangeFrom,
      dateRangeTo: form.dateRangeTo,
      selectedSections: form.selectedSections,
      includeAuditLog: form.includeAuditLog,
      includeCompletenessSummary: form.includeCompletenessSummary,
    });
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Request Record Packet Export</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Purpose */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Export Purpose <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={form.purpose}
              onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value as ExportPurpose }))}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {PURPOSE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Date range */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date From <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={form.dateRangeFrom}
                onChange={(e) => setForm((f) => ({ ...f, dateRangeFrom: e.target.value }))}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date To <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                required
                value={form.dateRangeTo}
                onChange={(e) => setForm((f) => ({ ...f, dateRangeTo: e.target.value }))}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Sections */}
          <div>
            <p className="block text-sm font-medium text-gray-700 mb-2">
              Clinical Sections <span className="text-red-500">*</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              {SELECTABLE_SECTIONS.map((key) => (
                <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.selectedSections.includes(key)}
                    onChange={() => toggleSection(key)}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded"
                  />
                  {EXPORT_SECTION_LABELS[key]}
                </label>
              ))}
            </div>
          </div>

          {/* Optional toggles */}
          <div className="space-y-2 border-t border-gray-100 pt-4">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.includeAuditLog}
                onChange={(e) => setForm((f) => ({ ...f, includeAuditLog: e.target.checked }))}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded"
              />
              Include Audit Log (HIPAA access trail)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={form.includeCompletenessSummary}
                onChange={(e) =>
                  setForm((f) => ({ ...f, includeCompletenessSummary: e.target.checked }))
                }
                className="w-4 h-4 text-blue-600 border-gray-300 rounded"
              />
              Include Completeness Summary
            </label>
          </div>

          {error && (
            <p className="text-sm text-red-600">
              {error instanceof Error ? error.message : "Failed to create export"}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || form.selectedSections.length === 0}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isPending ? "Requesting..." : "Request Export"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Manifest drawer ───────────────────────────────────────────────────────────

function ManifestDrawer({
  manifest,
  onClose,
}: {
  manifest: AuditRecordExportManifest;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/40 flex justify-end z-50">
      <div className="bg-white w-full max-w-lg h-full shadow-xl overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-200 sticky top-0 bg-white">
          <h3 className="text-base font-semibold text-gray-900">Export Manifest</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>
        <div className="p-5 space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Purpose</p>
              <p className="font-medium text-gray-800">{manifest.purpose}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Total Documents</p>
              <p className="font-medium text-gray-800">{manifest.totalDocuments}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Date Range</p>
              <p className="font-medium text-gray-800">
                {manifest.dateRange.from} — {manifest.dateRange.to}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Generated At</p>
              <p className="font-medium text-gray-800">
                {new Date(manifest.generatedAt).toLocaleString("en-US")}
              </p>
            </div>
          </div>

          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Export Hash (SHA-256)</p>
            <p className="font-mono text-xs text-gray-600 break-all">{manifest.exportHash}</p>
          </div>

          {manifest.includedSections.length > 0 && (
            <div>
              <p className="font-semibold text-gray-700 mb-2">Included Sections</p>
              <div className="space-y-2">
                {manifest.includedSections.map((section) => (
                  <div key={section.name} className="border border-gray-100 rounded p-2 bg-gray-50">
                    <p className="font-medium text-gray-800">{section.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {section.documentCount} document{section.documentCount !== 1 ? "s" : ""}
                    </p>
                    <p className="font-mono text-xs text-gray-400 mt-0.5 break-all">
                      SHA-256: {section.hash}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {manifest.omittedSections.length > 0 && (
            <div>
              <p className="font-semibold text-gray-700 mb-2">Omitted Sections</p>
              <div className="space-y-1">
                {manifest.omittedSections.map((section) => (
                  <div key={section.name} className="flex justify-between text-sm">
                    <span className="text-gray-700">{section.name}</span>
                    <span className="text-gray-400 italic">{section.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Export row ────────────────────────────────────────────────────────────────

function ExportRow({
  exportRecord,
  patientId,
  onViewManifest,
}: {
  exportRecord: AuditRecordExport;
  patientId: string;
  onViewManifest: (manifest: AuditRecordExportManifest) => void;
}) {
  const queryClient = useQueryClient();

  const { mutate: downloadPdf, isPending: isPdfPending } = useMutation<{ downloadUrl: string }, Error>({
    mutationFn: () =>
      getAuditExportDownloadUrlFn({
        data: { patientId, exportId: exportRecord.id, format: "pdf" },
      }) as Promise<{ downloadUrl: string }>,
    onSuccess: (result) => {
      window.open(result.downloadUrl, "_blank");
      void queryClient.invalidateQueries({ queryKey: ["audit-exports", patientId] });
    },
  });

  const { mutate: downloadZip, isPending: isZipPending } = useMutation<{ downloadUrl: string }, Error>({
    mutationFn: () =>
      getAuditExportDownloadUrlFn({
        data: { patientId, exportId: exportRecord.id, format: "zip" },
      }) as Promise<{ downloadUrl: string }>,
    onSuccess: (result) => {
      window.open(result.downloadUrl, "_blank");
      void queryClient.invalidateQueries({ queryKey: ["audit-exports", patientId] });
    },
  });

  const isReady = exportRecord.status === "READY" || exportRecord.status === "EXPORTED";
  const isGenerating = exportRecord.status === "GENERATING";

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="py-3 px-4 text-sm text-gray-700">
        {EXPORT_PURPOSE_LABELS[exportRecord.purpose] ?? exportRecord.purpose}
      </td>
      <td className="py-3 px-4">
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium inline-flex items-center gap-1 ${STATUS_BADGE[exportRecord.status as ExportStatus] ?? "bg-gray-100"}`}
        >
          {isGenerating && (
            <span className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          )}
          {EXPORT_STATUS_LABELS[exportRecord.status as ExportStatus] ?? exportRecord.status}
        </span>
      </td>
      <td className="py-3 px-4 text-sm text-gray-500">
        {exportRecord.dateRangeFrom} — {exportRecord.dateRangeTo}
      </td>
      <td className="py-3 px-4 text-sm text-gray-500">
        {new Date(exportRecord.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
      </td>
      <td className="py-3 px-4">
        <div className="flex items-center gap-2">
          {isReady && (
            <>
              <button
                type="button"
                onClick={() => downloadPdf()}
                disabled={isPdfPending}
                className="px-2.5 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
              >
                {isPdfPending ? "..." : "PDF"}
              </button>
              <button
                type="button"
                onClick={() => downloadZip()}
                disabled={isZipPending}
                className="px-2.5 py-1 text-xs bg-teal-600 text-white rounded hover:bg-teal-700 disabled:opacity-50"
              >
                {isZipPending ? "..." : "ZIP"}
              </button>
              {exportRecord.manifestJson && (
                <button
                  type="button"
                  onClick={() =>
                    onViewManifest(exportRecord.manifestJson as AuditRecordExportManifest)
                  }
                  className="px-2.5 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  Manifest
                </button>
              )}
            </>
          )}
          {exportRecord.status === "FAILED" && exportRecord.errorMessage && (
            <span className="text-xs text-red-600" title={exportRecord.errorMessage}>
              Error
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function AuditExportPage() {
  const { patientId } = Route.useParams();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [activeManifest, setActiveManifest] = useState<AuditRecordExportManifest | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["audit-exports", patientId],
    queryFn: () => listAuditExportsFn({ data: { patientId, limit: 50 } }),
    // Poll every 3 seconds if any export is still generating
    refetchInterval: (query) => {
      const exports = query.state.data?.exports ?? [];
      const hasGenerating = exports.some(
        (e: AuditRecordExport) => e.status === "REQUESTED" || e.status === "GENERATING",
      );
      return hasGenerating ? 3000 : false;
    },
  });

  // Socket.IO listener for export:ready / export:failed
  useEffect(() => {
    // Socket.IO wiring is handled globally via the shared socket hook.
    // The query will auto-refetch on the 3s interval when generating.
    // Direct invalidation is intentionally left to the global socket handler
    // to avoid creating a socket dependency here.
  }, []);

  const exports = data?.exports ?? [];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Record Packet Exports</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            ADR / TPE / Survey compliance export requests
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 font-medium"
        >
          + Request Export
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading exports...</div>
      ) : exports.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          No export requests yet. Use "Request Export" to create the first one.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Purpose
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Date Range
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Requested
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {exports.map((exportRecord: AuditRecordExport) => (
                <ExportRow
                  key={exportRecord.id}
                  exportRecord={exportRecord}
                  patientId={patientId}
                  onViewManifest={setActiveManifest}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <RequestExportModal
          patientId={patientId}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {activeManifest && (
        <ManifestDrawer
          manifest={activeManifest}
          onClose={() => setActiveManifest(null)}
        />
      )}
    </div>
  );
}
