// routes/_authed/dashboard.tsx
// Main dashboard — design from hospici-screens.pen "02 Dashboard"
// Two-column layout: left (alerts + schedule), right (stats + quick actions)

import { getComplianceAlertsFn } from "@/functions/alerts.functions.js";
import { getMyDashboardFn } from "@/functions/dashboard.functions.js";
import { getPatientsFn } from "@/functions/patient.functions.js";
import { patientKeys } from "@/lib/query/keys.js";
import type { RouterContext } from "@/routes/__root.js";
import { AlertType } from "@hospici/shared-types";
import type {
  Alert,
  AlertListResponse,
  DashboardScheduleItem,
  MyDashboardResponse,
  PatientListResponse,
} from "@hospici/shared-types";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";

export const Route = createFileRoute("/_authed/dashboard")({
  loader: async ({ context: { queryClient } }: { context: RouterContext }) => {
    try {
      await Promise.all([
        queryClient.ensureQueryData({
          queryKey: ["alerts", "compliance"],
          queryFn: () => getComplianceAlertsFn(),
        }),
        queryClient.ensureQueryData({
          queryKey: patientKeys.list({ limit: 1 }),
          queryFn: () => getPatientsFn({ data: { limit: 1 } }),
        }),
        queryClient.ensureQueryData({
          queryKey: ["my", "dashboard"],
          queryFn: () => getMyDashboardFn(),
        }),
      ]);
    } catch {
      // Let useQuery handle errors
    }
  },
  component: DashboardPage,
});

function DashboardPage() {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Real data: compliance alerts
  const { data: alertData } = useQuery<AlertListResponse>({
    queryKey: ["alerts", "compliance"],
    queryFn: () => getComplianceAlertsFn() as Promise<AlertListResponse>,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Real data: patient count
  const { data: patientData } = useQuery<PatientListResponse>({
    queryKey: patientKeys.list({ limit: 1 }),
    queryFn: () => getPatientsFn({ data: { limit: 1 } }) as Promise<PatientListResponse>,
  });

  // Real data: schedule + last signed note
  const { data: dashboardData } = useQuery<MyDashboardResponse>({
    queryKey: ["my", "dashboard"],
    queryFn: () => getMyDashboardFn() as Promise<MyDashboardResponse>,
    staleTime: 60_000,
  });

  const totalPatients = patientData?.total ?? 0;
  const schedule = dashboardData?.schedule ?? [];
  const lastSignedNote = dashboardData?.lastSignedNote ?? null;

  // Sort alerts: unresolved only, critical first, then by daysRemaining ascending
  const alerts = useMemo(() => {
    const unresolved = (alertData?.data ?? []).filter((a) => a.status !== "resolved");
    return unresolved
      .sort((a, b) => {
        if (a.severity === "critical" && b.severity !== "critical") return -1;
        if (b.severity === "critical" && a.severity !== "critical") return 1;
        return a.daysRemaining - b.daysRemaining;
      })
      .slice(0, 5);
  }, [alertData]);

  const critCount = alerts.filter((a) => a.severity === "critical").length;
  const warnCount = alerts.filter((a) => a.severity === "warning").length;

  // Count requiring attention (critical or warning with <=3 days)
  const attentionCount = (alertData?.data ?? []).filter(
    (a) => a.status !== "resolved" && (a.severity === "critical" || a.daysRemaining <= 3),
  ).length;

  // Patients requiring attention — derived from alerts, grouped by patient
  const patientsRequiringAttention = useMemo(() => {
    const ATTENTION_TYPES = new Set<string>([
      AlertType.IDG_OVERDUE,
      AlertType.HOPE_WINDOW_CLOSING,
      AlertType.BENEFIT_PERIOD_EXPIRING,
      AlertType.RECERT_DUE,
      AlertType.RECERT_AT_RISK,
      AlertType.RECERT_PAST_DUE,
    ]);
    const unresolved = (alertData?.data ?? []).filter(
      (a) => a.status !== "resolved" && ATTENTION_TYPES.has(a.type),
    );
    const byPatient = new Map<
      string,
      { patientName: string; patientId: string; reasons: { label: string; isCrit: boolean }[] }
    >();
    for (const alert of unresolved) {
      if (!byPatient.has(alert.patientId)) {
        byPatient.set(alert.patientId, {
          patientId: alert.patientId,
          patientName: alert.patientName,
          reasons: [],
        });
      }
      const entry = byPatient.get(alert.patientId);
      if (!entry) continue;
      const label = ATTENTION_LABELS[alert.type] ?? alert.type;
      if (!entry.reasons.some((r) => r.label === label)) {
        entry.reasons.push({ label, isCrit: alert.severity === "critical" });
      }
    }
    return [...byPatient.values()].slice(0, 7);
  }, [alertData]);

  return (
    <div className="flex-1 bg-[#F1F5F9] overflow-y-auto">
      <div className="py-7 px-8 space-y-6 max-w-full">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <h1
            className="text-[22px] font-semibold text-[#0F172A]"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Dashboard
          </h1>
          <span className="text-[13px] text-[#64748B]">{today}</span>
        </div>

        {/* Two-column layout */}
        <div className="flex gap-6">
          {/* Left column — alerts + schedule + attention */}
          <div className="flex-1 space-y-4">
            <AlertsCard alerts={alerts} critCount={critCount} warnCount={warnCount} />
            <ScheduleCard items={schedule} />
            <PatientsRequiringAttentionCard patients={patientsRequiringAttention} />
          </div>

          {/* Right column — stats + quick actions */}
          <div className="w-[300px] shrink-0 space-y-4">
            <StatsCard
              label="My Patients"
              value={String(totalPatients)}
              sub={`Active at Palm Valley · ${attentionCount} requiring attention`}
            />
            <LastNoteCard note={lastSignedNote} />
            <QuickActionsCard />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Attention label map ──────────────────────────────────────────────────────

const ATTENTION_LABELS: Partial<Record<string, string>> = {
  [AlertType.IDG_OVERDUE]: "IDG Overdue",
  [AlertType.HOPE_WINDOW_CLOSING]: "HOPE Window Closing",
  [AlertType.BENEFIT_PERIOD_EXPIRING]: "Benefit Period Expiring",
  [AlertType.RECERT_DUE]: "Recert Due",
  [AlertType.RECERT_AT_RISK]: "Recert At Risk",
  [AlertType.RECERT_PAST_DUE]: "Recert Past Due",
};

// ── Alerts Card ──────────────────────────────────────────────────────────────

function formatAlertBadge(alert: Alert): string {
  // Cap alerts show percentage
  if (alert.type.startsWith("CAP_")) {
    const match = alert.description.match(/(\d+)%/);
    if (match) return `${match[1]}%`;
  }
  // Days-based alerts
  const days = alert.daysRemaining;
  if (days < 0) return `${days}d`;
  return `${days}d`;
}

function AlertsCard({
  alerts,
  critCount,
  warnCount,
}: {
  alerts: Alert[];
  critCount: number;
  warnCount: number;
}) {
  return (
    <div className="bg-white border border-[#E2E8F0] p-5 space-y-3">
      {/* Header */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span
            className="text-sm font-semibold text-[#0F172A]"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Compliance Alerts
          </span>
          <Link to="/alerts" className="text-xs text-[#2563EB]">
            View all →
          </Link>
        </div>
        <div className="flex gap-2">
          <span className="inline-flex items-center gap-1.5 h-6 px-2.5 text-[11px] font-medium bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#DC2626]" />
            {critCount} Critical
          </span>
          <span className="inline-flex items-center gap-1.5 h-6 px-2.5 text-[11px] font-medium bg-[#FFFBEB] text-[#92400E] border border-[#FCD34D]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#D97706]" />
            {warnCount} Warnings
          </span>
        </div>
      </div>

      {/* Alert rows */}
      {alerts.length === 0 && (
        <div className="py-6 text-center text-sm text-[#94A3B8]">No active compliance alerts</div>
      )}

      {alerts.map((alert) => {
        const isCrit = alert.severity === "critical";
        return (
          <div
            key={alert.id}
            className={`flex items-center gap-3 p-3 border-l-4 border border-l-transparent ${
              isCrit
                ? "bg-[#FEF2F2] border-[#FCA5A5] border-l-[#DC2626]"
                : "bg-[#FFFBEB] border-[#FCD34D] border-l-[#D97706]"
            }`}
          >
            <div
              className={`w-2 h-2 rounded-full shrink-0 ${isCrit ? "bg-[#DC2626]" : "bg-[#D97706]"}`}
            />
            <div className="flex-1 min-w-0 space-y-0.5">
              <p
                className={`text-[13px] font-medium ${isCrit ? "text-[#991B1B]" : "text-[#92400E]"}`}
              >
                {alert.description}
                {alert.patientName ? ` — ${alert.patientName}` : ""}
              </p>
              <p className={`text-[11px] ${isCrit ? "text-[#DC2626]" : "text-[#D97706]"}`}>
                {alert.nextAction}
              </p>
              <p className="text-[11px] text-[#94A3B8]">{alert.rootCause}</p>
            </div>
            <span
              className={`text-sm font-semibold shrink-0 ${isCrit ? "text-[#DC2626]" : "text-[#D97706]"}`}
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {formatAlertBadge(alert)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Schedule Card ────────────────────────────────────────────────────────────

const VISIT_TYPE_DISPLAY: Record<string, { label: string; color: string; bg: string }> = {
  routine_rn: { label: "Routine Visit", color: "text-[#1D4ED8]", bg: "bg-[#EFF6FF]" },
  admission: { label: "Admission", color: "text-[#1D4ED8]", bg: "bg-[#EFF6FF]" },
  recertification: { label: "Recertification", color: "text-[#1D4ED8]", bg: "bg-[#EFF6FF]" },
  discharge: { label: "Discharge", color: "text-[#64748B]", bg: "bg-[#F1F5F9]" },
  crisis_visit: { label: "Crisis Visit", color: "text-[#9A3412]", bg: "bg-[#FFF7ED]" },
  social_work: { label: "Social Work", color: "text-[#7C3AED]", bg: "bg-[#F3E8FF]" },
  chaplain: { label: "Chaplain", color: "text-[#7C3AED]", bg: "bg-[#F3E8FF]" },
  therapy: { label: "Therapy", color: "text-[#0D9488]", bg: "bg-[#F0FDFA]" },
  aide_visit: { label: "Aide Visit", color: "text-[#64748B]", bg: "bg-[#F1F5F9]" },
  supervision: { label: "Supervision", color: "text-[#92400E]", bg: "bg-[#FFFBEB]" },
  progress_note: { label: "Progress Note", color: "text-[#1D4ED8]", bg: "bg-[#EFF6FF]" },
  "IDG Meeting": { label: "IDG Meeting", color: "text-[#166534]", bg: "bg-[#F0FDF4]" },
};

function ScheduleCard({ items }: { items: DashboardScheduleItem[] }) {
  const visitCount = items.filter((i) => i.type === "visit").length;
  const idgCount = items.filter((i) => i.type === "idg").length;

  const subtitle = [
    visitCount > 0 ? `${visitCount} encounter${visitCount !== 1 ? "s" : ""} scheduled` : null,
    idgCount > 0 ? `${idgCount} IDG meeting${idgCount !== 1 ? "s" : ""}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="bg-white border border-[#E2E8F0] p-5 space-y-0">
      <h3
        className="text-sm font-semibold text-[#0F172A]"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        Today&apos;s Schedule
      </h3>
      <p className="text-xs text-[#64748B] mt-1">
        {items.length === 0 ? "No visits scheduled today" : subtitle}
      </p>

      {items.map((item, i) => {
        const display = VISIT_TYPE_DISPLAY[item.visitType] ?? {
          label: item.visitType,
          color: "text-[#374151]",
          bg: "bg-[#F1F5F9]",
        };
        return (
          <div
            key={item.id}
            className={`flex items-center gap-3 py-3.5 ${
              i < items.length - 1 ? "border-b border-[#F1F5F9]" : ""
            }`}
          >
            <span
              className="text-xs text-[#64748B] w-10 shrink-0"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
            >
              {item.time}
            </span>
            <span
              className={`text-[11px] ${display.color} ${display.bg} h-[22px] px-2 inline-flex items-center`}
            >
              {display.label}
            </span>
            <span className="text-[13px] font-medium text-[#0F172A]">{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Stats Card ───────────────────────────────────────────────────────────────

function StatsCard({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="bg-white border border-[#E2E8F0] p-5 space-y-1">
      <p className="text-xs font-medium text-[#64748B]">{label}</p>
      <p
        className="text-[40px] font-semibold text-[#2563EB] leading-tight"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        {value}
      </p>
      <p className="text-xs text-[#94A3B8]">{sub}</p>
    </div>
  );
}

// ── Last Note Card ───────────────────────────────────────────────────────────

function formatNoteTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `Today ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${time}`;
}

function LastNoteCard({ note }: { note: MyDashboardResponse["lastSignedNote"] }) {
  return (
    <div className="bg-white border border-[#E2E8F0] p-5 space-y-1">
      <p className="text-xs font-medium text-[#64748B]">Last Signed Note</p>
      {note ? (
        <>
          <p
            className="text-[13px] text-[#0F172A]"
            style={{ fontFamily: "'JetBrains Mono', monospace" }}
          >
            {formatNoteTimestamp(note.visitedAt)}
          </p>
          <p className="text-xs text-[#94A3B8]">
            {note.visitType} · {note.patientName}
          </p>
        </>
      ) : (
        <p className="text-[13px] text-[#94A3B8]">No signed notes yet</p>
      )}
    </div>
  );
}

// ── Patients Requiring Attention Card ────────────────────────────────────────

function PatientsRequiringAttentionCard({
  patients,
}: {
  patients: {
    patientId: string;
    patientName: string;
    reasons: { label: string; isCrit: boolean }[];
  }[];
}) {
  if (patients.length === 0) return null;

  return (
    <div className="bg-white border border-[#E2E8F0] p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span
          className="text-sm font-semibold text-[#0F172A]"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Patients Requiring Attention
        </span>
        <Link to="/alerts" className="text-xs text-[#2563EB]">
          View all →
        </Link>
      </div>

      <div className="space-y-0">
        {patients.map((pt, i) => (
          <Link
            key={pt.patientId}
            to="/patients/$patientId"
            params={{ patientId: pt.patientId }}
            className={`flex items-center gap-3 py-3 ${
              i < patients.length - 1 ? "border-b border-[#F1F5F9]" : ""
            } hover:bg-[#F8FAFC] -mx-2 px-2`}
          >
            <div className="flex-1 min-w-0 space-y-1">
              <p className="text-[13px] font-medium text-[#0F172A] truncate">{pt.patientName}</p>
              <div className="flex flex-wrap gap-1">
                {pt.reasons.map((r) => (
                  <span
                    key={r.label}
                    className={`text-[10px] font-medium px-1.5 py-0.5 inline-flex items-center ${
                      r.isCrit ? "bg-[#FEE2E2] text-[#991B1B]" : "bg-[#FFFBEB] text-[#92400E]"
                    }`}
                  >
                    {r.label}
                  </span>
                ))}
              </div>
            </div>
            <svg
              className="w-3.5 h-3.5 text-[#94A3B8] shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <title>Go to patient</title>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
            </svg>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Quick Actions Card ───────────────────────────────────────────────────────

function QuickActionsCard() {
  return (
    <div className="bg-white border border-[#E2E8F0] p-5 space-y-2.5">
      <h3
        className="text-sm font-semibold text-[#0F172A]"
        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
      >
        Quick Actions
      </h3>

      {/* Clinical section */}
      <div className="pt-1 pb-0.5">
        <span className="text-[10px] font-semibold text-[#94A3B8] tracking-wide">CLINICAL</span>
      </div>

      <Link
        to="/patients/new"
        className="flex items-center gap-2.5 h-[42px] px-3.5 bg-[#2563EB] text-white text-[13px] font-medium w-full"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <title>New Admission</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v-2M12 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6"
          />
        </svg>
        New Admission
      </Link>

      <button
        type="button"
        className="flex items-center gap-2.5 h-[42px] px-3.5 bg-white border border-[#E2E8F0] text-[13px] text-[#374151] w-full"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <title>Start Visit Note</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
        </svg>
        Start Visit Note
      </button>

      <button
        type="button"
        className="flex items-center gap-2.5 h-[42px] px-3.5 bg-[#F0FDFA] border border-[#99F6E4] text-[13px] text-[#0D9488] font-medium w-full"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <title>VantageChart</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2 2-2 2M21 3l-2 2 2 2M13 15l2 2-2 2M21 15l-2 2 2 2"
          />
        </svg>
        VantageChart™
      </button>

      {/* Compliance section */}
      <div className="pt-2 pb-0.5">
        <span className="text-[10px] font-semibold text-[#94A3B8] tracking-wide">COMPLIANCE</span>
      </div>

      <Link
        to="/filings"
        className="flex items-center gap-2.5 h-[42px] px-3.5 bg-white border border-[#E2E8F0] text-[13px] text-[#374151] w-full"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <title>File NOE</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"
          />
        </svg>
        File NOE
      </Link>

      <button
        type="button"
        className="flex items-center gap-2.5 h-[42px] px-3.5 bg-white border border-[#E2E8F0] text-[13px] text-[#374151] w-full"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <title>Schedule IDG</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"
          />
        </svg>
        Schedule IDG
      </button>
    </div>
  );
}
