// routes/_authed/patients/index.tsx
// Patient list — matches Pencil design "03 Patient List"

import { getPatientsFn } from "@/functions/patient.functions.js";
import { patientKeys } from "@/lib/query/keys.js";
import type { RouterContext } from "@/routes/__root.js";
import type { HumanName, PatientListResponse, PatientResponse } from "@hospici/shared-types";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronRight, Plus, Search } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authed/patients/")({
  loader: async ({ context: { queryClient } }: { context: RouterContext }) => {
    try {
      await queryClient.ensureQueryData({
        queryKey: patientKeys.list(),
        queryFn: () => getPatientsFn(),
      });
    } catch {
      // Let the component handle the error via useQuery
    }
  },
  component: PatientsListPage,
});

function formatName(names: HumanName[]): string {
  const primary = names[0];
  if (!primary) return "—";
  return `${primary.given.join(" ")} ${primary.family}`;
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

// ── Care model badge ─────────────────────────────────────────────────────────

const CARE_MODEL_STYLES: Record<string, { bg: string; text: string }> = {
  HOSPICE: { bg: "bg-blue-50 border-blue-200", text: "text-blue-700" },
  PALLIATIVE: { bg: "bg-purple-50 border-purple-200", text: "text-purple-700" },
  CCM: { bg: "bg-teal-50 border-teal-200", text: "text-teal-700" },
};

function CareModelBadge({ model }: { model: string | undefined }) {
  if (!model) return <span className="text-gray-400 text-xs">—</span>;
  const style = CARE_MODEL_STYLES[model] ?? {
    bg: "bg-gray-50 border-gray-200",
    text: "text-gray-600",
  };
  return (
    <span
      className={`inline-flex items-center px-2 h-[22px] text-[10px] font-semibold ${style.bg} ${style.text}`}
    >
      {model}
    </span>
  );
}

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | undefined }) {
  const s = status ?? "admitted";
  const lower = s.toLowerCase();
  if (lower === "admitted") {
    return (
      <span className="inline-flex items-center px-2 h-[22px] text-[11px] bg-green-100 text-green-800">
        Admitted
      </span>
    );
  }
  if (lower === "discharged") {
    return (
      <span className="inline-flex items-center px-2 h-[22px] text-[11px] bg-gray-100 text-gray-500">
        Discharged
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 h-[22px] text-[11px] bg-yellow-100 text-yellow-800">
      {s}
    </span>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

function PatientsListPage() {
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery<PatientListResponse>({
    queryKey: patientKeys.list(),
    queryFn: () => getPatientsFn() as Promise<PatientListResponse>,
  });

  const patients = data?.patients ?? [];

  const filtered = search
    ? patients.filter((p) => {
        const name = formatName(p.name).toLowerCase();
        const mrn =
          p.identifier.find((id) => id.system.toLowerCase().includes("mrn"))?.value.toLowerCase() ??
          "";
        return name.includes(search.toLowerCase()) || mrn.includes(search.toLowerCase());
      })
    : patients;

  const totalCount = data?.total ?? patients.length;

  function handleRowClick(patient: PatientResponse) {
    void navigate({ to: "/patients/$patientId", params: { patientId: patient.id } });
  }

  return (
    <div className="flex flex-col gap-5 p-7">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <h1 className="text-[22px] font-semibold text-gray-900">Patients</h1>
          <p className="text-sm text-gray-500">
            {totalCount} active patient{totalCount !== 1 ? "s" : ""}
          </p>
        </div>
        <Link
          to="/patients/new"
          className="flex items-center gap-2 h-10 px-4 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
        >
          <Plus className="w-3.5 h-3.5" />
          New Admission
        </Link>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-2.5">
        <span className="inline-flex items-center h-8 px-3 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded">
          {totalCount} Patients
        </span>
      </div>

      {/* Search + filters */}
      <div className="flex items-center gap-2.5">
        <div className="flex items-center gap-2 flex-1 h-[38px] px-3 bg-white border border-gray-200 rounded">
          <Search className="w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search patients by name or MRN…"
            className="flex-1 text-sm outline-none text-gray-700 placeholder-gray-400 bg-transparent"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5 h-[38px] px-3 bg-white border border-gray-200 rounded text-sm text-gray-700 cursor-pointer">
          Status: All
          <ChevronRight className="w-3 h-3 text-gray-400 rotate-90" />
        </div>
        <div className="flex items-center gap-1.5 h-[38px] px-3 bg-white border border-gray-200 rounded text-sm text-gray-700 cursor-pointer">
          Care Model: All
          <ChevronRight className="w-3 h-3 text-gray-400 rotate-90" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* Table header */}
        <div className="flex items-center h-11 px-4 bg-gray-50 border-b border-gray-200">
          <span className="flex-1 min-w-0 text-xs font-medium text-gray-500">Patient Name</span>
          <span className="w-[110px] shrink-0 text-xs font-medium text-gray-500">MRN</span>
          <span className="w-[110px] shrink-0 text-xs font-medium text-gray-500">Admission</span>
          <span className="w-[100px] shrink-0 text-xs font-medium text-gray-500">Status</span>
          <span className="w-[100px] shrink-0 text-xs font-medium text-gray-500">Care Model</span>
          <span className="w-9 shrink-0" />
        </div>

        {/* Loading */}
        {isLoading && (
          <div className="text-center py-12 text-sm text-gray-400">Loading patients…</div>
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
            <p className="text-sm text-gray-500">
              {search ? "No patients match your search." : "No patients found."}
            </p>
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="mt-2 text-sm text-blue-600 hover:text-blue-800"
              >
                Clear search
              </button>
            )}
          </div>
        )}

        {/* Rows */}
        {!isLoading &&
          filtered.map((patient) => {
            const name = formatName(patient.name);
            const mrn = patient.identifier.find((id) =>
              id.system.toLowerCase().includes("mrn"),
            )?.value;

            return (
              <button
                key={patient.id}
                type="button"
                onClick={() => handleRowClick(patient)}
                className="flex items-center w-full h-14 px-4 border-b border-gray-100 cursor-pointer hover:bg-gray-50 transition-colors text-left"
              >
                <span className="flex-1 min-w-0 text-sm font-medium text-gray-900 truncate">
                  {name}
                </span>
                <span className="w-[110px] shrink-0 text-xs font-mono text-gray-600">
                  {mrn ?? "—"}
                </span>
                <span className="w-[110px] shrink-0 text-sm text-gray-500">
                  {formatDate(patient.admissionDate)}
                </span>
                <span className="w-[100px] shrink-0">
                  <StatusBadge status={patient.status} />
                </span>
                <span className="w-[100px] shrink-0">
                  <CareModelBadge model={patient.careModel} />
                </span>
                <span className="w-9 shrink-0 flex items-center justify-center">
                  <ChevronRight className="w-4 h-4 text-gray-300" />
                </span>
              </button>
            );
          })}

        {/* Footer */}
        {!isLoading && filtered.length > 0 && (
          <div className="flex items-center justify-between h-12 px-4 bg-gray-50 border-t border-gray-200">
            <span className="text-xs text-gray-500">
              Showing {filtered.length} of {totalCount} patients
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
