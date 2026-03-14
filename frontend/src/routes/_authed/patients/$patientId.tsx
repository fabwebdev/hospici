// routes/_authed/patients/$patientId.tsx
// Patient detail layout — patient banner + tab bar + Outlet for all sub-tabs

import { IDGOverdueModal } from "@/components/clinical/idg-overdue-modal.js";
import { getTrajectoryFn } from "@/functions/assessment.functions.js";
import { getCarePlanFn } from "@/functions/carePlan.functions.js";
import { getIDGComplianceFn } from "@/functions/idg.functions.js";
import { getPatientFn } from "@/functions/patient.functions.js";
import { patientKeys } from "@/lib/query/keys.js";
import type { RouterContext } from "@/routes/__root.js";
import type {
  HumanName,
  IDGComplianceStatus,
  PatientResponse,
} from "@hospici/shared-types";
import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/patients/$patientId")({
  loader: ({
    context: { queryClient },
    params: { patientId },
  }: { context: RouterContext; params: { patientId: string } }) =>
    Promise.all([
      queryClient.ensureQueryData({
        queryKey: patientKeys.detail(patientId),
        queryFn: () => getPatientFn({ data: { patientId } }),
      }),
      queryClient.ensureQueryData({
        queryKey: ["trajectory", patientId],
        queryFn: () => getTrajectoryFn({ data: { patientId } }),
      }),
      queryClient.ensureQueryData({
        queryKey: ["idg-compliance", patientId],
        queryFn: () => getIDGComplianceFn({ data: { patientId } }),
      }),
      queryClient.ensureQueryData({
        queryKey: ["care-plan", patientId],
        queryFn: () => getCarePlanFn({ data: { patientId } }),
      }),
    ]),
  component: PatientDetailLayout,
});

function formatName(names: HumanName[]): string {
  const primary = names[0];
  if (!primary) return "—";
  return `${primary.given.join(" ")} ${primary.family}`;
}

type LinkedTab = { label: string; to: string; exact?: boolean };
type DisabledTab = { label: string; disabled: true };
type Tab = LinkedTab | DisabledTab;

const TABS: Tab[] = [
  { label: "Overview",       to: ".",                                  exact: true },
  { label: "Team Comm",      to: "/patients/$patientId/team-comm" },
  { label: "Patient Info",   disabled: true },
  { label: "Encounters",     to: "/patients/$patientId/visits/" },
  { label: "Clinical Notes", disabled: true },
  { label: "HOPE",           disabled: true },
  { label: "Orders",         to: "/patients/$patientId/orders" },
  { label: "Medications",    to: "/patients/$patientId/medications" },
  { label: "Care Team",      to: "/patients/$patientId/care-team" },
  { label: "Documents",      to: "/patients/$patientId/documents" },
  { label: "Care Plan",      disabled: true },
  { label: "Dose Spot",      to: "/patients/$patientId/dose-spot" },
  { label: "Benefit Period", disabled: true },
  { label: "IDG",            to: "/patients/$patientId/idg/schedule" },
];

function PatientDetailLayout() {
  const { patientId } = Route.useParams();

  const { data: patient } = useQuery<PatientResponse>({
    queryKey: patientKeys.detail(patientId),
    queryFn: () => getPatientFn({ data: { patientId } }) as Promise<PatientResponse>,
  });

  const { data: idgCompliance } = useQuery<IDGComplianceStatus>({
    queryKey: ["idg-compliance", patientId],
    queryFn: () =>
      getIDGComplianceFn({ data: { patientId } }) as Promise<IDGComplianceStatus>,
  });

  const idgOverdue = idgCompliance !== undefined && !idgCompliance.compliant;

  const name = patient ? formatName(patient.name) : "—";
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
  const mrn = patient?.identifier.find((id) => id.system.toLowerCase().includes("mrn"))?.value;

  return (
    <div className="flex flex-col h-full">
      {/* IDG 15-day hard-block — no dismiss (42 CFR §418.56) */}
      <IDGOverdueModal
        open={idgOverdue}
        patientId={patientId}
        daysSinceLastIDG={idgCompliance?.daysSinceLastIdg ?? null}
        daysOverdue={idgCompliance?.daysOverdue ?? 0}
      />

      {/* ── Patient banner ─────────────────────────────────────────────── */}
      <div className="shrink-0 bg-white border-b border-gray-200 px-8 pt-3 pb-0">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 mb-2 text-xs text-gray-400">
          <Link to="/patients" className="hover:text-gray-600 flex items-center gap-1">
            ← Patients
          </Link>
          {patient && (
            <>
              <span>/</span>
              <span className="text-gray-500">{name}</span>
            </>
          )}
        </div>

        {/* Patient info row */}
        <div className="flex items-center justify-between pb-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-teal-600 flex items-center justify-center shrink-0">
              <span className="text-white text-sm font-bold">{initials}</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-bold text-gray-900">{name}</h1>
                {patient?.careModel && (
                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700">
                    {patient.careModel}
                  </span>
                )}
              </div>
              {patient && (
                <p className="text-xs text-gray-500 mt-0.5">
                  DOB: {patient.birthDate}
                  {mrn && ` · MRN: ${mrn}`}
                  {patient.admissionDate && ` · Admitted: ${patient.admissionDate}`}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              className="h-9 px-3.5 border border-gray-200 rounded-md text-sm text-gray-700 bg-white hover:bg-gray-50"
            >
              Print
            </button>
            <button
              type="button"
              className="h-9 px-3.5 border border-gray-200 rounded-md text-sm text-gray-700 bg-white hover:bg-gray-50"
            >
              + Add Note
            </button>
            <button
              type="button"
              className="h-9 px-3.5 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-semibold text-white"
            >
              + New Order
            </button>
          </div>
        </div>

        {/* ── Tab bar ──────────────────────────────────────────────────── */}
        <div className="flex items-end overflow-x-auto -mb-px gap-0.5">
          {TABS.map((tab) => {
            if ("disabled" in tab) {
              return (
                <span
                  key={tab.label}
                  className="px-3.5 h-10 flex items-center text-sm text-gray-300 whitespace-nowrap shrink-0 cursor-not-allowed select-none"
                >
                  {tab.label}
                </span>
              );
            }

            return (
              <Link
                key={tab.label}
                to={tab.to}
                params={{ patientId }}
                activeProps={{
                  className:
                    "px-3.5 h-10 flex items-center text-sm font-semibold text-blue-600 border-b-2 border-blue-600 whitespace-nowrap shrink-0 bg-white",
                }}
                inactiveProps={{
                  className:
                    "px-3.5 h-10 flex items-center text-sm text-gray-500 hover:text-gray-800 whitespace-nowrap shrink-0",
                }}
                activeOptions={{ exact: tab.exact ?? false }}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Tab content ────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-gray-50">
        <Outlet />
      </div>
    </div>
  );
}
