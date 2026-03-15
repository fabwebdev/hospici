// routes/_authed/patients/index.tsx
// Patient list — matches Pencil design "03 Patient List"

import { getPatientListSummaryFn, getPatientsFn } from "@/functions/patient.functions.js";
import { patientKeys } from "@/lib/query/keys.js";
import type { RouterContext } from "@/routes/__root.js";
import type {
  HumanName,
  PatientEnrichment,
  PatientListResponse,
  PatientListSummaryResponse,
  PatientResponse,
} from "@hospici/shared-types";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

// ── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_authed/patients/")({
  loader: async ({ context: { queryClient } }: { context: RouterContext }) => {
    try {
      await Promise.all([
        queryClient.ensureQueryData({
          queryKey: patientKeys.list({ limit: 100 }),
          queryFn: () => getPatientsFn({ data: { limit: 100 } }),
        }),
        queryClient.ensureQueryData({
          queryKey: patientKeys.listSummary(),
          queryFn: () => getPatientListSummaryFn(),
        }),
      ]);
    } catch {
      // Let useQuery handle error state
    }
  },
  component: PatientsListPage,
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatName(names: HumanName[]): string {
  const primary = names[0];
  if (!primary) return "—";
  return `${primary.given.join(" ")} ${primary.family}`;
}

function getMrn(patient: PatientResponse): string | undefined {
  return patient.identifier.find((id) => id.system.toLowerCase().includes("mrn"))?.value;
}

function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  try {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return date;
  }
}

type PatientStatus = "admitted" | "discharged" | "pending";

function deriveStatus(patient: PatientResponse): PatientStatus {
  if (patient.dischargeDate) return "discharged";
  if (patient.admissionDate) return "admitted";
  return "pending";
}

// ── Badge components ─────────────────────────────────────────────────────────

const STATUS_STYLES: Record<PatientStatus, { bg: string; text: string }> = {
  admitted: { bg: "bg-[#DCFCE7]", text: "text-[#166534]" },
  discharged: { bg: "bg-gray-100", text: "text-gray-500" },
  pending: { bg: "bg-[#FEF9C3]", text: "text-[#854D0E]" },
};

const STATUS_LABELS: Record<PatientStatus, string> = {
  admitted: "Admitted",
  discharged: "Discharged",
  pending: "Pending",
};

function StatusBadge({ patient }: { patient: PatientResponse }) {
  const status = deriveStatus(patient);
  const style = STATUS_STYLES[status];
  return (
    <span
      className={`inline-flex items-center px-2 h-[22px] text-[11px] rounded-sm ${style.bg} ${style.text}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

const CARE_MODEL_STYLES: Record<string, { bg: string; text: string }> = {
  HOSPICE: { bg: "bg-[#EFF6FF]", text: "text-[#1D4ED8]" },
  PALLIATIVE: { bg: "bg-[#F3E8FF]", text: "text-[#7C3AED]" },
  CCM: { bg: "bg-teal-50", text: "text-teal-700" },
};

function CareModelBadge({ model }: { model: string | undefined }) {
  if (!model) return <span className="text-gray-400 text-xs">—</span>;
  const style = CARE_MODEL_STYLES[model] ?? { bg: "bg-gray-50", text: "text-gray-600" };
  return (
    <span
      className={`inline-flex items-center px-2 h-[22px] text-[10px] font-semibold rounded-sm ${style.bg} ${style.text}`}
    >
      {model}
    </span>
  );
}

const NOE_BADGE_STYLES: Record<string, { bg: string; text: string; border?: string }> = {
  accepted: { bg: "bg-[#DCFCE7]", text: "text-[#166534]" },
  draft: { bg: "bg-[#FEF9C3]", text: "text-[#854D0E]" },
  submitted: { bg: "bg-[#FEF9C3]", text: "text-[#854D0E]" },
  ready_for_submission: { bg: "bg-[#FEF9C3]", text: "text-[#854D0E]" },
  rejected: { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]" },
  needs_correction: { bg: "bg-[#FEE2E2]", text: "text-[#DC2626]" },
  late_pending_override: { bg: "bg-[#FFFBEB]", text: "text-[#92400E]" },
};

const NOE_LABEL_MAP: Record<string, string> = {
  accepted: "ACCEPTED",
  draft: "DRAFT",
  submitted: "SUBMITTED",
  ready_for_submission: "READY",
  rejected: "REJECTED",
  needs_correction: "CORRECTION",
  late_pending_override: "LATE",
};

function NoeStatusBadge({ status }: { status: string | null }) {
  if (!status) {
    return (
      <span className="inline-flex items-center px-2 h-[22px] text-[11px] rounded-sm bg-[#F8FAFC] text-[#64748B] border border-[#E2E8F0]">
        NOT REQ'D
      </span>
    );
  }
  const style = NOE_BADGE_STYLES[status] ?? { bg: "bg-gray-100", text: "text-gray-600" };
  const label = NOE_LABEL_MAP[status] ?? status.toUpperCase();
  return (
    <span
      className={`inline-flex items-center px-2 h-[22px] text-[11px] rounded-sm ${style.bg} ${style.text}`}
    >
      {label}
    </span>
  );
}

function IdgDueBadge({ enrichment }: { enrichment: PatientEnrichment | undefined }) {
  if (!enrichment || enrichment.idg.status === "none") {
    return <span className="text-[#64748B] text-xs">—</span>;
  }

  const { daysRemaining, status } = enrichment.idg;
  const days = daysRemaining ?? 0;

  if (status === "overdue") {
    return (
      <span className="inline-flex items-center px-2 h-[22px] text-[10px] font-semibold font-mono rounded-sm bg-[#FEE2E2] text-[#DC2626]">
        {Math.abs(days)}d OVERDUE
      </span>
    );
  }

  if (status === "warning") {
    return (
      <span className="inline-flex items-center px-2 h-[22px] text-[10px] font-mono rounded-sm bg-[#FFFBEB] text-[#D97706]">
        {days}d remaining
      </span>
    );
  }

  return (
    <span className="inline-flex items-center px-2 h-[22px] text-[10px] font-mono rounded-sm bg-[#F0F9FF] text-[#0369A1]">
      {days}d OK
    </span>
  );
}

// ── Dropdown filter ──────────────────────────────────────────────────────────

function FilterDropdown<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  const handleBlur = useCallback(() => {
    setTimeout(() => setOpen(false), 150);
  }, []);

  return (
    <div className="relative" ref={ref} onBlur={handleBlur}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 h-[38px] px-3 bg-white border border-[#E2E8F0] rounded text-[13px] text-[#374151] hover:bg-gray-50"
      >
        {label}: {selectedLabel}
        <ChevronDown className="w-3 h-3 text-[#64748B]" />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-[#E2E8F0] rounded shadow-lg z-20 min-w-[160px]">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
              className={`block w-full text-left px-3 py-2 text-[13px] hover:bg-[#F1F5F9] ${
                value === option.value ? "text-[#2563EB] font-medium" : "text-[#374151]"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

const STATUS_OPTIONS: { value: "all" | PatientStatus; label: string }[] = [
  { value: "all", label: "All" },
  { value: "admitted", label: "Admitted" },
  { value: "discharged", label: "Discharged" },
  { value: "pending", label: "Pending" },
];

const CARE_MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "HOSPICE", label: "Hospice" },
  { value: "PALLIATIVE", label: "Palliative" },
  { value: "CCM", label: "CCM" },
];

// ── Main page ────────────────────────────────────────────────────────────────

function PatientsListPage() {
  const navigate = useNavigate();

  // Local filter/pagination state
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | PatientStatus>("all");
  const [careModelFilter, setCareModelFilter] = useState("all");
  const [idgOverdueOnly, setIdgOverdueOnly] = useState(false);
  const [page, setPage] = useState(1);

  // Fetch patients and enrichment data in parallel
  const { data, isLoading, error } = useQuery<PatientListResponse>({
    queryKey: patientKeys.list({ limit: 100 }),
    queryFn: () => getPatientsFn({ data: { limit: 100 } }) as Promise<PatientListResponse>,
  });

  const { data: summaryData } = useQuery<PatientListSummaryResponse>({
    queryKey: patientKeys.listSummary(),
    queryFn: () => getPatientListSummaryFn() as Promise<PatientListSummaryResponse>,
  });

  const patients = data?.patients ?? [];
  const summary = summaryData?.summary ?? {};

  // Compute stats from enrichment data
  const stats = useMemo(() => {
    let idgOverdue = 0;
    let noeDue = 0;
    for (const enrichment of Object.values(summary)) {
      if (enrichment.idg.status === "overdue") idgOverdue++;
      if (enrichment.noeStatus === "draft" || enrichment.noeStatus === "ready_for_submission")
        noeDue++;
    }
    return { idgOverdue, noeDue };
  }, [summary]);

  // Client-side filtering
  const filtered = useMemo(() => {
    return patients.filter((p) => {
      if (search) {
        const name = formatName(p.name).toLowerCase();
        const mrn = getMrn(p)?.toLowerCase() ?? "";
        const q = search.toLowerCase();
        if (!name.includes(q) && !mrn.includes(q)) return false;
      }
      if (statusFilter !== "all" && deriveStatus(p) !== statusFilter) return false;
      if (careModelFilter !== "all" && p.careModel !== careModelFilter) return false;
      if (idgOverdueOnly) {
        const enrichment = summary[p.id];
        if (!enrichment || enrichment.idg.status !== "overdue") return false;
      }
      return true;
    });
  }, [patients, search, statusFilter, careModelFilter, idgOverdueOnly, summary]);

  // Client-side pagination
  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIdx = (currentPage - 1) * PAGE_SIZE;
  const pagePatients = filtered.slice(startIdx, startIdx + PAGE_SIZE);

  // Reset page when filters change
  const handleSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  const handleStatusChange = useCallback((value: "all" | PatientStatus) => {
    setStatusFilter(value);
    setPage(1);
  }, []);

  const handleCareModelChange = useCallback((value: string) => {
    setCareModelFilter(value);
    setPage(1);
  }, []);

  const toggleIdgOverdue = useCallback(() => {
    setIdgOverdueOnly((prev) => !prev);
    setPage(1);
  }, []);

  const totalCount = patients.length;
  const admittedCount = patients.filter((p) => deriveStatus(p) === "admitted").length;

  function handleRowClick(patient: PatientResponse) {
    void navigate({ to: "/patients/$patientId", params: { patientId: patient.id } });
  }

  return (
    <div className="flex flex-col gap-5 py-7 px-8 bg-[#F1F5F9] min-h-full">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h1
            className="text-[22px] font-semibold text-[#0F172A]"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Patients
          </h1>
          <p className="text-[13px] text-[#64748B]">
            {admittedCount} active patient{admittedCount !== 1 ? "s" : ""} · Palm Valley Hospice
          </p>
        </div>
        <Link
          to="/patients/new"
          className="flex items-center gap-2 h-10 px-4 bg-[#2563EB] text-white text-[13px] font-medium rounded hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Admission
        </Link>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-2.5 py-3">
        <span className="inline-flex items-center h-8 px-3 text-xs font-medium text-[#1D4ED8] bg-[#EFF6FF] border border-[#BFDBFE] rounded">
          {totalCount} Patients
        </span>
        <span className="inline-flex items-center h-8 px-3 text-xs font-medium text-[#991B1B] bg-[#FEE2E2] border border-[#FCA5A5] rounded">
          {stats.idgOverdue} IDG Overdue
        </span>
        <span className="inline-flex items-center h-8 px-3 text-xs font-medium text-[#92400E] bg-[#FFFBEB] border border-[#FCD34D] rounded">
          0 HOPE Pending
        </span>
        <span className="inline-flex items-center h-8 px-3 text-xs font-medium text-[#92400E] bg-[#FFFBEB] border border-[#FCD34D] rounded">
          {stats.noeDue} NOE Due
        </span>
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-2 flex-1 h-[38px] px-3 bg-white border border-[#E2E8F0] rounded">
          <Search className="w-3.5 h-3.5 text-[#94A3B8]" />
          <input
            type="text"
            placeholder="Search patients by name or MRN…"
            className="flex-1 text-[13px] outline-none text-[#374151] placeholder-[#94A3B8] bg-transparent"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
          />
        </div>
        <FilterDropdown
          label="Status"
          value={statusFilter}
          options={STATUS_OPTIONS}
          onChange={handleStatusChange}
        />
        <FilterDropdown
          label="Care Model"
          value={careModelFilter}
          options={CARE_MODEL_OPTIONS}
          onChange={handleCareModelChange}
        />
        <button
          type="button"
          onClick={toggleIdgOverdue}
          className={`flex items-center gap-1.5 h-[38px] px-3 rounded text-[13px] font-medium transition-colors ${
            idgOverdueOnly
              ? "bg-[#DC2626] border border-[#DC2626] text-white"
              : "bg-[#FEF2F2] border border-[#FCA5A5] text-[#DC2626] hover:bg-red-100"
          }`}
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          IDG Overdue
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-[#E2E8F0] overflow-hidden">
        {/* Table header */}
        <div className="flex items-center h-11 px-4 bg-[#F8FAFC] border-b border-[#E2E8F0]">
          <span className="flex-1 min-w-0 text-xs font-medium text-[#64748B]">Patient Name</span>
          <span className="w-[110px] shrink-0 text-xs font-medium text-[#64748B]">MRN</span>
          <span className="w-[110px] shrink-0 text-xs font-medium text-[#64748B]">Admission</span>
          <span className="w-[100px] shrink-0 text-xs font-medium text-[#64748B]">Status</span>
          <span className="w-[110px] shrink-0 text-xs font-medium text-[#64748B]">IDG Due</span>
          <span className="w-[150px] shrink-0 text-xs font-medium text-[#64748B]">
            Primary Clinician
          </span>
          <span className="w-[100px] shrink-0 text-xs font-medium text-[#64748B]">Care Model</span>
          <span className="w-[110px] shrink-0 text-xs font-medium text-[#64748B]">NOE Status</span>
          <span className="w-9 shrink-0" />
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-12 text-sm text-[#94A3B8]">Loading patients…</div>
        )}

        {/* Error */}
        {error && (
          <div className="px-4 py-8 text-center text-sm text-red-600">
            Failed to load patients: {error instanceof Error ? error.message : "Unknown error"}
          </div>
        )}

        {/* Empty */}
        {!isLoading && !error && filtered.length === 0 && (
          <div className="px-4 py-12 text-center">
            <p className="text-sm text-[#64748B]">
              {search || statusFilter !== "all" || careModelFilter !== "all" || idgOverdueOnly
                ? "No patients match your filters."
                : "No patients found."}
            </p>
            {(search || statusFilter !== "all" || careModelFilter !== "all" || idgOverdueOnly) && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setStatusFilter("all");
                  setCareModelFilter("all");
                  setIdgOverdueOnly(false);
                  setPage(1);
                }}
                className="mt-2 text-sm text-[#2563EB] hover:text-blue-800"
              >
                Clear all filters
              </button>
            )}
          </div>
        )}

        {/* Rows */}
        {!isLoading &&
          pagePatients.map((patient) => {
            const name = formatName(patient.name);
            const mrn = getMrn(patient);
            const enrichment = summary[patient.id];
            const isOverdue = enrichment?.idg.status === "overdue";

            return (
              <button
                key={patient.id}
                type="button"
                onClick={() => handleRowClick(patient)}
                className={`flex items-center w-full h-14 px-4 border-b border-[#E2E8F0] cursor-pointer transition-colors text-left ${
                  isOverdue ? "bg-[#FEF2F2] hover:bg-[#FEE2E2]" : "hover:bg-[#F8FAFC]"
                }`}
              >
                <span className="flex-1 min-w-0 text-[13px] font-medium text-[#0F172A] truncate">
                  {name}
                </span>
                <span className="w-[110px] shrink-0 text-xs font-mono text-[#374151]">
                  {mrn ?? "—"}
                </span>
                <span className="w-[110px] shrink-0 text-[13px] text-[#64748B]">
                  {formatDate(patient.admissionDate)}
                </span>
                <span className="w-[100px] shrink-0">
                  <StatusBadge patient={patient} />
                </span>
                <span className="w-[110px] shrink-0">
                  <IdgDueBadge enrichment={enrichment} />
                </span>
                <span className="w-[150px] shrink-0 text-[13px] text-[#374151] truncate">
                  {enrichment?.primaryClinician ?? "—"}
                </span>
                <span className="w-[100px] shrink-0">
                  <CareModelBadge model={patient.careModel} />
                </span>
                <span className="w-[110px] shrink-0">
                  <NoeStatusBadge status={enrichment?.noeStatus ?? null} />
                </span>
                <span className="w-9 shrink-0 flex items-center justify-center">
                  <ChevronRight className="w-4 h-4 text-[#CBD5E1]" />
                </span>
              </button>
            );
          })}

        {/* Pagination footer */}
        {!isLoading && totalFiltered > 0 && (
          <div className="flex items-center justify-between h-12 px-4 bg-[#F8FAFC] border-t border-[#E2E8F0]">
            <span className="text-xs text-[#64748B]">
              Showing {startIdx + 1}-{Math.min(startIdx + PAGE_SIZE, totalFiltered)} of{" "}
              {totalFiltered} patients
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={`flex items-center gap-1 h-8 px-3 text-xs rounded border ${
                  currentPage <= 1
                    ? "border-[#E2E8F0] bg-white text-[#94A3B8] cursor-not-allowed"
                    : "border-[#E2E8F0] bg-white text-[#374151] hover:bg-gray-50"
                }`}
              >
                <ChevronLeft className="w-3 h-3" />
                Previous
              </button>
              <button
                type="button"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className={`flex items-center gap-1 h-8 px-3 text-xs font-medium rounded ${
                  currentPage >= totalPages
                    ? "bg-gray-200 text-[#94A3B8] cursor-not-allowed"
                    : "bg-[#2563EB] text-white hover:bg-blue-700"
                }`}
              >
                Next
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
