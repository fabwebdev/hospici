// routes/_authed/patients/$patientId/info.tsx
// Patient Info tab — demographics, care team, benefit periods, IDG history
// Per design §5.4. Benefit Period + IDG consolidated here (not standalone tabs).

import { getPatientTimelineFn } from "@/functions/benefit-period.functions.js";
import { getCareTeamFn } from "@/functions/care-team.functions.js";
import { getIDGMeetingsFn } from "@/functions/idg.functions.js";
import { getPatientFn } from "@/functions/patient.functions.js";
import { patientKeys } from "@/lib/query/keys.js";
import type { RouterContext } from "@/routes/__root.js";
import type {
  BenefitPeriod,
  BenefitPeriodTimeline,
  CareTeamListResponse,
  CareTeamMemberResponse,
  HumanName,
  IDGComplianceStatus,
  IDGMeetingListResponse,
  PatientAddress,
  PatientResponse,
} from "@hospici/shared-types";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/patients/$patientId/info")({
  loader: ({
    context: { queryClient },
    params: { patientId },
  }: { context: RouterContext; params: { patientId: string } }) =>
    Promise.all([
      queryClient.ensureQueryData({
        queryKey: ["benefit-period-timeline", patientId],
        queryFn: () => getPatientTimelineFn({ data: { patientId } }),
      }),
      queryClient.ensureQueryData({
        queryKey: ["idg-meetings", patientId],
        queryFn: () => getIDGMeetingsFn({ data: { patientId } }),
      }),
      queryClient.ensureQueryData({
        queryKey: ["care-team", patientId],
        queryFn: () => getCareTeamFn({ data: { patientId } }),
      }),
    ]),
  component: PatientInfoPage,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatName(names: HumanName[]): string {
  const primary = names[0];
  if (!primary) return "—";
  return `${primary.given.join(" ")} ${primary.family}`;
}

function formatAddress(addr: PatientAddress): string {
  const line = addr.line.join(", ");
  return `${line}, ${addr.city}, ${addr.state} ${addr.postalCode}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function age(birthDate: string): number {
  const birth = new Date(birthDate);
  const today = new Date();
  let a = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) a--;
  return a;
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-1.5 grid grid-cols-[160px_1fr] gap-2 items-start">
      <dt className="text-xs font-medium text-gray-400 uppercase tracking-wider pt-0.5">{label}</dt>
      <dd className="text-sm text-gray-900">{value ?? "—"}</dd>
    </div>
  );
}

function PlaceholderSection({ title, description }: { title: string; description: string }) {
  return (
    <div className="bg-white rounded-lg border border-dashed border-gray-200 overflow-hidden">
      <div className="px-5 py-3 border-b border-dashed border-gray-100">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{title}</h2>
      </div>
      <div className="p-5 flex items-center gap-3">
        <span className="text-lg text-gray-200">○</span>
        <p className="text-sm text-gray-400 italic">{description}</p>
      </div>
    </div>
  );
}

// ── Demographics ──────────────────────────────────────────────────────────────

function DemographicsSection({ patient }: { patient: PatientResponse }) {
  const mrn = patient.identifier.find((id) => id.system.toLowerCase().includes("mrn"))?.value;
  const medicareId = patient.identifier.find((id) => id.system.toLowerCase().includes("medicare"))?.value;
  const primaryAddress = patient.address?.[0];

  return (
    <Section title="Demographics">
      <dl className="divide-y divide-gray-50">
        <Field label="Full Name" value={<span className="font-medium">{formatName(patient.name)}</span>} />
        <Field
          label="Date of Birth"
          value={
            <span className="font-mono">
              {patient.birthDate}{" "}
              <span className="text-gray-400 font-sans font-normal">({age(patient.birthDate)} yrs)</span>
            </span>
          }
        />
        <Field label="Gender" value={patient.gender ? <span className="capitalize">{patient.gender}</span> : null} />
        <Field
          label="MRN"
          value={mrn ? <span className="font-mono text-blue-700">{mrn}</span> : null}
        />
        {medicareId && (
          <Field label="Medicare ID" value={<span className="font-mono">{medicareId}</span>} />
        )}
        {primaryAddress && <Field label="Address" value={formatAddress(primaryAddress)} />}
        {patient.address && patient.address.length > 1 && (
          <Field
            label="Additional"
            value={
              <div className="space-y-1">
                {patient.address.slice(1).map((a, i) => (
                  <div key={i} className="text-sm text-gray-600">
                    <span className="text-xs uppercase text-gray-400 mr-1">{a.use}</span>
                    {formatAddress(a)}
                  </div>
                ))}
              </div>
            }
          />
        )}
        <Field label="Care Model" value={
          <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700">
            {patient.careModel}
          </span>
        } />
        <Field label="Admitted" value={patient.admissionDate ? <span className="font-mono">{formatDate(patient.admissionDate)}</span> : null} />
        {patient.dischargeDate && (
          <Field label="Discharged" value={<span className="font-mono">{formatDate(patient.dischargeDate)}</span>} />
        )}
      </dl>
    </Section>
  );
}

// ── Care Team ─────────────────────────────────────────────────────────────────

const DISCIPLINE_LABELS: Record<string, string> = {
  PHYSICIAN: "Physician",
  RN: "Registered Nurse",
  SW: "Social Worker",
  CHAPLAIN: "Chaplain",
  AIDE: "Aide",
  VOLUNTEER: "Volunteer",
  BEREAVEMENT: "Bereavement",
  THERAPIST: "Therapist",
};

const DISCIPLINE_COLORS: Record<string, string> = {
  PHYSICIAN: "bg-purple-100 text-purple-700",
  RN: "bg-teal-100 text-teal-700",
  SW: "bg-blue-100 text-blue-700",
  CHAPLAIN: "bg-indigo-100 text-indigo-700",
  AIDE: "bg-orange-100 text-orange-700",
  VOLUNTEER: "bg-yellow-100 text-yellow-700",
  BEREAVEMENT: "bg-pink-100 text-pink-700",
  THERAPIST: "bg-cyan-100 text-cyan-700",
};

function CareTeamSection({ patientId }: { patientId: string }) {
  const { data, isLoading } = useQuery<CareTeamListResponse>({
    queryKey: ["care-team", patientId],
    queryFn: () => getCareTeamFn({ data: { patientId } }) as Promise<CareTeamListResponse>,
  });

  if (isLoading) {
    return (
      <Section title="Care Team">
        <p className="text-sm text-gray-400">Loading…</p>
      </Section>
    );
  }

  const members = data?.members.filter((m) => !m.unassignedAt) ?? [];

  if (members.length === 0) {
    return (
      <Section title="Care Team">
        <p className="text-sm text-gray-400 italic">No care team members assigned yet.</p>
      </Section>
    );
  }

  const ordered = [...members].sort((a, b) => {
    const priority: Record<string, number> = { PHYSICIAN: 0, RN: 1, SW: 2, CHAPLAIN: 3, THERAPIST: 4, AIDE: 5 };
    return (priority[a.discipline] ?? 9) - (priority[b.discipline] ?? 9);
  });

  return (
    <Section title={`Care Team (${members.length})`}>
      <div className="space-y-2">
        {ordered.map((member: CareTeamMemberResponse) => (
          <div key={member.id} className="flex items-start justify-between gap-3 py-2 border-b border-gray-50 last:border-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <span className="text-xs font-semibold text-gray-500">
                  {member.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900">{member.name}</span>
                  {member.isPrimaryContact && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">Primary</span>
                  )}
                  {member.isOnCall && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 font-medium">On Call</span>
                  )}
                </div>
                <p className="text-xs text-gray-500">{member.role}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {member.phone && (
                <a href={`tel:${member.phone}`} className="text-xs text-blue-600 font-mono hover:underline">
                  {member.phone}
                </a>
              )}
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${DISCIPLINE_COLORS[member.discipline] ?? "bg-gray-100 text-gray-600"}`}>
                {DISCIPLINE_LABELS[member.discipline] ?? member.discipline}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

// ── Benefit Period Timeline ───────────────────────────────────────────────────

const PERIOD_STATUS_COLORS: Record<string, string> = {
  current:     "bg-blue-500",
  upcoming:    "bg-gray-200",
  recert_due:  "bg-amber-400",
  at_risk:     "bg-orange-400",
  past_due:    "bg-red-500",
  closed:      "bg-gray-400",
  revoked:     "bg-red-400",
  discharged:  "bg-gray-300",
};

const PERIOD_STATUS_LABELS: Record<string, string> = {
  current:           "Current",
  upcoming:          "Upcoming",
  recert_due:        "Recert Due",
  at_risk:           "At Risk",
  past_due:          "Past Due",
  closed:            "Closed",
  revoked:           "Revoked",
  transferred_out:   "Transferred",
  concurrent_care:   "Concurrent",
  discharged:        "Discharged",
};

const F2F_STATUS_COLORS: Record<string, string> = {
  not_required:  "text-gray-400",
  not_yet_due:   "text-gray-400",
  due_soon:      "text-amber-600",
  documented:    "text-green-600",
  invalid:       "text-red-600",
  missing:       "text-red-600",
  recert_blocked:"text-red-700",
};

const RECERT_STATUS_LABELS: Record<string, string> = {
  not_yet_due:        "Not due",
  ready_for_recert:   "Ready",
  pending_physician:  "Pending MD",
  completed:          "Complete",
  missed:             "Missed",
};

function BenefitPeriodTimeline({ patientId }: { patientId: string }) {
  const { data, isLoading } = useQuery<BenefitPeriodTimeline>({
    queryKey: ["benefit-period-timeline", patientId],
    queryFn: () => getPatientTimelineFn({ data: { patientId } }) as Promise<BenefitPeriodTimeline>,
  });

  if (isLoading) {
    return (
      <Section title="Benefit Periods">
        <p className="text-sm text-gray-400">Loading…</p>
      </Section>
    );
  }

  const periods = data?.periods ?? [];
  const alerts = data?.activeAlerts ?? [];

  if (periods.length === 0) {
    return (
      <Section title="Benefit Periods">
        <p className="text-sm text-gray-400 italic">No benefit periods on record.</p>
      </Section>
    );
  }

  // SVG timeline — total duration proportional
  const totalDays = periods.reduce((sum, p) => sum + p.periodLengthDays, 0);

  return (
    <Section
      title="Benefit Periods"
      action={
        alerts.length > 0 ? (
          <span className="text-xs font-medium text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
            {alerts.length} alert{alerts.length !== 1 ? "s" : ""}
          </span>
        ) : undefined
      }
    >
      {/* Active alerts */}
      {alerts.map((a) => (
        <div key={a.id} className={`mb-3 px-3 py-2 rounded text-xs font-medium ${a.severity === "critical" ? "bg-red-50 text-red-700 border border-red-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`}>
          {a.description}
        </div>
      ))}

      {/* SVG horizontal timeline */}
      <div className="mb-5 overflow-x-auto">
        <div className="flex gap-0.5 min-w-0" style={{ minWidth: "480px" }}>
          {periods.map((p) => {
            const widthPct = (p.periodLengthDays / totalDays) * 100;
            const colorClass = PERIOD_STATUS_COLORS[p.status] ?? "bg-gray-200";
            const isCurrent = p.status === "current";
            let elapsedPct = 0;
            if (isCurrent) {
              const start = new Date(p.startDate).getTime();
              const end = new Date(p.endDate).getTime();
              const now = Date.now();
              elapsedPct = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
            }

            return (
              <div
                key={p.id}
                className="relative flex flex-col gap-1"
                style={{ width: `${widthPct}%`, minWidth: "80px" }}
              >
                <div className={`h-4 rounded-sm overflow-hidden relative ${isCurrent ? "bg-blue-200" : colorClass}`}>
                  {isCurrent && elapsedPct > 0 && (
                    <div className="absolute inset-y-0 left-0 bg-blue-500 rounded-sm" style={{ width: `${elapsedPct}%` }} />
                  )}
                </div>
                <div className="text-[10px] font-medium text-gray-600">P{p.periodNumber} · {p.periodLengthDays}d</div>
                <div className="text-[10px] text-gray-400 font-mono leading-none">{p.startDate}</div>
              </div>
            );
          })}
        </div>
        <div className="flex gap-3 mt-2 flex-wrap">
          {(["current", "recert_due", "at_risk", "closed"] as const).map((s) => (
            <div key={s} className="flex items-center gap-1 text-[10px] text-gray-500">
              <div className={`w-2.5 h-2.5 rounded-sm ${PERIOD_STATUS_COLORS[s]}`} />
              {PERIOD_STATUS_LABELS[s]}
            </div>
          ))}
        </div>
      </div>

      {/* Detail table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-400 border-b border-gray-100">
              <th className="text-left py-2 font-medium">Period</th>
              <th className="text-left py-2 font-medium">Dates</th>
              <th className="text-left py-2 font-medium">Length</th>
              <th className="text-left py-2 font-medium">Status</th>
              <th className="text-left py-2 font-medium">Recert</th>
              <th className="text-left py-2 font-medium">F2F</th>
              <th className="text-left py-2 font-medium">Recert Due</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {periods.map((p: BenefitPeriod) => (
              <tr key={p.id} className={p.status === "current" ? "bg-blue-50/40" : ""}>
                <td className="py-2 font-semibold text-gray-700">P{p.periodNumber}</td>
                <td className="py-2 font-mono text-gray-600">
                  {p.startDate} – {p.endDate}
                </td>
                <td className="py-2 text-gray-600">{p.periodLengthDays}d</td>
                <td className="py-2">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                    p.status === "current" ? "bg-blue-100 text-blue-700" :
                    p.status === "closed" ? "bg-gray-100 text-gray-500" :
                    p.status === "recert_due" ? "bg-amber-100 text-amber-700" :
                    p.status === "at_risk" ? "bg-orange-100 text-orange-700" :
                    p.status === "past_due" ? "bg-red-100 text-red-700" :
                    "bg-gray-100 text-gray-500"
                  }`}>
                    {PERIOD_STATUS_LABELS[p.status] ?? p.status}
                  </span>
                </td>
                <td className="py-2">
                  <span className={`text-[10px] font-medium ${
                    p.recertStatus === "completed" ? "text-green-600" :
                    p.recertStatus === "missed" ? "text-red-600" :
                    p.recertStatus === "pending_physician" ? "text-amber-600" :
                    "text-gray-500"
                  }`}>
                    {RECERT_STATUS_LABELS[p.recertStatus] ?? p.recertStatus}
                  </span>
                </td>
                <td className="py-2">
                  {!p.f2fRequired ? (
                    <span className="text-gray-300">N/A</span>
                  ) : (
                    <span className={`font-medium ${F2F_STATUS_COLORS[p.f2fStatus] ?? "text-gray-500"}`}>
                      {p.f2fStatus === "documented" ? "✓ Done" :
                       p.f2fStatus === "missing" ? "✗ Missing" :
                       p.f2fStatus === "due_soon" ? "⚠ Due soon" :
                       p.f2fStatus === "invalid" ? "✗ Invalid" :
                       p.f2fStatus === "recert_blocked" ? "✗ Blocking" :
                       p.f2fStatus}
                    </span>
                  )}
                </td>
                <td className="py-2 font-mono text-gray-600">
                  {p.recertDueDate ? formatDate(p.recertDueDate) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ── IDG History ───────────────────────────────────────────────────────────────

const IDG_STATUS_COLORS: Record<string, string> = {
  scheduled:    "bg-blue-100 text-blue-700",
  in_progress:  "bg-amber-100 text-amber-700",
  completed:    "bg-green-100 text-green-700",
  cancelled:    "bg-gray-100 text-gray-500",
};

function IDGSection({ patientId }: { patientId: string }) {
  const { data: compliance } = useQuery<IDGComplianceStatus>({
    queryKey: ["idg-compliance", patientId],
    queryFn: () =>
      import("@/functions/idg.functions.js").then(({ getIDGComplianceFn }) =>
        getIDGComplianceFn({ data: { patientId } }) as Promise<IDGComplianceStatus>
      ),
  });

  const { data: meetings, isLoading } = useQuery<IDGMeetingListResponse>({
    queryKey: ["idg-meetings", patientId],
    queryFn: () => getIDGMeetingsFn({ data: { patientId } }) as Promise<IDGMeetingListResponse>,
  });

  const complianceBanner = compliance ? (
    <div className={`mb-4 px-4 py-3 rounded-lg flex items-center gap-3 ${
      compliance.compliant
        ? "bg-green-50 border border-green-200"
        : "bg-red-50 border border-red-200"
    }`}>
      <span className={`text-lg ${compliance.compliant ? "text-green-500" : "text-red-500"}`}>
        {compliance.compliant ? "✓" : "⚠"}
      </span>
      <div>
        {compliance.compliant ? (
          <p className="text-sm font-medium text-green-800">
            IDG compliant
            {compliance.daysSinceLastIdg !== null && (
              <span className="text-green-600 font-normal"> · {compliance.daysSinceLastIdg} days since last meeting</span>
            )}
          </p>
        ) : (
          <p className="text-sm font-medium text-red-800">
            IDG overdue
            <span className="text-red-600 font-normal"> · {compliance.daysOverdue} days overdue (42 CFR §418.56)</span>
          </p>
        )}
        {compliance.lastMeetingDate && (
          <p className="text-xs text-gray-500">Last meeting: {formatDate(compliance.lastMeetingDate)}</p>
        )}
      </div>
      <div className="ml-auto shrink-0">
        <Link
          to="/patients/$patientId/idg/schedule"
          params={{ patientId }}
          className="text-xs font-medium text-blue-600 hover:underline"
        >
          + Schedule IDG →
        </Link>
      </div>
    </div>
  ) : null;

  return (
    <Section
      title="IDG Meetings"
      action={
        <Link
          to="/patients/$patientId/idg/schedule"
          params={{ patientId }}
          className="text-xs text-blue-600 hover:underline font-medium"
        >
          Schedule Meeting →
        </Link>
      }
    >
      {complianceBanner}

      {isLoading ? (
        <p className="text-sm text-gray-400">Loading meetings…</p>
      ) : !meetings || meetings.meetings.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No IDG meetings recorded.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-100">
                <th className="text-left py-2 font-medium">Date</th>
                <th className="text-left py-2 font-medium">Status</th>
                <th className="text-left py-2 font-medium">Compliant</th>
                <th className="text-left py-2 font-medium">Attendees</th>
                <th className="text-left py-2 font-medium">Core ✓</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {meetings.meetings.map((m) => (
                <tr key={m.id}>
                  <td className="py-2 font-mono text-gray-700">
                    {formatDate(m.scheduledAt)}
                  </td>
                  <td className="py-2">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${IDG_STATUS_COLORS[m.status] ?? "bg-gray-100 text-gray-500"}`}>
                      {m.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="py-2">
                    {m.isCompliant ? (
                      <span className="text-green-600 font-medium">✓</span>
                    ) : (
                      <span className="text-red-500 font-medium">✗</span>
                    )}
                  </td>
                  <td className="py-2 text-gray-600">
                    <div className="flex flex-wrap gap-1">
                      {m.attendees.slice(0, 4).map((a) => (
                        <span key={a.userId} className="text-[10px] px-1 py-0.5 rounded bg-gray-100 text-gray-600">
                          {a.role}
                        </span>
                      ))}
                      {m.attendees.length > 4 && (
                        <span className="text-[10px] text-gray-400">+{m.attendees.length - 4}</span>
                      )}
                    </div>
                  </td>
                  <td className="py-2">
                    <span className={`text-[10px] ${m.rnPresent && m.mdPresent && m.swPresent ? "text-green-600" : "text-amber-600"}`}>
                      {[m.rnPresent && "RN", m.mdPresent && "MD", m.swPresent && "SW"]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function PatientInfoPage() {
  const { patientId } = Route.useParams();

  const { data: patient, isLoading } = useQuery<PatientResponse>({
    queryKey: patientKeys.detail(patientId),
    queryFn: () => getPatientFn({ data: { patientId } }) as Promise<PatientResponse>,
  });

  if (isLoading || !patient) {
    return <div className="p-8 text-sm text-gray-400 text-center">Loading patient info…</div>;
  }

  return (
    <div className="p-6 space-y-5">
      {/* ── Row 1: Demographics + Care Team ────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <DemographicsSection patient={patient} />
        <CareTeamSection patientId={patientId} />
      </div>

      {/* ── Row 2: Benefit Period Timeline ──────────────────────────────── */}
      <BenefitPeriodTimeline patientId={patientId} />

      {/* ── Row 3: IDG History ──────────────────────────────────────────── */}
      <IDGSection patientId={patientId} />

      {/* ── Row 4: Placeholder sections ─────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <PlaceholderSection
          title="Insurance / Medicare"
          description="Medicare ID, Medicaid, supplemental insurance — not yet captured in backend."
        />
        <PlaceholderSection
          title="Diagnoses"
          description="Primary ICD-10, secondary diagnoses, and terminal prognosis — coming in next sprint."
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <PlaceholderSection
          title="Advance Directives"
          description="DNR status, POLST, healthcare proxy, living will — not yet captured in backend."
        />
        <PlaceholderSection
          title="Emergency Contacts"
          description="Primary family contact, healthcare representative, next-of-kin — not yet captured."
        />
      </div>
    </div>
  );
}
