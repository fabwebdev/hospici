// components/BenefitPeriodTimeline.tsx
// Horizontal timeline cards for a patient's benefit periods — T3-4

import type { BenefitPeriod, BenefitPeriodStatus } from "@hospici/shared-types";

// ── Color helpers ─────────────────────────────────────────────────────────────

function statusColor(status: BenefitPeriodStatus): {
  bg: string;
  border: string;
  text: string;
  dot: string;
} {
  switch (status) {
    case "current":
      return {
        bg: "bg-green-50",
        border: "border-green-300",
        text: "text-green-800",
        dot: "bg-green-500",
      };
    case "upcoming":
      return {
        bg: "bg-blue-50",
        border: "border-blue-200",
        text: "text-blue-800",
        dot: "bg-blue-400",
      };
    case "recert_due":
      return {
        bg: "bg-amber-50",
        border: "border-amber-300",
        text: "text-amber-800",
        dot: "bg-amber-500",
      };
    case "at_risk":
      return {
        bg: "bg-orange-50",
        border: "border-orange-300",
        text: "text-orange-800",
        dot: "bg-orange-500",
      };
    case "past_due":
      return { bg: "bg-red-50", border: "border-red-300", text: "text-red-800", dot: "bg-red-500" };
    case "revoked":
    case "closed":
    case "discharged":
    case "transferred_out":
      return {
        bg: "bg-gray-50",
        border: "border-gray-200",
        text: "text-gray-500",
        dot: "bg-gray-400",
      };
    case "concurrent_care":
      return {
        bg: "bg-purple-50",
        border: "border-purple-200",
        text: "text-purple-800",
        dot: "bg-purple-400",
      };
    default:
      return {
        bg: "bg-gray-50",
        border: "border-gray-200",
        text: "text-gray-600",
        dot: "bg-gray-300",
      };
  }
}

// ── Period card ───────────────────────────────────────────────────────────────

function PeriodCard({
  period,
  isActive,
  onClick,
}: {
  period: BenefitPeriod;
  isActive: boolean;
  onClick: () => void;
}) {
  const colors = statusColor(period.status);
  const f2fChip =
    period.f2fRequired && period.f2fStatus !== "not_required" ? (
      <span
        className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
          period.f2fStatus === "documented"
            ? "bg-green-100 text-green-700"
            : period.f2fStatus === "missing" || period.f2fStatus === "invalid"
              ? "bg-red-100 text-red-700"
              : "bg-amber-100 text-amber-700"
        }`}
      >
        F2F
      </span>
    ) : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex flex-col min-w-[160px] max-w-[180px] border-2 rounded-lg p-3 text-left transition-all cursor-pointer ${
        colors.bg
      } ${colors.border} ${isActive ? "ring-2 ring-offset-1 ring-blue-400 shadow-md" : "hover:shadow-sm"}`}
    >
      {/* Period number badge */}
      <div className={"flex items-center gap-1.5 mb-2"}>
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors.dot}`} />
        <span className={`text-xs font-semibold uppercase tracking-wide ${colors.text}`}>
          Period #{period.periodNumber}
        </span>
        {period.isReportingPeriod && (
          <span className="text-[10px] bg-blue-600 text-white px-1 rounded font-medium">RPT</span>
        )}
        {period.isTransferDerived && (
          <span className="text-[10px] bg-purple-100 text-purple-700 px-1 rounded font-medium">
            H→H
          </span>
        )}
      </div>

      {/* Date range */}
      <div className="text-xs text-gray-600 mb-1">
        {period.startDate}
        <br />→ {period.endDate}
      </div>

      {/* Period length */}
      <div className="text-xs text-gray-400 mb-2">{period.periodLengthDays}d</div>

      {/* Status */}
      <div
        className={`text-[11px] font-medium px-1.5 py-0.5 rounded self-start mb-1.5 ${colors.bg} ${colors.text}`}
      >
        {period.status.replace(/_/g, " ")}
      </div>

      {/* Chips */}
      <div className="flex flex-wrap gap-1">
        {f2fChip}
        {period.billingRisk && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-100 text-red-700">
            Billing Risk
          </span>
        )}
      </div>

      {/* Recert due */}
      {period.recertDueDate && (
        <div className="mt-2 text-[10px] text-gray-500">Recert: {period.recertDueDate}</div>
      )}
    </button>
  );
}

// ── Timeline connector ────────────────────────────────────────────────────────

function TimelineConnector() {
  return (
    <div className="flex items-center self-center">
      <div className="h-0.5 w-6 bg-gray-300" />
      <span className="text-gray-300 text-xs">▶</span>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface BenefitPeriodTimelineProps {
  periods: BenefitPeriod[];
  activePeriodId?: string | null;
  onSelectPeriod?: (period: BenefitPeriod) => void;
}

// ── Main component ────────────────────────────────────────────────────────────

export function BenefitPeriodTimeline({
  periods,
  activePeriodId,
  onSelectPeriod,
}: BenefitPeriodTimelineProps) {
  if (periods.length === 0) {
    return (
      <div className="text-center text-gray-400 py-6 text-sm">
        No benefit periods recorded for this patient.
      </div>
    );
  }

  const sorted = [...periods].sort((a, b) => a.periodNumber - b.periodNumber);

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex items-start gap-0 min-w-max">
        {sorted.map((period, idx) => (
          <div key={period.id} className="flex items-start">
            {idx > 0 && <TimelineConnector />}
            <PeriodCard
              period={period}
              isActive={period.id === activePeriodId}
              onClick={() => onSelectPeriod?.(period)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
