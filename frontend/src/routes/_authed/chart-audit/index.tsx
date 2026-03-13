// routes/_authed/chart-audit/index.tsx
// Chart Audit Mode Workbench — T3-13
//
// Supervisor workspace: paginated patient list, dashboard cards, saved views,
// bulk QA actions (ASSIGN / REQUEST_REVISION / EXPORT_CSV), and
// per-patient chart completeness detail panel.

import {
  chartBulkActionFn,
  createReviewViewFn,
  deleteReviewViewFn,
  getChartAuditDashboardFn,
  getChartAuditQueueFn,
  getPatientChartAuditFn,
  getReviewViewsFn,
  patchReviewViewFn,
} from "@/functions/chartAudit.functions.js";
import type {
  ChartAuditDetailResponse,
  ChartAuditQueueRow,
  ReviewAuditStatus,
  ReviewQueueView,
} from "@hospici/shared-types";
import { REVIEW_AUDIT_STATUS_COLORS, REVIEW_AUDIT_STATUS_LABELS } from "@hospici/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_authed/chart-audit/")({
  component: ChartAuditPage,
});

// ── Status badge ───────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: ReviewAuditStatus }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${REVIEW_AUDIT_STATUS_COLORS[status]}`}>
      {REVIEW_AUDIT_STATUS_LABELS[status]}
    </span>
  );
}

// ── Severity pill ──────────────────────────────────────────────────────────────

function SeverityPill({ severity }: { severity: "critical" | "warning" }) {
  const cls =
    severity === "critical"
      ? "bg-red-100 text-red-700"
      : "bg-yellow-100 text-yellow-700";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {severity}
    </span>
  );
}

// ── Dashboard cards ────────────────────────────────────────────────────────────

function DashboardCards() {
  const { data, isLoading } = useQuery({
    queryKey: ["chart-audit-dashboard"],
    queryFn: () => getChartAuditDashboardFn(),
    staleTime: 60_000,
  });

  if (isLoading) return <div className="text-sm text-gray-500">Loading dashboard…</div>;
  if (!data) return null;

  const cards = [
    { label: "Total", value: data.total, color: "bg-blue-50 text-blue-900" },
    { label: "Not Started", value: data.byStatus.NOT_STARTED, color: "bg-gray-50 text-gray-800" },
    { label: "In Progress", value: data.byStatus.IN_PROGRESS, color: "bg-yellow-50 text-yellow-800" },
    { label: "Flagged", value: data.byStatus.FLAGGED, color: "bg-red-50 text-red-800" },
    { label: "Complete", value: data.byStatus.COMPLETE, color: "bg-green-50 text-green-800" },
    {
      label: "Avg Readiness",
      value: `${Math.round(data.avgSurveyReadinessScore)}%`,
      color: "bg-purple-50 text-purple-800",
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3 mb-6 lg:grid-cols-6">
      {cards.map((c) => (
        <div key={c.label} className={`rounded-lg p-3 ${c.color}`}>
          <div className="text-2xl font-bold">{c.value}</div>
          <div className="text-xs mt-1">{c.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── Saved views sidebar ────────────────────────────────────────────────────────

function SavedViewsSidebar({
  activeViewId,
  onSelectView,
}: {
  activeViewId: string | null;
  onSelectView: (view: ReviewQueueView | null) => void;
}) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["review-queue-views", "chart_audit"],
    queryFn: () => getReviewViewsFn({ data: { viewScope: "chart_audit" } }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteReviewViewFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["review-queue-views"] }),
  });

  const pinMutation = useMutation({
    mutationFn: (view: ReviewQueueView) =>
      patchReviewViewFn({ data: { id: view.id, isPinned: !view.isPinned } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["review-queue-views"] }),
  });

  return (
    <div className="w-56 shrink-0 border-r pr-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Saved Views</h3>
        <button
          type="button"
          onClick={() => onSelectView(null)}
          className="text-xs text-blue-600 hover:underline"
        >
          + New
        </button>
      </div>
      <ul className="space-y-1">
        {(data?.data ?? []).map((view) => (
          <li key={view.id}>
            <div className="flex items-center justify-between group">
              <button
                type="button"
                onClick={() => onSelectView(view)}
                className={`flex-1 text-left px-2 py-1.5 rounded text-sm truncate ${
                  activeViewId === view.id
                    ? "bg-blue-100 text-blue-900 font-medium"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                {view.isPinned && <span className="mr-1">📌</span>}
                {view.isDefault && <span className="mr-1 text-yellow-600">★</span>}
                {view.name}
                {view.isShared && (
                  <span className="ml-1 text-xs text-gray-400">(shared)</span>
                )}
              </button>
              <div className="hidden group-hover:flex items-center gap-1 ml-1">
                <button
                  type="button"
                  onClick={() => pinMutation.mutate(view)}
                  className="text-gray-400 hover:text-gray-600 text-xs px-1"
                  title={view.isPinned ? "Unpin" : "Pin"}
                >
                  {view.isPinned ? "▼" : "▲"}
                </button>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(view.id)}
                  className="text-red-400 hover:text-red-600 text-xs px-1"
                  title="Delete view"
                >
                  ×
                </button>
              </div>
            </div>
          </li>
        ))}
        {(!data?.data || data.data.length === 0) && (
          <li className="text-xs text-gray-400 px-2 py-1">No saved views</li>
        )}
      </ul>
    </div>
  );
}

// ── Save view modal ────────────────────────────────────────────────────────────

function SaveViewModal({
  filters,
  onClose,
}: {
  filters: Record<string, string | boolean | undefined>;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [isDefault, setIsDefault] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      createReviewViewFn({
        data: {
          name,
          viewScope: "chart_audit" as const,
          filters: filters as Record<string, string | boolean>,
          isShared,
          isDefault,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["review-queue-views"] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-80 shadow-xl">
        <h3 className="text-base font-semibold mb-4">Save Current View</h3>
        <label className="block text-sm font-medium mb-1">Name</label>
        <input
          className="w-full border rounded px-3 py-1.5 text-sm mb-3"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. My RN Filter"
        />
        <div className="flex items-center gap-4 mb-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isShared}
              onChange={(e) => setIsShared(e.target.checked)}
            />
            Share with team
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
            />
            Set as default
          </label>
        </div>
        <div className="flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm border rounded">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || mutation.isPending}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Patient detail panel ───────────────────────────────────────────────────────

function PatientDetailPanel({
  patientId,
  onClose,
}: {
  patientId: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["chart-audit-detail", patientId],
    queryFn: () => getPatientChartAuditFn({ data: { patientId } }),
  });

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50">
      <div className="bg-white rounded-t-2xl sm:rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
          <h2 className="text-base font-semibold">Chart Audit Report</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ×
          </button>
        </div>

        {isLoading && (
          <div className="p-6 text-sm text-gray-500">Loading chart audit…</div>
        )}

        {data && <ChartAuditDetailView report={data} />}
      </div>
    </div>
  );
}

function ChartAuditDetailView({ report }: { report: ChartAuditDetailResponse }) {
  const { sections, surveyReadiness, missingDocuments } = report;

  // Survey readiness color
  const scoreColor =
    surveyReadiness.score >= 80
      ? "text-green-700"
      : surveyReadiness.score >= 60
        ? "text-yellow-700"
        : "text-red-700";

  return (
    <div className="p-6 space-y-6">
      {/* Survey readiness score */}
      <div className="flex items-center gap-4 bg-gray-50 rounded-lg p-4">
        <div className={`text-4xl font-bold ${scoreColor}`}>{Math.round(surveyReadiness.score)}</div>
        <div>
          <div className="text-sm font-semibold text-gray-700">Survey Readiness Score</div>
          <div className="text-xs text-gray-500">Audited {new Date(report.auditDate).toLocaleDateString()}</div>
        </div>
      </div>

      {/* Blockers + warnings */}
      {surveyReadiness.blockers.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-red-700 mb-2">Blockers</h3>
          <ul className="space-y-1">
            {surveyReadiness.blockers.map((b: string) => (
              <li key={b} className="text-sm text-red-600 flex items-start gap-2">
                <span>●</span> {b}
              </li>
            ))}
          </ul>
        </div>
      )}
      {surveyReadiness.warnings.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-yellow-700 mb-2">Warnings</h3>
          <ul className="space-y-1">
            {surveyReadiness.warnings.map((w: string) => (
              <li key={w} className="text-sm text-yellow-700 flex items-start gap-2">
                <span>●</span> {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 8 sections grid */}
      <div className="grid grid-cols-2 gap-4">
        <SectionCard title="Encounters">
          <Stat label="Total" value={sections.encounters.total} />
          <Stat label="Pending" value={sections.encounters.pending} warn={sections.encounters.pending > 0} />
          <Stat label="Approved" value={sections.encounters.approved} />
          <Stat label="Overdue" value={sections.encounters.overdue} warn={sections.encounters.overdue > 0} />
        </SectionCard>

        <SectionCard title="HOPE Assessments">
          <Stat label="Required" value={sections.hopeAssessments.required} />
          <Stat label="Filed" value={sections.hopeAssessments.filed} />
          {sections.hopeAssessments.missing.map((m: string) => (
            <div key={m} className="text-xs text-red-600">Missing: {m}</div>
          ))}
        </SectionCard>

        <SectionCard title="NOE / NOTR">
          <Stat label="NOE Status" value={sections.noeNotr.noeStatus} />
          <Stat label="NOTR Required" value={sections.noeNotr.notrRequired ? "Yes" : "No"} />
          {sections.noeNotr.notrStatus && (
            <Stat label="NOTR Status" value={sections.noeNotr.notrStatus} />
          )}
        </SectionCard>

        <SectionCard title="Physician Orders">
          <Stat label="Total" value={sections.orders.total} />
          <Stat label="Unsigned" value={sections.orders.unsigned} warn={sections.orders.unsigned > 0} />
          <Stat label="Expired" value={sections.orders.expired} warn={sections.orders.expired > 0} />
        </SectionCard>

        <SectionCard title="Signatures">
          <Stat label="Required" value={sections.signatures.required} />
          <Stat label="Obtained" value={sections.signatures.obtained} />
          {sections.signatures.missing.map((m: string) => (
            <div key={m} className="text-xs text-red-600">Missing: {m}</div>
          ))}
        </SectionCard>

        <SectionCard title="Care Plan">
          <Stat label="Present" value={sections.carePlan.present ? "Yes" : "No"} warn={!sections.carePlan.present} />
          <Stat
            label="Last Updated"
            value={
              sections.carePlan.lastUpdated
                ? new Date(sections.carePlan.lastUpdated).toLocaleDateString()
                : "—"
            }
          />
        </SectionCard>

        <SectionCard title="Medications">
          <Stat label="Active" value={sections.medications.active} />
          <Stat label="Unreconciled" value={sections.medications.unreconciled} warn={sections.medications.unreconciled > 0} />
        </SectionCard>

        <SectionCard title="IDG Meetings">
          <Stat
            label="Last Held"
            value={sections.idgMeetings.lastHeld ? new Date(sections.idgMeetings.lastHeld).toLocaleDateString() : "Never"}
          />
          <Stat
            label="Next Due"
            value={new Date(sections.idgMeetings.nextDue).toLocaleDateString()}
            warn={sections.idgMeetings.overdue}
          />
          {sections.idgMeetings.overdue && (
            <div className="text-xs text-red-600 font-semibold mt-1">OVERDUE</div>
          )}
        </SectionCard>
      </div>

      {/* Missing documents */}
      {missingDocuments.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">
            Missing Documents ({missingDocuments.length})
          </h3>
          <ul className="space-y-2">
            {missingDocuments.map((d: { type: string; description: string; dueBy: string | null; severity: "critical" | "warning" }, i: number) => (
              <li key={`${d.type}-${i}`} className="flex items-start gap-3 text-sm">
                <SeverityPill severity={d.severity} />
                <span className="text-gray-700">{d.description}</span>
                {d.dueBy && <span className="text-gray-400 text-xs">Due {d.dueBy}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-lg p-3">
      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">{title}</h4>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  warn = false,
}: {
  label: string;
  value: string | number;
  warn?: boolean;
}) {
  return (
    <div className="flex justify-between text-xs">
      <span className="text-gray-500">{label}</span>
      <span className={warn ? "font-semibold text-red-600" : "text-gray-800"}>{value}</span>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

function ChartAuditPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [selectedPatientIds, setSelectedPatientIds] = useState<Set<string>>(new Set());
  const [detailPatientId, setDetailPatientId] = useState<string | null>(null);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [showSaveViewModal, setShowSaveViewModal] = useState(false);
  const [filters, setFilters] = useState<{
    discipline?: string;
    status?: string;
    billingImpact?: boolean;
    complianceImpact?: boolean;
    missingDocSeverity?: string;
  }>({});

  const { data: queueData, isLoading } = useQuery({
    queryKey: ["chart-audit-queue", page, filters],
    queryFn: () => getChartAuditQueueFn({ data: { page, limit: 25, ...filters } }),
    staleTime: 30_000,
  });

  const bulkMutation = useMutation({
    mutationFn: (action: "ASSIGN" | "REQUEST_REVISION" | "EXPORT_CSV") =>
      chartBulkActionFn({ data: { patientIds: Array.from(selectedPatientIds), action } }),
    onSuccess: () => {
      setSelectedPatientIds(new Set());
      qc.invalidateQueries({ queryKey: ["chart-audit-queue"] });
      qc.invalidateQueries({ queryKey: ["chart-audit-dashboard"] });
    },
  });

  function toggleSelect(patientId: string) {
    const next = new Set(selectedPatientIds);
    if (next.has(patientId)) next.delete(patientId);
    else next.add(patientId);
    setSelectedPatientIds(next);
  }

  function toggleSelectAll() {
    if (!queueData) return;
    if (selectedPatientIds.size === queueData.data.length) {
      setSelectedPatientIds(new Set());
    } else {
      setSelectedPatientIds(new Set(queueData.data.map((r) => r.patientId)));
    }
  }

  function handleViewSelect(view: ReviewQueueView | null) {
    setActiveViewId(view?.id ?? null);
    if (view?.filters) {
      setFilters(view.filters as typeof filters);
    }
  }

  const rows = queueData?.data ?? [];
  const total = queueData?.total ?? 0;
  const totalPages = Math.ceil(total / 25);

  return (
    <div className="flex h-full overflow-hidden">
      {/* Saved views sidebar */}
      <div className="pt-6 pl-6 hidden md:block">
        <SavedViewsSidebar activeViewId={activeViewId} onSelectView={handleViewSelect} />
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Chart Audit Workbench</h1>
              <p className="text-sm text-gray-500 mt-0.5">
                Survey-readiness and QA review across all patient charts
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSaveViewModal(true)}
              className="text-sm border px-3 py-1.5 rounded hover:bg-gray-50"
            >
              Save View
            </button>
          </div>

          {/* Dashboard cards */}
          <DashboardCards />

          {/* Filters bar */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <select
              className="border rounded px-2 py-1.5 text-sm"
              value={filters.discipline ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, discipline: e.target.value || undefined }))}
            >
              <option value="">All Disciplines</option>
              {["RN", "SW", "CHAPLAIN", "THERAPY", "AIDE"].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <select
              className="border rounded px-2 py-1.5 text-sm"
              value={filters.status ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined }))}
            >
              <option value="">All Statuses</option>
              {(["NOT_STARTED", "IN_PROGRESS", "COMPLETE", "FLAGGED"] as ReviewAuditStatus[]).map((s) => (
                <option key={s} value={s}>{REVIEW_AUDIT_STATUS_LABELS[s]}</option>
              ))}
            </select>

            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={filters.billingImpact ?? false}
                onChange={(e) => setFilters((f) => ({ ...f, billingImpact: e.target.checked || undefined }))}
              />
              Billing Impact
            </label>

            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={filters.complianceImpact ?? false}
                onChange={(e) => setFilters((f) => ({ ...f, complianceImpact: e.target.checked || undefined }))}
              />
              Compliance Impact
            </label>

            <select
              className="border rounded px-2 py-1.5 text-sm"
              value={filters.missingDocSeverity ?? ""}
              onChange={(e) => setFilters((f) => ({ ...f, missingDocSeverity: e.target.value || undefined }))}
            >
              <option value="">Any Severity</option>
              <option value="critical">Critical Only</option>
              <option value="warning">Warning Only</option>
            </select>

            {Object.keys(filters).length > 0 && (
              <button
                type="button"
                onClick={() => setFilters({})}
                className="text-sm text-gray-400 hover:text-gray-600"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Bulk actions bar */}
          {selectedPatientIds.size > 0 && (
            <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 mb-4">
              <span className="text-sm font-medium text-blue-700">
                {selectedPatientIds.size} selected
              </span>
              <button
                type="button"
                onClick={() => bulkMutation.mutate("ASSIGN")}
                disabled={bulkMutation.isPending}
                className="text-sm px-3 py-1 bg-white border rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Assign Reviewer
              </button>
              <button
                type="button"
                onClick={() => bulkMutation.mutate("REQUEST_REVISION")}
                disabled={bulkMutation.isPending}
                className="text-sm px-3 py-1 bg-white border rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Request Revision
              </button>
              <button
                type="button"
                onClick={() => bulkMutation.mutate("EXPORT_CSV")}
                disabled={bulkMutation.isPending}
                className="text-sm px-3 py-1 bg-white border rounded hover:bg-gray-50 disabled:opacity-50"
              >
                Export CSV
              </button>
              <button
                type="button"
                onClick={() => setSelectedPatientIds(new Set())}
                className="ml-auto text-sm text-gray-400 hover:text-gray-600"
              >
                Clear
              </button>
            </div>
          )}

          {/* Queue table */}
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 text-left w-8">
                    <input
                      type="checkbox"
                      checked={rows.length > 0 && selectedPatientIds.size === rows.length}
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-3 py-2 text-left">Patient</th>
                  <th className="px-3 py-2 text-left">Discipline</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Missing Docs</th>
                  <th className="px-3 py-2 text-right">Readiness</th>
                  <th className="px-3 py-2 text-left">Reviewer</th>
                  <th className="px-3 py-2 text-left">Last Activity</th>
                  <th className="px-3 py-2 text-left">Flags</th>
                  <th className="px-3 py-2 text-left w-16" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading && (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-gray-400 text-sm">
                      Loading…
                    </td>
                  </tr>
                )}
                {!isLoading && rows.length === 0 && (
                  <tr>
                    <td colSpan={10} className="px-3 py-8 text-center text-gray-400 text-sm">
                      No patients in queue.
                    </td>
                  </tr>
                )}
                {rows.map((row: ChartAuditQueueRow) => (
                  <tr
                    key={row.patientId}
                    className={`hover:bg-gray-50 transition-colors ${selectedPatientIds.has(row.patientId) ? "bg-blue-50" : ""}`}
                  >
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selectedPatientIds.has(row.patientId)}
                        onChange={() => toggleSelect(row.patientId)}
                      />
                    </td>
                    <td className="px-3 py-2.5 font-medium text-gray-900">{row.patientName}</td>
                    <td className="px-3 py-2.5 text-gray-600">{row.primaryDiscipline}</td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={row.reviewStatus} />
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <span className={row.missingDocCount > 0 ? "font-semibold text-red-600" : "text-gray-600"}>
                        {row.missingDocCount}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <ReadinessBar score={row.surveyReadinessScore} />
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 text-xs">
                      {row.assignedReviewerName ?? <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 text-xs">
                      {row.lastActivityAt
                        ? new Date(row.lastActivityAt).toLocaleDateString()
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex gap-1">
                        {row.billingImpact && (
                          <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">
                            Billing
                          </span>
                        )}
                        {row.complianceImpact && (
                          <span className="px-1.5 py-0.5 bg-purple-100 text-purple-700 text-xs rounded">
                            Compliance
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <button
                        type="button"
                        onClick={() => setDetailPatientId(row.patientId)}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        Audit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-gray-600">
              <span>
                Page {page} of {totalPages} ({total} total)
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-3 py-1.5 border rounded disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-1.5 border rounded disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Patient detail modal */}
      {detailPatientId && (
        <PatientDetailPanel
          patientId={detailPatientId}
          onClose={() => setDetailPatientId(null)}
        />
      )}

      {/* Save view modal */}
      {showSaveViewModal && (
        <SaveViewModal
          filters={filters as Record<string, string | boolean | undefined>}
          onClose={() => setShowSaveViewModal(false)}
        />
      )}
    </div>
  );
}

// ── Readiness bar ─────────────────────────────────────────────────────────────

function ReadinessBar({ score }: { score: number }) {
  const color =
    score >= 80
      ? "bg-green-500"
      : score >= 60
        ? "bg-yellow-500"
        : "bg-red-500";

  return (
    <div className="flex items-center gap-1.5 justify-end">
      <div className="w-16 bg-gray-200 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full ${color}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className="text-xs text-gray-600 w-7 text-right">{Math.round(score)}%</span>
    </div>
  );
}
