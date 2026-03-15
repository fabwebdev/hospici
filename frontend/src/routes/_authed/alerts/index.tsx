// routes/_authed/alerts/index.tsx
// Compliance Alert Dashboard — "18 Compliance Alert Dashboard" pen file design
// Two-column: Critical (left, red tint) · Warnings (right, amber tint)

import { getBillingAlertsFn, getComplianceAlertsFn } from "@/functions/alerts.functions.js";
import type { RouterContext } from "@/routes/__root.js";
import { AlertType } from "@hospici/shared-types";
import type { Alert, AlertListResponse, AlertSeverity } from "@hospici/shared-types";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

export const Route = createFileRoute("/_authed/alerts/")({
  loader: async ({ context: { queryClient } }: { context: RouterContext }) => {
    await Promise.allSettled([
      queryClient.ensureQueryData({
        queryKey: ["alerts", "compliance"],
        queryFn: () => getComplianceAlertsFn(),
      }),
      queryClient.ensureQueryData({
        queryKey: ["alerts", "billing"],
        queryFn: () => getBillingAlertsFn(),
      }),
    ]);
  },
  component: AlertDashboardPage,
});

// ── Constants ──────────────────────────────────────────────────────────────────

type FilterKey =
  | "All"
  | "NOE"
  | "NOTR"
  | "IDG"
  | "Aide"
  | "HOPE"
  | "F2F"
  | "Cap"
  | "Benefit Period";

type SortKey = "days" | "patient" | "type";

const FILTER_TYPES: Record<FilterKey, ReadonlyArray<string>> = {
  All: [],
  NOE: [AlertType.NOE_DEADLINE, AlertType.NOE_LATE],
  NOTR: [AlertType.NOTR_DEADLINE, AlertType.NOTR_LATE],
  IDG: [AlertType.IDG_OVERDUE],
  Aide: [AlertType.AIDE_SUPERVISION_OVERDUE, AlertType.AIDE_SUPERVISION_UPCOMING],
  HOPE: [AlertType.HOPE_WINDOW_CLOSING],
  F2F: [
    AlertType.F2F_REQUIRED,
    AlertType.F2F_MISSING,
    AlertType.F2F_INVALID,
    AlertType.F2F_DUE_SOON,
  ],
  Cap: [
    AlertType.CAP_THRESHOLD,
    AlertType.CAP_THRESHOLD_70,
    AlertType.CAP_THRESHOLD_80,
    AlertType.CAP_THRESHOLD_90,
    AlertType.CAP_PROJECTED_OVERAGE,
  ],
  "Benefit Period": [
    AlertType.BENEFIT_PERIOD_EXPIRING,
    AlertType.RECERTIFICATION_DUE,
    AlertType.RECERT_DUE,
    AlertType.RECERT_AT_RISK,
    AlertType.RECERT_PAST_DUE,
    AlertType.BENEFIT_PERIOD_BILLING_RISK,
  ],
};

const FILTER_KEYS: FilterKey[] = [
  "All",
  "NOE",
  "NOTR",
  "IDG",
  "Aide",
  "HOPE",
  "F2F",
  "Cap",
  "Benefit Period",
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function getTypeLabel(type: string): string {
  if (type.startsWith("NOE")) return "NOE";
  if (type.startsWith("NOTR")) return "NOTR";
  if (type.startsWith("IDG")) return "IDG";
  if (type.startsWith("AIDE")) return "AIDE";
  if (type.startsWith("HOPE")) return "HOPE";
  if (type.startsWith("F2F")) return "F2F";
  if (type.startsWith("CAP")) return "CAP";
  if (type.startsWith("BENEFIT") || type.startsWith("RECERT")) return "BENEFIT PERIOD";
  if (type.startsWith("NOTE")) return "NOTE";
  if (type.startsWith("VISIT") || type.startsWith("MISSED")) return "VISIT";
  if (type.startsWith("CLAIM") || type.startsWith("BILL")) return "CLAIM";
  if (type.startsWith("ORDER")) return "ORDER";
  if (
    type.startsWith("QAPI") ||
    type.startsWith("FIRST") ||
    type.startsWith("BILLING_DEF") ||
    type.startsWith("COMPLIANCE_DEF")
  )
    return "QAPI";
  if (type.startsWith("BAA") || type.startsWith("SECURITY")) return "BAA";
  return type;
}

function getStatusLabel(alert: Alert): string {
  const t = alert.type;
  if (t === AlertType.IDG_OVERDUE) return "OVERDUE";
  if (t === AlertType.NOE_LATE || t === AlertType.NOTR_LATE) return "PAST DUE";
  if (t === AlertType.F2F_REQUIRED || t === AlertType.F2F_MISSING) return "REQUIRED";
  if (t === AlertType.F2F_INVALID) return "INVALID";
  if (t === AlertType.CAP_THRESHOLD_90 || t === AlertType.CAP_PROJECTED_OVERAGE) return "AT RISK";
  if (
    t === AlertType.CAP_THRESHOLD_70 ||
    t === AlertType.CAP_THRESHOLD_80 ||
    t === AlertType.CAP_THRESHOLD
  )
    return "THRESHOLD";
  if (t === AlertType.AIDE_SUPERVISION_OVERDUE) return "OVERDUE";
  if (t === AlertType.AIDE_SUPERVISION_UPCOMING) return "DUE SOON";
  if (t === AlertType.HOPE_WINDOW_CLOSING) return "DUE SOON";
  if (alert.daysRemaining < 0) return "PAST DUE";
  if (alert.daysRemaining === 0) return "DUE TODAY";
  if (t === AlertType.RECERT_PAST_DUE || t === AlertType.RECERT_AT_RISK) return "AT RISK";
  if (
    t === AlertType.BENEFIT_PERIOD_EXPIRING ||
    t === AlertType.RECERT_DUE ||
    t === AlertType.RECERTIFICATION_DUE
  )
    return "EXPIRING";
  return "DUE SOON";
}

function isCapSystemAlert(alert: Alert): boolean {
  return (
    alert.type === AlertType.CAP_THRESHOLD ||
    alert.type === AlertType.CAP_THRESHOLD_70 ||
    alert.type === AlertType.CAP_THRESHOLD_80 ||
    alert.type === AlertType.CAP_THRESHOLD_90 ||
    alert.type === AlertType.CAP_PROJECTED_OVERAGE
  );
}

function extractCapPct(alert: Alert): number | null {
  const m = alert.description.match(/(\d+(?:\.\d+)?)%/);
  return m ? Number.parseFloat(m[1] ?? "0") : null;
}

// ── Alert Card ─────────────────────────────────────────────────────────────────

function AlertCard({ alert }: { alert: Alert }) {
  const isCritical = alert.severity === "critical";
  const borderColor = isCritical ? "#FECACA" : "#FDE68A";
  const typeChipBg = isCritical ? "#7F1D1D" : "#92400E";
  const typeChipText = isCritical ? "#FCA5A5" : "#FDE68A";
  const statusChipBg = isCritical ? "#FEE2E2" : "#FEF3C7";
  const statusChipText = isCritical ? "#DC2626" : "#D97706";
  const daysColor = isCritical ? "#DC2626" : "#D97706";
  const ctaBg = isCritical ? "#DC2626" : "#D97706";

  const typeLabel = getTypeLabel(alert.type);
  const statusLabel = getStatusLabel(alert);
  const isCap = isCapSystemAlert(alert);
  const capPct = isCap ? extractCapPct(alert) : null;

  const hasPatient = Boolean(alert.patientId);

  return (
    <div
      className="bg-white rounded-lg flex flex-col gap-2.5 p-4"
      style={{ border: `1px solid ${borderColor}` }}
    >
      {/* Top row: chips + days counter */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded"
            style={{ background: typeChipBg, color: typeChipText }}
          >
            {typeLabel}
          </span>
          <span
            className="text-xs font-semibold px-2 py-0.5 rounded"
            style={{ background: statusChipBg, color: statusChipText }}
          >
            {statusLabel}
          </span>
        </div>
        {!isCap && (
          <div className="flex flex-col items-end shrink-0">
            <span
              className="font-bold leading-none"
              style={{
                fontFamily: "Space Grotesk, Inter, sans-serif",
                fontSize: 36,
                fontWeight: 700,
                color: daysColor,
              }}
            >
              {Math.abs(alert.daysRemaining)}
            </span>
            <span className="text-[9px] font-semibold tracking-wide" style={{ color: daysColor }}>
              {alert.daysRemaining < 0
                ? "DAYS OVERDUE"
                : alert.daysRemaining === 0
                  ? "DUE TODAY"
                  : "DAYS LEFT"}
            </span>
          </div>
        )}
        {isCap && capPct !== null && (
          <div className="flex flex-col items-end shrink-0">
            <span
              className="font-bold leading-none"
              style={{
                fontFamily: "Space Grotesk, Inter, sans-serif",
                fontSize: 28,
                color: daysColor,
              }}
            >
              {capPct}%
            </span>
            <span className="text-[9px] font-semibold tracking-wide" style={{ color: daysColor }}>
              UTILIZATION
            </span>
          </div>
        )}
      </div>

      {/* Patient name or system alert */}
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold text-gray-900">
          {alert.patientName || "System Alert"}
        </span>
        {alert.nextAction && <span className="text-xs text-gray-500">{alert.nextAction}</span>}
      </div>

      {/* Description */}
      <p className="text-xs text-gray-600 leading-relaxed" style={{ lineHeight: 1.6 }}>
        {alert.description}
      </p>

      {/* Cap utilization bar */}
      {isCap && capPct !== null && (
        <div className="flex flex-col gap-1">
          <div
            className="w-full h-2 rounded-full overflow-hidden"
            style={{ background: "#FEF3C7" }}
          >
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.min(capPct, 100)}%`, background: daysColor }}
            />
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-gray-400">0%</span>
            <span style={{ color: daysColor }} className="font-semibold">
              {capPct}% current
            </span>
            <span className="text-gray-400">100% cap</span>
          </div>
        </div>
      )}

      {/* Footer: context + CTA */}
      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className="text-xs text-gray-400 truncate">
          {alert.dueDate
            ? `Due: ${new Date(alert.dueDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
            : alert.rootCause}
        </span>
        {isCap ? (
          <Link
            to="/cap"
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium text-white shrink-0"
            style={{ background: ctaBg }}
          >
            View Cap Dashboard
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <title>arrow-right</title>
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        ) : hasPatient ? (
          <Link
            to="/patients/$patientId"
            params={{ patientId: alert.patientId }}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium text-white shrink-0"
            style={{ background: ctaBg }}
          >
            Go to Patient
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <title>arrow-right</title>
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        ) : null}
      </div>
    </div>
  );
}

// ── Column ─────────────────────────────────────────────────────────────────────

function AlertColumn({
  severity,
  alerts,
}: {
  severity: AlertSeverity;
  alerts: Alert[];
}) {
  const isCritical = severity === "critical";
  const colBg = isCritical ? "#FEF2F2" : "#FFFBEB";
  const colBorder = isCritical ? "#FECACA" : "#FDE68A";
  const hdrColor = isCritical ? "#991B1B" : "#92400E";
  const countBg = isCritical ? "#DC2626" : "#D97706";
  const icon = isCritical ? (
    <svg
      style={{ color: "#DC2626", width: 18, height: 18 }}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <title>critical</title>
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ) : (
    <svg
      style={{ color: "#D97706", width: 18, height: 18 }}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <title>warning</title>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );

  return (
    <div
      className="flex-1 flex flex-col gap-3 rounded-lg p-4 overflow-auto"
      style={{ background: colBg, border: `1px solid ${colBorder}` }}
    >
      {/* Column header */}
      <div className="flex items-center gap-2">
        {icon}
        <span
          className="text-sm font-bold tracking-wide"
          style={{ fontFamily: "Space Grotesk, Inter, sans-serif", color: hdrColor }}
        >
          {isCritical ? "CRITICAL" : "WARNINGS"}
        </span>
        <div
          className="w-6 h-6 rounded flex items-center justify-center text-xs font-semibold text-white"
          style={{ background: countBg }}
        >
          {alerts.length}
        </div>
      </div>

      {alerts.length === 0 ? (
        <div className="bg-white rounded-lg p-6 text-center">
          <p className="text-sm text-gray-400 italic">
            No {isCritical ? "critical" : "warning"} alerts — you're all clear.
          </p>
        </div>
      ) : (
        alerts.map((a) => <AlertCard key={a.id} alert={a} />)
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

function AlertDashboardPage() {
  const [activeFilter, setActiveFilter] = useState<FilterKey>("All");
  const [sort, setSort] = useState<SortKey>("days");
  const [sortOpen, setSortOpen] = useState(false);

  const { data: compliance } = useQuery<AlertListResponse>({
    queryKey: ["alerts", "compliance"],
    queryFn: () => getComplianceAlertsFn(),
  });
  const { data: billing } = useQuery<AlertListResponse>({
    queryKey: ["alerts", "billing"],
    queryFn: () => getBillingAlertsFn(),
  });

  const allAlerts = useMemo(() => {
    const seen = new Set<string>();
    const merged: Alert[] = [];
    for (const a of [...(compliance?.data ?? []), ...(billing?.data ?? [])]) {
      if (!seen.has(a.id) && a.status !== "resolved") {
        seen.add(a.id);
        merged.push(a);
      }
    }
    return merged;
  }, [compliance, billing]);

  const filtered = useMemo(() => {
    const types = FILTER_TYPES[activeFilter];
    const base =
      activeFilter === "All" ? allAlerts : allAlerts.filter((a) => types.includes(a.type));

    return [...base].sort((a, b) => {
      if (sort === "days") return a.daysRemaining - b.daysRemaining;
      if (sort === "patient") return a.patientName.localeCompare(b.patientName);
      return a.type.localeCompare(b.type);
    });
  }, [allAlerts, activeFilter, sort]);

  const critical = filtered.filter((a) => a.severity === "critical");
  const warnings = filtered.filter((a) => a.severity !== "critical");

  const totalCritical = allAlerts.filter((a) => a.severity === "critical").length;
  const totalWarnings = allAlerts.filter((a) => a.severity !== "critical").length;

  const updatedAt = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  const SORT_LABELS: Record<SortKey, string> = {
    days: "Days Remaining",
    patient: "Patient Name",
    type: "Alert Type",
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Compliance banner */}
      <div
        className="flex items-center gap-3 px-6 shrink-0"
        style={{ background: "#7F1D1D", height: 44 }}
      >
        <svg
          style={{ color: "#FCA5A5", width: 16, height: 16, flexShrink: 0 }}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <title>siren</title>
          <path d="M7 18v-6a5 5 0 1 1 10 0v6" />
          <path d="M5 21a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-1H5v1Z" />
          <path d="M21 12h1M3 12H2M12 2V1M4.2 4.2l-.7-.7M19.8 4.2l.7-.7" />
        </svg>
        {totalCritical > 0 && (
          <div
            className="flex items-center gap-1.5 px-2.5 h-7 rounded text-xs font-semibold text-white"
            style={{ background: "#DC2626" }}
          >
            <span className="w-2 h-2 rounded-full" style={{ background: "#FCA5A5" }} />
            {totalCritical} Critical
          </div>
        )}
        {totalWarnings > 0 && (
          <div
            className="flex items-center px-2.5 h-7 rounded text-xs font-semibold"
            style={{ background: "#92400E", color: "#FDE68A" }}
          >
            {totalWarnings} Warnings
          </div>
        )}
        <span className="text-xs text-red-300 hidden md:block">
          Compliance alerts require immediate action. Click any alert to navigate to the patient.
        </span>
        <span className="text-xs ml-auto shrink-0" style={{ color: "#9F1239" }}>
          Last updated: {updatedAt}
        </span>
      </div>

      {/* Main content */}
      <div className="flex flex-col gap-4 flex-1 overflow-auto" style={{ padding: "24px 28px" }}>
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-0.5">
            <h1
              className="text-2xl font-semibold text-gray-900"
              style={{ fontFamily: "Space Grotesk, Inter, sans-serif" }}
            >
              Compliance Alerts
            </h1>
            <p className="text-sm text-gray-500">
              Real-time compliance monitoring · Palm Valley Hospice
            </p>
          </div>

          {/* Sort dropdown */}
          <div className="relative">
            <button
              type="button"
              className="flex items-center gap-1.5 h-8 px-3 bg-white rounded border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
              onClick={() => setSortOpen((o) => !o)}
            >
              <span className="text-xs text-gray-500">Sort by:</span>
              {SORT_LABELS[sort]}
              <svg
                className="w-3.5 h-3.5 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <title>chevron</title>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {sortOpen && (
              <div className="absolute right-0 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg z-10 overflow-hidden">
                {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${sort === k ? "font-medium text-blue-600" : "text-gray-700"}`}
                    onClick={() => {
                      setSort(k);
                      setSortOpen(false);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Filter bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">Filter:</span>
          {FILTER_KEYS.map((key) => {
            const isActive = activeFilter === key;
            return (
              <button
                key={key}
                type="button"
                className="h-7 px-3 rounded text-xs font-medium transition-colors"
                style={
                  isActive
                    ? { background: "#0F172A", color: "#FFFFFF" }
                    : { background: "#FFFFFF", color: "#374151", border: "1px solid #E2E8F0" }
                }
                onClick={() => setActiveFilter(key)}
              >
                {key}
              </button>
            );
          })}
        </div>

        {/* Two-column alert grid */}
        <div className="flex gap-4 flex-1 min-h-0">
          <AlertColumn severity="critical" alerts={critical} />
          <AlertColumn severity="warning" alerts={warnings} />
        </div>
      </div>
    </div>
  );
}
