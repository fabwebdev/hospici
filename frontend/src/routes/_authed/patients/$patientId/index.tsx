// routes/_authed/patients/$patientId/index.tsx
// Patient Overview tab — matches "04 Patient Detail" pen file design
// Left: Trajectory · Recent Notes · Active Diagnoses
// Right: Care Team · Upcoming Visits · IDG Conference

import { getTrajectoryFn } from "@/functions/assessment.functions.js";
import { getCareTeamFn } from "@/functions/care-team.functions.js";
import { getConditionsFn } from "@/functions/conditions.functions.js";
import { getIDGComplianceFn } from "@/functions/idg.functions.js";
import { listEncountersFn } from "@/functions/vantage-chart.functions.js";
import { getScheduledVisitsFn } from "@/functions/visitSchedule.functions.js";
import type {
  CareTeamDiscipline,
  CareTeamListResponse,
  ConditionListResponse,
  EncounterListResponse,
  IDGComplianceStatus,
  ScheduledVisitListResponse,
  TrajectoryDataPoint,
  TrajectoryResponse,
} from "@hospici/shared-types";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/patients/$patientId/")({
  component: PatientOverviewPage,
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function trendColor(vals: (number | null)[]): string {
  const d = vals.filter((v): v is number => v !== null);
  if (d.length < 2) return "#94A3B8";
  const last = d[d.length - 1] ?? 0;
  const prev = d[d.length - 2] ?? 0;
  if (last > prev + 1) return "#EF4444";
  if (last < prev - 1) return "#22C55E";
  return "#F59E0B";
}

function MiniSparkline({ points, color }: { points: (number | null)[]; color: string }) {
  const defined = points.filter((p): p is number => p !== null);
  if (defined.length < 2) {
    return (
      <div className="w-16 h-5 flex items-center">
        <span className="text-xs text-gray-300">—</span>
      </div>
    );
  }
  const w = 64;
  const h = 20;
  const max = 10;
  const stepX = w / Math.max(points.length - 1, 1);
  const segs: string[] = [];
  let inSeg = false;
  for (let i = 0; i < points.length; i++) {
    const val = points[i];
    if (val === null || val === undefined) {
      inSeg = false;
      continue;
    }
    const x = i * stepX;
    const y = h - (val / max) * h;
    if (!inSeg) {
      segs.push(`M${x.toFixed(1)},${y.toFixed(1)}`);
      inSeg = true;
    } else {
      segs.push(`L${x.toFixed(1)},${y.toFixed(1)}`);
    }
  }
  return (
    <svg width={w} height={h} role="img" aria-label="trend sparkline" className="mt-0.5">
      <title>trend</title>
      <path d={segs.join(" ")} stroke={color} strokeWidth="1.5" fill="none" />
    </svg>
  );
}

// ── Card shell ─────────────────────────────────────────────────────────────────

function CardHeader({
  icon,
  title,
  right,
  bg = "white",
  borderColor = "#E2E8F0",
}: {
  icon: React.ReactNode;
  title: string;
  right?: React.ReactNode;
  bg?: string;
  borderColor?: string;
}) {
  return (
    <div
      className="flex items-center gap-2 h-11 px-4"
      style={{ borderBottom: `1px solid ${borderColor}`, background: bg }}
    >
      {icon}
      <span
        className="text-sm font-semibold text-gray-900"
        style={{ fontFamily: "Space Grotesk, Inter, sans-serif" }}
      >
        {title}
      </span>
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}

// ── Trajectory Card ────────────────────────────────────────────────────────────

function TrajectoryCard({ patientId }: { patientId: string }) {
  const { data: trajectory, isLoading } = useQuery<TrajectoryResponse>({
    queryKey: ["trajectory", patientId],
    queryFn: () => getTrajectoryFn({ data: { patientId } }) as Promise<TrajectoryResponse>,
  });

  const points: TrajectoryDataPoint[] = trajectory?.dataPoints ?? [];
  const last = points[points.length - 1];
  const pain = points.map((p) => p.pain);
  const dyspnea = points.map((p) => p.dyspnea);
  const nausea = points.map((p) => p.nausea);
  const functional = points.map((p) => p.functionalStatus);

  const tiles = [
    { label: "Pain", value: last?.pain ?? null, pts: pain },
    { label: "Dyspnea", value: last?.dyspnea ?? null, pts: dyspnea },
    { label: "Nausea", value: last?.nausea ?? null, pts: nausea },
    {
      label: "Functional",
      value: last?.functionalStatus ?? null,
      pts: functional,
    },
  ];

  const activityIcon = (
    <svg
      className="w-4 h-4 text-gray-600"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <title>activity</title>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <CardHeader
        icon={activityIcon}
        title="Decline Trajectory"
        right={
          !isLoading && points.length > 0 ? (
            <span className="text-xs text-gray-400">{points.length} assessments</span>
          ) : undefined
        }
      />
      {isLoading ? (
        <div className="p-4 text-xs text-gray-400">Loading…</div>
      ) : points.length === 0 ? (
        <div className="p-4 text-xs text-gray-400 italic">No assessments recorded yet.</div>
      ) : (
        <div className="flex divide-x divide-gray-100">
          {tiles.map(({ label, value, pts }) => {
            const color = trendColor(pts);
            return (
              <div key={label} className="flex-1 flex flex-col gap-1 px-4 py-3.5">
                <span
                  className="text-xl font-semibold text-gray-900"
                  style={{ fontFamily: "Space Grotesk, Inter, sans-serif" }}
                >
                  {value !== null && value !== undefined ? `${value}/10` : "—"}
                </span>
                <span className="text-xs text-gray-500">{label}</span>
                <MiniSparkline points={pts} color={color} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Recent Visit Notes Card ────────────────────────────────────────────────────

const VISIT_TYPE_STYLES: Record<string, { label: string; bg: string; color: string }> = {
  routine_rn: { label: "RN Visit", bg: "#EFF6FF", color: "#1D4ED8" },
  admission: { label: "Admission", bg: "#F0FDF4", color: "#166534" },
  recertification: { label: "Recert", bg: "#FEF9C3", color: "#92400E" },
  social_work: { label: "SW Visit", bg: "#F0FDF4", color: "#166534" },
  chaplain: { label: "Chaplain", bg: "#FEF9C3", color: "#78350F" },
  physician_attestation: { label: "Physician", bg: "#F5F3FF", color: "#5B21B6" },
  supervisory: { label: "Supervisory", bg: "#E0F2FE", color: "#0369A1" },
  prn: { label: "PRN", bg: "#FFF7ED", color: "#C2410C" },
  discharge: { label: "Discharge", bg: "#FEE2E2", color: "#991B1B" },
  progress_note: { label: "Progress", bg: "#F1F5F9", color: "#475569" },
};

function VisitNotesCard({ patientId }: { patientId: string }) {
  const { data, isLoading } = useQuery<EncounterListResponse>({
    queryKey: ["encounters", patientId],
    queryFn: () => listEncountersFn({ data: { patientId } }) as Promise<EncounterListResponse>,
  });

  const encounters = (data?.encounters ?? []).slice(0, 2);

  const fileTextIcon = (
    <svg
      className="w-4 h-4 text-gray-600"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <title>file-text</title>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <CardHeader
        icon={fileTextIcon}
        title="Recent Visit Notes"
        right={
          <Link
            to="/patients/$patientId/clinical-notes"
            params={{ patientId }}
            className="text-xs text-blue-600 hover:underline"
          >
            View all →
          </Link>
        }
      />
      {isLoading ? (
        <div className="p-4 text-xs text-gray-400">Loading…</div>
      ) : encounters.length === 0 ? (
        <div className="p-4 text-xs text-gray-400 italic">No visit notes recorded yet.</div>
      ) : (
        encounters.map((enc, i) => {
          const style = VISIT_TYPE_STYLES[enc.visitType] ?? {
            label: enc.visitType,
            bg: "#F1F5F9",
            color: "#475569",
          };
          const narrative = enc.vantageChartDraft ?? "";
          const preview =
            narrative.length > 130
              ? `${narrative.slice(0, 130)}…`
              : narrative || "No note content.";
          const isLast = i === encounters.length - 1;
          return (
            <div
              key={enc.id}
              className={`flex flex-col gap-2 px-4 py-3${!isLast ? " border-b border-gray-50" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-semibold rounded px-1.5 py-0.5"
                  style={{ background: style.bg, color: style.color }}
                >
                  {style.label}
                </span>
                <span className="text-xs text-gray-400 ml-auto shrink-0">
                  {new Date(enc.visitedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
              <p className="text-xs text-gray-600 leading-relaxed">{preview}</p>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Active Diagnoses Card ──────────────────────────────────────────────────────

function DiagnosesCard({ patientId }: { patientId: string }) {
  const { data, isLoading } = useQuery<ConditionListResponse>({
    queryKey: ["conditions", patientId],
    queryFn: () => getConditionsFn({ data: { patientId } }) as Promise<ConditionListResponse>,
  });

  const conditions = (data?.conditions ?? []).filter((c) => c.isActive).slice(0, 4);

  const stethoscopeIcon = (
    <svg
      className="w-4 h-4 text-gray-600"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <title>stethoscope</title>
      <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" />
      <path d="M8 15v1a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6v-4" />
      <circle cx="20" cy="10" r="2" />
    </svg>
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <CardHeader icon={stethoscopeIcon} title="Active Diagnoses" />
      {isLoading ? (
        <div className="p-4 text-xs text-gray-400">Loading…</div>
      ) : conditions.length === 0 ? (
        <div className="p-4 text-xs text-gray-400 italic">No active diagnoses documented.</div>
      ) : (
        conditions.map((cond, i) => {
          const dotColor = cond.isTerminal
            ? "#DC2626"
            : cond.severity === "SEVERE"
              ? "#F59E0B"
              : "#94A3B8";
          const isLast = i === conditions.length - 1;
          return (
            <div
              key={cond.id}
              className={`flex items-start gap-3 px-4 py-2.5${!isLast ? " border-b border-gray-50" : ""}`}
            >
              <div
                className="w-2 h-2 rounded-sm shrink-0 mt-1.5"
                style={{ background: dotColor }}
              />
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium text-gray-900">{cond.description}</span>
                <span
                  className="text-xs text-gray-500"
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                >
                  ICD-10: {cond.icd10Code} ·{" "}
                  {cond.isTerminal
                    ? "Terminal / Principal Dx"
                    : cond.isRelated
                      ? "Related"
                      : "Comorbidity"}
                </span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Care Team Card ─────────────────────────────────────────────────────────────

const DISCIPLINE_COLORS: Record<CareTeamDiscipline, { bg: string; color: string }> = {
  PHYSICIAN: { bg: "#F5F3FF", color: "#6D28D9" },
  RN: { bg: "#EFF6FF", color: "#1D4ED8" },
  SW: { bg: "#F0FDF4", color: "#166534" },
  CHAPLAIN: { bg: "#FEF9C3", color: "#92400E" },
  AIDE: { bg: "#FFF7ED", color: "#C2410C" },
  VOLUNTEER: { bg: "#E0F2FE", color: "#0369A1" },
  BEREAVEMENT: { bg: "#FDF4FF", color: "#7E22CE" },
  THERAPIST: { bg: "#F0FDF4", color: "#065F46" },
};

function CareTeamCard({ patientId }: { patientId: string }) {
  const { data, isLoading } = useQuery<CareTeamListResponse>({
    queryKey: ["care-team", patientId],
    queryFn: () => getCareTeamFn({ data: { patientId } }) as Promise<CareTeamListResponse>,
  });

  const members = (data?.members ?? []).filter((m) => !m.unassignedAt).slice(0, 4);

  const usersIcon = (
    <svg
      className="w-4 h-4 text-gray-600"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <title>users</title>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <CardHeader
        icon={usersIcon}
        title="Care Team"
        right={
          <Link
            to="/patients/$patientId/care-team"
            params={{ patientId }}
            className="text-xs text-blue-600 hover:underline"
          >
            Manage →
          </Link>
        }
      />
      {isLoading ? (
        <div className="p-4 text-xs text-gray-400">Loading…</div>
      ) : members.length === 0 ? (
        <div className="p-4 text-xs text-gray-400 italic">No care team assigned.</div>
      ) : (
        members.map((m, i) => {
          const colors = DISCIPLINE_COLORS[m.discipline] ?? {
            bg: "#F1F5F9",
            color: "#475569",
          };
          const initials = m.name
            .split(" ")
            .map((n) => n[0])
            .filter(Boolean)
            .slice(0, 2)
            .join("")
            .toUpperCase();
          const isLast = i === members.length - 1;
          return (
            <div
              key={m.id}
              className={`flex items-center gap-2.5 px-4 py-2.5${!isLast ? " border-b border-gray-50" : ""}`}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold"
                style={{ background: colors.bg, color: colors.color }}
              >
                {initials}
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-medium text-gray-900 truncate">{m.name}</span>
                <span className="text-xs text-gray-500 truncate">
                  {m.discipline}
                  {m.isPrimaryContact ? " · Primary" : ""}
                </span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── Upcoming Visits Card ───────────────────────────────────────────────────────

const DISCIPLINE_VISIT_LABELS: Record<string, string> = {
  RN: "RN Visit",
  SW: "SW Visit",
  CHAPLAIN: "Chaplain Visit",
  THERAPY: "Therapy Visit",
  AIDE: "Aide Visit",
};

function UpcomingVisitsCard({ patientId }: { patientId: string }) {
  const { data, isLoading } = useQuery<ScheduledVisitListResponse>({
    queryKey: ["scheduled-visits", patientId],
    queryFn: () =>
      getScheduledVisitsFn({
        data: { patientId },
      }) as Promise<ScheduledVisitListResponse>,
  });

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (data?.data ?? [])
    .filter((v) => v.status === "scheduled" && v.scheduledDate >= today)
    .slice(0, 2);

  const calendarIcon = (
    <svg
      className="w-4 h-4 text-gray-600"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <title>calendar</title>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <CardHeader icon={calendarIcon} title="Upcoming Visits" />
      {isLoading ? (
        <div className="p-4 text-xs text-gray-400">Loading…</div>
      ) : upcoming.length === 0 ? (
        <div className="p-4 text-xs text-gray-400 italic">No upcoming visits scheduled.</div>
      ) : (
        upcoming.map((v, i) => {
          // Parse date as local to avoid timezone shifting
          const parts = v.scheduledDate.split("-").map(Number);
          const date = new Date(parts[0] ?? 2025, (parts[1] ?? 1) - 1, parts[2] ?? 1);
          const monthLabel = date.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
          const dayNum = date.getDate();
          const label = DISCIPLINE_VISIT_LABELS[v.discipline] ?? `${v.discipline} Visit`;
          const isLast = i === upcoming.length - 1;
          return (
            <div
              key={v.id}
              className={`flex items-center gap-3 px-4 py-2.5${!isLast ? " border-b border-gray-50" : ""}`}
            >
              <div className="flex flex-col items-center w-10 shrink-0">
                <span className="text-[10px] font-semibold text-blue-600">{monthLabel}</span>
                <span
                  className="text-xl font-semibold text-gray-900 leading-tight"
                  style={{ fontFamily: "Space Grotesk, Inter, sans-serif" }}
                >
                  {dayNum}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-xs font-medium text-gray-900">{label}</span>
                <span className="text-xs text-gray-500">{v.notes ?? "Home Visit"}</span>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

// ── IDG Card ───────────────────────────────────────────────────────────────────

function IDGCard({ patientId }: { patientId: string }) {
  const { data: idg, isLoading } = useQuery<IDGComplianceStatus>({
    queryKey: ["idg-compliance", patientId],
    queryFn: () =>
      getIDGComplianceFn({
        data: { patientId },
      }) as Promise<IDGComplianceStatus>,
  });

  const isOverdue = Boolean(idg && !idg.compliant && idg.daysOverdue > 0);
  const cardBg = isOverdue ? "#FFF7ED" : "#FFFFFF";
  const borderColor = isOverdue ? "#FED7AA" : "#E2E8F0";
  const titleColor = isOverdue ? "#7C2D12" : "#0F172A";
  const iconColor = isOverdue ? "#EA580C" : "#374151";

  const idgIcon = (
    <svg
      className="w-4 h-4"
      style={{ color: iconColor }}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <title>calendar-clock</title>
      <path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h5" />
      <path d="M17.5 17.5 16 16.25V14" />
      <path d="M22 16a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z" />
    </svg>
  );

  return (
    <div className="rounded-lg border overflow-hidden" style={{ background: cardBg, borderColor }}>
      <div
        className="flex items-center gap-2 h-11 px-4"
        style={{ borderBottom: `1px solid ${borderColor}` }}
      >
        {idgIcon}
        <span
          className="text-sm font-semibold"
          style={{
            fontFamily: "Space Grotesk, Inter, sans-serif",
            color: titleColor,
          }}
        >
          IDG Conference
        </span>
      </div>
      {isLoading ? (
        <div className="p-4 text-xs text-gray-400">Loading…</div>
      ) : (
        <div className="flex flex-col gap-2.5 p-4">
          {isOverdue && idg ? (
            <div className="flex items-center gap-1.5">
              <svg
                className="w-3.5 h-3.5 text-red-600 shrink-0"
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
              <span className="text-sm font-semibold text-red-600">
                {idg.daysOverdue} {idg.daysOverdue === 1 ? "day" : "days"} OVERDUE
                {idg.lastMeetingDate
                  ? ` — was due ${new Date(idg.lastMeetingDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                  : ""}
              </span>
            </div>
          ) : idg?.compliant ? (
            <div className="flex items-center gap-1.5">
              <svg
                className="w-3.5 h-3.5 text-green-600 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <title>check</title>
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-sm font-medium text-green-700">
                Compliant
                {idg.daysSinceLastIdg !== null
                  ? ` · ${idg.daysSinceLastIdg} days since last IDG`
                  : ""}
              </span>
            </div>
          ) : null}
          <p
            className="text-xs leading-relaxed"
            style={{ color: isOverdue ? "#92400E" : "#6B7280" }}
          >
            IDG conference required within 15 days of admission and every 30 days thereafter per CMS
            §418.56.
          </p>
          {idg?.lastMeetingDate && !isOverdue && (
            <p className="text-xs text-gray-500">
              Last meeting:{" "}
              {new Date(idg.lastMeetingDate).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          )}
          {isOverdue && (
            <Link
              to="/patients/$patientId/idg/schedule"
              params={{ patientId }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-white self-start"
              style={{ background: "#EA580C" }}
            >
              <svg
                className="w-3 h-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <title>calendar-plus</title>
                <path d="M8 2v4M16 2v4" />
                <rect width="18" height="18" x="3" y="4" rx="2" />
                <path d="M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
              </svg>
              Schedule IDG Now
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

function PatientOverviewPage() {
  const { patientId } = Route.useParams();

  return (
    <div className="flex gap-5 bg-gray-100 min-h-full" style={{ padding: "20px 32px" }}>
      {/* Left column — main content */}
      <div className="flex flex-col gap-4 flex-1 min-w-0">
        <TrajectoryCard patientId={patientId} />
        <VisitNotesCard patientId={patientId} />
        <DiagnosesCard patientId={patientId} />
      </div>

      {/* Right column — 320px sidebar */}
      <div className="flex flex-col gap-4 shrink-0" style={{ width: 320 }}>
        <CareTeamCard patientId={patientId} />
        <UpcomingVisitsCard patientId={patientId} />
        <IDGCard patientId={patientId} />
      </div>
    </div>
  );
}
