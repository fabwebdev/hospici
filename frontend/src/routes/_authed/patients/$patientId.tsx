// routes/_authed/patients/$patientId.tsx
// Patient detail layout — sticky patient banner + tab bar + Outlet for all sub-tabs

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
  TrajectoryDataPoint,
  TrajectoryResponse,
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

// ── Mini sparkline for the patient header ─────────────────────────────────────

function HeaderSparkline({
  label,
  points,
  color,
}: { label: string; points: (number | null)[]; color: string }) {
  const defined = points.filter((p): p is number => p !== null);
  if (defined.length < 2) {
    return (
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-[10px] text-gray-400">{label}</span>
        <span className="text-[10px] text-gray-300 font-mono">—</span>
      </div>
    );
  }
  const w = 56;
  const h = 20;
  const max = 10;
  const stepX = w / (points.length - 1);
  const segs: string[] = [];
  let inSeg = false;
  for (let i = 0; i < points.length; i++) {
    const val = points[i] ?? null;
    if (val === null) { inSeg = false; continue; }
    const x = i * stepX;
    const y = h - (val / max) * h;
    if (!inSeg) { segs.push(`M${x.toFixed(1)},${y.toFixed(1)}`); inSeg = true; }
    else { segs.push(`L${x.toFixed(1)},${y.toFixed(1)}`); }
  }
  const last = defined[defined.length - 1] ?? 0;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[10px] text-gray-400">{label}</span>
      <svg width={w} height={h} role="img" aria-label={`${label} trend`}>
        <title>{label} trend</title>
        <path d={segs.join(" ")} stroke={color} strokeWidth="1.5" fill="none" />
      </svg>
      <span className="text-[10px] font-mono font-semibold" style={{ color }}>{last}/10</span>
    </div>
  );
}

function trendColor(vals: (number | null)[]): string {
  const d = vals.filter((v): v is number => v !== null);
  if (d.length < 2) return "#9ca3af";
  const last = d[d.length - 1] ?? 0;
  const prev = d[d.length - 2] ?? 0;
  if (last > prev + 1) return "#ef4444";
  if (last < prev - 1) return "#22c55e";
  return "#f59e0b";
}

// ── Tabs ───────────────────────────────────────────────────────────────────────

type LinkedTab = { label: string; to: string; exact?: boolean };
type DisabledTab = { label: string; disabled: true };
type Tab = LinkedTab | DisabledTab;

const TABS: Tab[] = [
  { label: "Overview",       to: ".",                                      exact: true },
  { label: "Patient Info",   to: "/patients/$patientId/info" },
  { label: "Team Comm",      to: "/patients/$patientId/team-comm" },
  { label: "Encounters",     to: "/patients/$patientId/visits/" },
  { label: "Clinical Notes", to: "/patients/$patientId/clinical-notes" },
  { label: "HOPE",           disabled: true },
  { label: "Orders",         to: "/patients/$patientId/orders" },
  { label: "Medications",    to: "/patients/$patientId/medications" },
  { label: "Care Team",      to: "/patients/$patientId/care-team" },
  { label: "Documents",      to: "/patients/$patientId/documents" },
  { label: "Care Plan",      disabled: true },
  { label: "Dose Spot",      to: "/patients/$patientId/dose-spot" },
];

// ── Layout ────────────────────────────────────────────────────────────────────

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

  const { data: trajectory } = useQuery<TrajectoryResponse>({
    queryKey: ["trajectory", patientId],
    queryFn: () => getTrajectoryFn({ data: { patientId } }) as Promise<TrajectoryResponse>,
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

  const pts: TrajectoryDataPoint[] = trajectory?.dataPoints ?? [];
  const pain    = pts.map((p) => p.pain);
  const dyspnea = pts.map((p) => p.dyspnea);
  const nausea  = pts.map((p) => p.nausea);

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
      <div className="shrink-0 bg-white border-b border-gray-200 px-6 pt-3 pb-0">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 mb-2 text-xs text-gray-400">
          <Link to="/patients" className="hover:text-gray-600">
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
        <div className="flex items-center gap-4 pb-3">
          {/* Avatar + name */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="h-10 w-10 rounded-full bg-teal-600 flex items-center justify-center shrink-0">
              <span className="text-white text-sm font-bold">{initials}</span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-base font-bold text-gray-900 truncate">{name}</h1>
                {patient?.careModel && (
                  <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700 shrink-0">
                    {patient.careModel}
                  </span>
                )}
              </div>
              {patient && (
                <p className="text-xs text-gray-500 mt-0.5 font-mono">
                  {mrn && `MRN: ${mrn}`}
                  {patient.birthDate && ` · DOB: ${patient.birthDate}`}
                  {patient.admissionDate && ` · Adm: ${patient.admissionDate}`}
                </p>
              )}
            </div>
          </div>

          {/* Decline trajectory sparklines (hidden on smaller screens) */}
          {pts.length >= 2 && (
            <div className="hidden xl:flex items-end gap-5 shrink-0 border-l border-gray-100 pl-5">
              <HeaderSparkline label="Pain"    points={pain}    color={trendColor(pain)}    />
              <HeaderSparkline label="Dyspnea" points={dyspnea} color={trendColor(dyspnea)} />
              <HeaderSparkline label="Nausea"  points={nausea}  color={trendColor(nausea)}  />
            </div>
          )}

          {/* Action buttons */}
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
