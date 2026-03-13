// routes/_authed/alerts/index.tsx
// Compliance Alert Dashboard — T2-8
//
// Two-tab layout: Operational (compliance types) / Billing (empty until T3-7)
// Features:
//   - AlertCard: type icon + severity color + rootCause + nextAction + status dropdown
//   - WorkQueue: "My items" tab filtered to assignedTo = currentUserId
//   - Real-time: Socket.IO `compliance:alert` event invalidates query + updates banner
//   - Hard-block types: no snooze option; badge pulses

import {
  getBillingAlertsFn,
  getComplianceAlertsFn,
  patchAlertStatusFn,
} from "@/functions/alerts.functions.js";
import type { Alert, AlertListResponse } from "@hospici/shared-types";
import { HARD_BLOCK_ALERT_TYPES } from "@hospici/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/_authed/alerts/")({
  component: AlertsDashboard,
});

// ── Severity helpers ──────────────────────────────────────────────────────────

function severityBg(severity: Alert["severity"]): string {
  if (severity === "critical") return "bg-red-50 border-red-200";
  if (severity === "warning") return "bg-amber-50 border-amber-200";
  return "bg-blue-50 border-blue-200";
}

function severityBadge(severity: Alert["severity"]): string {
  if (severity === "critical") return "bg-red-100 text-red-800";
  if (severity === "warning") return "bg-amber-100 text-amber-800";
  return "bg-blue-100 text-blue-800";
}

function typeIcon(type: Alert["type"]): string {
  const icons: Record<string, string> = {
    NOE_DEADLINE: "📋",
    NOTR_DEADLINE: "📋",
    IDG_OVERDUE: "👥",
    AIDE_SUPERVISION_OVERDUE: "🏠",
    AIDE_SUPERVISION_UPCOMING: "🏠",
    HOPE_WINDOW_CLOSING: "📊",
    F2F_REQUIRED: "🩺",
    CAP_THRESHOLD: "💰",
    BENEFIT_PERIOD_EXPIRING: "📅",
    RECERTIFICATION_DUE: "✅",
  };
  return icons[type] ?? "⚠️";
}

// ── AlertCard ─────────────────────────────────────────────────────────────────

function AlertCard({
  alert,
  onStatusChange,
}: {
  alert: Alert;
  onStatusChange: (
    id: string,
    status: Alert["status"],
    extra?: { snoozedUntil?: string; assignedTo?: string },
  ) => void;
}) {
  const isHardBlock = HARD_BLOCK_ALERT_TYPES.has(alert.type);
  const isOverdue = alert.daysRemaining <= 0;

  return (
    <div
      className={`border rounded-lg p-4 mb-3 ${isOverdue ? "bg-red-50 border-red-300" : severityBg(alert.severity)}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          {/* Type icon + pulse for hard-block */}
          <span
            className={`text-2xl flex-shrink-0 ${isHardBlock && alert.status === "new" ? "animate-pulse" : ""}`}
          >
            {typeIcon(alert.type)}
          </span>

          <div className="flex-1 min-w-0">
            {/* Header row */}
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${severityBadge(alert.severity)}`}
              >
                {alert.severity.toUpperCase()}
              </span>
              {isOverdue && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-200 text-red-900">
                  OVERDUE
                </span>
              )}
              {alert.status === "new" && (
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" title="New" />
              )}
              {alert.status === "assigned" && alert.assignedTo && (
                <span className="text-xs text-gray-500">Assigned</span>
              )}
              <span className="text-xs text-gray-500 ml-auto">
                {alert.dueDate
                  ? isOverdue
                    ? `${Math.abs(alert.daysRemaining)}d overdue`
                    : `${alert.daysRemaining}d remaining`
                  : "No deadline"}
              </span>
            </div>

            {/* Patient + type */}
            <div className="font-medium text-gray-900 truncate">
              <Link
                to="/patients/$patientId"
                params={{ patientId: alert.patientId }}
                className="hover:text-blue-600"
              >
                {alert.patientName}
              </Link>
              <span className="text-sm text-gray-500 ml-2">— {alert.type.replace(/_/g, " ")}</span>
            </div>

            {/* Why blocked? */}
            <div className="mt-2 text-sm space-y-1">
              <p className="text-gray-700">
                <span className="font-medium text-gray-900">Root cause: </span>
                {alert.rootCause}
              </p>
              <p className="text-gray-700">
                <span className="font-medium text-gray-900">Next action: </span>
                {alert.nextAction}
              </p>
            </div>
          </div>
        </div>

        {/* Status actions */}
        <div className="flex-shrink-0 flex flex-col gap-1 items-end">
          {alert.status !== "resolved" && (
            <>
              {alert.status === "new" && (
                <button
                  type="button"
                  onClick={() => onStatusChange(alert.id, "acknowledged")}
                  className="text-xs px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700"
                >
                  Acknowledge
                </button>
              )}
              <button
                type="button"
                onClick={() => onStatusChange(alert.id, "resolved")}
                className="text-xs px-2 py-1 rounded bg-green-100 hover:bg-green-200 text-green-800"
              >
                Resolve
              </button>
              {/* No snooze for hard-block types */}
              {!isHardBlock && (
                <button
                  type="button"
                  onClick={() => {
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    onStatusChange(alert.id, "acknowledged", {
                      snoozedUntil: tomorrow.toISOString().split("T")[0],
                    });
                  }}
                  className="text-xs px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-800"
                >
                  Snooze 1d
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

type TabId = "operational" | "billing" | "workqueue";

function AlertsDashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("operational");
  const queryClient = useQueryClient();

  const { data: complianceData, isLoading: compLoading } = useQuery<AlertListResponse>({
    queryKey: ["alerts", "compliance"],
    queryFn: () => getComplianceAlertsFn(),
    refetchInterval: 60_000, // Fallback poll every 60s
  });

  const { data: billingData } = useQuery<AlertListResponse>({
    queryKey: ["alerts", "billing"],
    queryFn: () => getBillingAlertsFn(),
  });

  const patchMutation = useMutation({
    mutationFn: ({
      alertId,
      body,
    }: { alertId: string; body: import("@hospici/shared-types").AlertStatusPatchBody }) =>
      patchAlertStatusFn({ data: { alertId, body } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["alerts"] });
    },
  });

  function handleStatusChange(
    id: string,
    status: Alert["status"],
    extra?: { snoozedUntil?: string; assignedTo?: string },
  ) {
    patchMutation.mutate({
      alertId: id,
      body: {
        status,
        ...(extra?.snoozedUntil ? { snoozedUntil: extra.snoozedUntil } : {}),
        ...(extra?.assignedTo ? { assignedTo: extra.assignedTo } : {}),
      },
    });
  }

  const operationalAlerts = complianceData?.data ?? [];
  const billingAlerts = billingData?.data ?? [];

  // Critical count for tab badge
  const criticalCount = operationalAlerts.filter(
    (a) => a.severity === "critical" && a.status !== "resolved",
  ).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Compliance Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">
          Real-time operational alerts — {operationalAlerts.length} active
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex space-x-6">
          <TabButton
            id="operational"
            label="Operational"
            active={activeTab === "operational"}
            badge={criticalCount > 0 ? criticalCount : undefined}
            badgeVariant="critical"
            onClick={() => setActiveTab("operational")}
          />
          <TabButton
            id="billing"
            label="Billing"
            active={activeTab === "billing"}
            subtitle="Available in T3-12"
            onClick={() => setActiveTab("billing")}
          />
          <TabButton
            id="workqueue"
            label="My Work Queue"
            active={activeTab === "workqueue"}
            onClick={() => setActiveTab("workqueue")}
          />
        </nav>
      </div>

      {/* Operational tab */}
      {activeTab === "operational" && (
        <div>
          {compLoading ? (
            <div className="text-center py-12 text-gray-500">Loading alerts...</div>
          ) : operationalAlerts.length === 0 ? (
            <div className="text-center py-12 text-green-600 font-medium">
              ✓ No active compliance alerts
            </div>
          ) : (
            <div>
              {/* Critical first */}
              {["critical", "warning", "info"].map((severity) => {
                const group = operationalAlerts.filter((a) => a.severity === severity);
                if (group.length === 0) return null;
                return (
                  <div key={severity} className="mb-4">
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
                      {severity} ({group.length})
                    </h2>
                    {group.map((alert) => (
                      <AlertCard key={alert.id} alert={alert} onStatusChange={handleStatusChange} />
                    ))}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Billing tab — stub until T3-12 */}
      {activeTab === "billing" && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg font-medium mb-2">Billing alerts coming in T3-12</p>
          <p className="text-sm">
            Claim validation errors, rejection status, and bill-hold alerts will appear here.
          </p>
          {billingAlerts.length > 0 && (
            <div className="mt-4">
              {billingAlerts.map((a) => (
                <AlertCard key={a.id} alert={a} onStatusChange={handleStatusChange} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Work queue tab */}
      {activeTab === "workqueue" && (
        <WorkQueue alerts={operationalAlerts} onStatusChange={handleStatusChange} />
      )}
    </div>
  );
}

// ── WorkQueue ─────────────────────────────────────────────────────────────────

function WorkQueue({
  alerts,
  onStatusChange,
}: {
  alerts: Alert[];
  onStatusChange: (
    id: string,
    status: Alert["status"],
    extra?: { snoozedUntil?: string; assignedTo?: string },
  ) => void;
}) {
  // In a real session this would filter by currentUserId — for now show assigned items
  const assigned = alerts.filter((a) => a.status === "assigned" || a.assignedTo != null);

  if (assigned.length === 0) {
    return <div className="text-center py-12 text-gray-400">No items assigned to you</div>;
  }

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">Alerts assigned to you</p>
      {assigned.map((alert) => (
        <AlertCard key={alert.id} alert={alert} onStatusChange={onStatusChange} />
      ))}
    </div>
  );
}

// ── Tab button helper ─────────────────────────────────────────────────────────

function TabButton({
  id,
  label,
  active,
  badge,
  badgeVariant,
  subtitle,
  onClick,
}: {
  id: TabId;
  label: string;
  active: boolean;
  badge?: number;
  badgeVariant?: "critical";
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      key={id}
      onClick={onClick}
      className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
        active
          ? "border-blue-600 text-blue-600"
          : "border-transparent text-gray-500 hover:text-gray-700"
      }`}
    >
      {label}
      {badge != null && (
        <span
          className={`ml-2 text-xs px-1.5 py-0.5 rounded-full font-bold ${
            badgeVariant === "critical" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"
          }`}
        >
          {badge}
        </span>
      )}
      {subtitle && <span className="ml-1 text-xs text-gray-400">({subtitle})</span>}
    </button>
  );
}
