// routes/_authed/patients/$patientId/index.tsx
// Patient Overview tab — trajectory sparklines, HOPE timeline, F2F, care plan, demographics

import { getCarePlanFn } from "@/functions/carePlan.functions.js";
import { getPatientF2FFn } from "@/functions/f2f.functions.js";
import {
  getHOPEAssessmentsFn,
  getHOPEPatientTimelineFn,
  getHOPESubmissionsByAssessmentFn,
} from "@/functions/hope.functions.js";
import { getIDGComplianceFn } from "@/functions/idg.functions.js";
import { getPatientFn } from "@/functions/patient.functions.js";
import { getTrajectoryFn } from "@/functions/assessment.functions.js";
import { patientKeys } from "@/lib/query/keys.js";
import type {
  CarePlanResponse,
  DisciplineType,
  F2FEncounterListResponse,
  HOPEAssessmentListResponse,
  HOPEAssessmentStatus,
  HOPEPatientTimeline,
  HOPESubmissionListResponse,
  HOPESubmissionRow,
  PatientResponse,
  PhysicianReview,
  SmartGoal,
  TrajectoryDataPoint,
  TrajectoryResponse,
} from "@hospici/shared-types";
import {
  HOPE_ASSESSMENT_TYPE_LABELS,
  HOPE_STATUS_LABELS,
  IQIES_ERROR_GUIDANCE,
} from "@hospici/shared-types";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_authed/patients/$patientId/")({
  component: PatientOverviewPage,
});

// ── Sparkline ─────────────────────────────────────────────────────────────────

interface SparklineProps {
  label: string;
  points: (number | null)[];
  color: string;
}

function Sparkline({ label, points, color }: SparklineProps) {
  const defined = points.filter((p): p is number => p !== null);
  if (defined.length < 2) {
    return (
      <div className="text-center">
        <div className="text-xs text-gray-500 mb-1">{label}</div>
        <div className="text-xs text-gray-400 italic">no data</div>
      </div>
    );
  }
  const width = 80;
  const height = 32;
  const max = 10;
  const stepX = width / (points.length - 1);
  const pathSegments: string[] = [];
  let inSegment = false;
  points.forEach((val, i) => {
    if (val === null) { inSegment = false; return; }
    const x = i * stepX;
    const y = height - (val / max) * height;
    if (!inSegment) { pathSegments.push(`M${x.toFixed(1)},${y.toFixed(1)}`); inSegment = true; }
    else { pathSegments.push(`L${x.toFixed(1)},${y.toFixed(1)}`); }
  });
  const lastDefined = defined[defined.length - 1] ?? 0;
  const lastIdx = points.lastIndexOf(lastDefined);
  const lastX = lastIdx * stepX;
  const lastY = height - (lastDefined / max) * height;
  return (
    <div className="text-center">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <svg width={width} height={height} className="mx-auto" role="img" aria-label={`${label} trend sparkline`}>
        <title>{label}</title>
        <path d={pathSegments.join(" ")} stroke={color} strokeWidth="1.5" fill="none" />
        <circle cx={lastX} cy={lastY} r="2" fill={color} />
      </svg>
      <div className="text-xs font-medium mt-1" style={{ color }}>{lastDefined}/10</div>
    </div>
  );
}

// ── Trajectory panel ──────────────────────────────────────────────────────────

function TrajectoryPanel({ patientId }: { patientId: string }) {
  const { data: trajectory, isLoading } = useQuery<TrajectoryResponse>({
    queryKey: ["trajectory", patientId],
    queryFn: () => getTrajectoryFn({ data: { patientId } }) as Promise<TrajectoryResponse>,
  });
  if (isLoading) return <div className="text-xs text-gray-400 py-2">Loading trajectory…</div>;
  const points: TrajectoryDataPoint[] = trajectory?.dataPoints ?? [];
  if (points.length === 0)
    return <div className="text-xs text-gray-400 italic py-2">No assessments recorded yet.</div>;
  const pain = points.map((p) => p.pain);
  const dyspnea = points.map((p) => p.dyspnea);
  const nausea = points.map((p) => p.nausea);
  const trendColor = (vals: (number | null)[]) => {
    const d = vals.filter((v): v is number => v !== null);
    if (d.length < 2) return "#6b7280";
    const last = d[d.length - 1] ?? 0;
    const prev = d[d.length - 2] ?? 0;
    if (last > prev + 1) return "#ef4444";
    if (last < prev - 1) return "#22c55e";
    return "#f59e0b";
  };
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Decline Trajectory</h2>
        <span className="text-sm text-gray-500">{points.length} assessments</span>
      </div>
      <div className="flex gap-6 justify-around flex-wrap">
        <Sparkline label="Pain"    points={pain}    color={trendColor(pain)}    />
        <Sparkline label="Dyspnea" points={dyspnea} color={trendColor(dyspnea)} />
        <Sparkline label="Nausea"  points={nausea}  color={trendColor(nausea)}  />
      </div>
      <p className="text-xs text-gray-400 mt-3 text-center">
        Red = worsening · Amber = stable · Green = improving
      </p>
    </div>
  );
}

// ── Care plan ─────────────────────────────────────────────────────────────────

const DISCIPLINE_LABELS: Record<DisciplineType, string> = {
  RN: "Nursing (RN)",
  SW: "Social Work",
  CHAPLAIN: "Chaplaincy",
  THERAPY: "Therapy",
  AIDE: "Aide",
  VOLUNTEER: "Volunteer Services",
  BEREAVEMENT: "Bereavement",
  PHYSICIAN: "Physician / Medical Director",
};

function PhysicianReviewBanner({ review }: { review: PhysicianReview }) {
  if (review.isInitialReviewOverdue) {
    return (
      <div className="mb-4 p-3 rounded-md bg-red-50 border border-red-200">
        <p className="text-sm font-semibold text-red-800">⚠ Initial physician review overdue (42 CFR §418.56(b))</p>
        <p className="text-xs text-red-600 mt-0.5">Required within 2 calendar days of admission. Deadline: {review.initialReviewDeadline ?? "—"}</p>
      </div>
    );
  }
  if (review.isOngoingReviewOverdue) {
    return (
      <div className="mb-4 p-3 rounded-md bg-orange-50 border border-orange-200">
        <p className="text-sm font-semibold text-orange-800">⚠ 14-day physician review overdue (42 CFR §418.56(b))</p>
        <p className="text-xs text-orange-600 mt-0.5">Next review was due: {review.nextReviewDue ?? "—"}</p>
      </div>
    );
  }
  if (!review.initialReviewCompletedAt && review.initialReviewDeadline) {
    return (
      <div className="mb-4 p-3 rounded-md bg-yellow-50 border border-yellow-200">
        <p className="text-sm font-semibold text-yellow-800">Pending initial physician review</p>
        <p className="text-xs text-yellow-600 mt-0.5">Due by: {review.initialReviewDeadline}</p>
      </div>
    );
  }
  if (review.lastReviewAt) {
    return (
      <div className="mb-4 p-3 rounded-md bg-green-50 border border-green-200">
        <p className="text-sm text-green-800">
          ✓ Last physician review: {new Date(review.lastReviewAt).toLocaleDateString()} · Next due: {review.nextReviewDue ?? "—"}
        </p>
      </div>
    );
  }
  return null;
}

function SmartGoalBadge({ goal }: { goal: SmartGoal }) {
  const statusColors: Record<SmartGoal["status"], string> = {
    active: "bg-blue-100 text-blue-800",
    met: "bg-green-100 text-green-800",
    revised: "bg-yellow-100 text-yellow-800",
  };
  return (
    <div className="border border-gray-200 rounded p-3 text-sm space-y-1">
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-gray-900">{goal.goal}</p>
        <span className={`shrink-0 px-2 py-0.5 text-xs font-semibold rounded-full ${statusColors[goal.status]}`}>
          {goal.status}
        </span>
      </div>
      <p className="text-xs text-gray-500">Target: {goal.targetDate}</p>
    </div>
  );
}

function CarePlanPanel({ patientId }: { patientId: string }) {
  const { data: carePlan, isLoading } = useQuery<CarePlanResponse | null>({
    queryKey: ["care-plan", patientId],
    queryFn: () => getCarePlanFn({ data: { patientId } }) as Promise<CarePlanResponse | null>,
  });
  if (isLoading) return <div className="text-xs text-gray-400 py-2">Loading care plan…</div>;
  if (!carePlan) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Interdisciplinary Care Plan</h2>
        <p className="text-sm text-gray-400 italic">No care plan on file for this patient.</p>
      </div>
    );
  }
  const ALL_DISCIPLINES: DisciplineType[] = ["RN", "SW", "CHAPLAIN", "THERAPY", "AIDE", "VOLUNTEER", "BEREAVEMENT", "PHYSICIAN"];
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Interdisciplinary Care Plan</h2>
        <span className="text-xs text-gray-400">v{carePlan.version}</span>
      </div>
      <PhysicianReviewBanner review={carePlan.physicianReview} />
      <div className="space-y-6">
        {ALL_DISCIPLINES.map((disc) => {
          const section = carePlan.disciplineSections[disc];
          const hasContent = section && (section.notes || section.goals.length > 0);
          return (
            <div key={disc} className="border-l-2 border-gray-100 pl-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">{DISCIPLINE_LABELS[disc]}</h3>
              {!section || !hasContent ? (
                <p className="text-xs text-gray-400 italic">No documentation yet.</p>
              ) : (
                <>
                  {section.notes && <p className="text-sm text-gray-600 mb-2">{section.notes}</p>}
                  {section.goals.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">SMART Goals ({section.goals.length})</p>
                      {section.goals.map((g) => <SmartGoalBadge key={g.id} goal={g} />)}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-1">Updated {new Date(section.lastUpdatedAt).toLocaleDateString()}</p>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── HOPE panel ────────────────────────────────────────────────────────────────

function HOPEStatusBadge({ status }: { status: HOPEAssessmentStatus | null }) {
  if (!status) return <span className="text-xs text-gray-400 italic">None</span>;
  const colors: Record<HOPEAssessmentStatus, string> = {
    draft: "bg-gray-100 text-gray-600",
    in_progress: "bg-blue-100 text-blue-700",
    ready_for_review: "bg-amber-100 text-amber-700",
    approved_for_submission: "bg-purple-100 text-purple-700",
    submitted: "bg-indigo-100 text-indigo-700",
    accepted: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    needs_correction: "bg-orange-100 text-orange-700",
  };
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${colors[status]}`}>
      {HOPE_STATUS_LABELS[status]}
    </span>
  );
}

function HOPECompletenessRing({ score }: { score: number }) {
  const r = 14;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? "#22c55e" : score >= 50 ? "#f59e0b" : "#ef4444";
  return (
    <svg width={36} height={36} aria-label={`${score}% complete`} className="shrink-0">
      <title>{score}% complete</title>
      <circle cx={18} cy={18} r={r} fill="none" stroke="#e2e8f0" strokeWidth="3" />
      <circle cx={18} cy={18} r={r} fill="none" stroke={color} strokeWidth="3"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 18 18)" />
      <text x={18} y={22} textAnchor="middle" fontSize={8} fontWeight="600" fill={color}>{score}%</text>
    </svg>
  );
}

function HOPEPanel({ patientId }: { patientId: string }) {
  const [showHistory, setShowHistory] = useState<string | null>(null);
  const { data: timeline, isLoading: timelineLoading } = useQuery<HOPEPatientTimeline>({
    queryKey: ["hope", "patient-timeline", patientId],
    queryFn: () => getHOPEPatientTimelineFn({ data: { patientId } }) as Promise<HOPEPatientTimeline>,
  });
  const { data: assessmentList } = useQuery<HOPEAssessmentListResponse>({
    queryKey: ["hope", "assessments", patientId],
    queryFn: () => getHOPEAssessmentsFn({ data: { patientId } }) as Promise<HOPEAssessmentListResponse>,
  });
  const { data: submissions } = useQuery<HOPESubmissionListResponse>({
    queryKey: ["hope", "submissions", showHistory],
    queryFn: () => getHOPESubmissionsByAssessmentFn({ data: { assessmentId: showHistory ?? "" } }) as Promise<HOPESubmissionListResponse>,
    enabled: showHistory !== null,
  });
  if (timelineLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">HOPE Assessment Timeline</h2>
        <div className="text-xs text-gray-400">Loading HOPE timeline…</div>
      </div>
    );
  }
  const hopeAAssessment = assessmentList?.data.find((a) => a.assessmentType === "01");
  const hopeDAssessment = assessmentList?.data.find((a) => a.assessmentType === "03");
  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">HOPE Assessment Timeline</h2>
        <Link to="/hope/dashboard" className="text-xs text-blue-600 hover:underline">HOPE Command Center →</Link>
      </div>
      <div className="flex items-stretch gap-3">
        {/* HOPE-A */}
        <div className="flex-1 rounded-lg border border-gray-200 p-3">
          <p className="text-xs font-semibold text-blue-700 mb-1">{HOPE_ASSESSMENT_TYPE_LABELS["01"]}</p>
          <HOPEStatusBadge status={timeline?.hopeA.status ?? null} />
          {timeline?.hopeA.windowDeadline && <p className="mt-1 text-xs text-gray-500">Deadline: {timeline.hopeA.windowDeadline}</p>}
          {hopeAAssessment && (
            <div className="mt-2 flex items-center gap-2">
              <HOPECompletenessRing score={hopeAAssessment.completenessScore} />
              <button type="button" className="text-xs text-blue-600 hover:underline"
                onClick={() => setShowHistory((p) => p === hopeAAssessment.id ? null : hopeAAssessment.id)}>
                {showHistory === hopeAAssessment.id ? "Hide" : "iQIES History"}
              </button>
            </div>
          )}
          {!timeline?.hopeA.assessmentId && (
            <Link to="/hope/assessments/new" className="mt-2 block text-xs text-blue-600 hover:underline">+ Create HOPE-A</Link>
          )}
        </div>
        <div className="flex items-center text-gray-400 text-sm font-bold">→</div>
        {/* HOPE-UV */}
        <div className="flex-1 rounded-lg border border-gray-200 p-3">
          <p className="text-xs font-semibold text-indigo-700 mb-1">{HOPE_ASSESSMENT_TYPE_LABELS["02"]}</p>
          <span className="text-lg font-bold text-gray-800">{timeline?.hopeUV.count ?? 0}</span>
          <span className="text-xs text-gray-500 ml-1">filed</span>
          {timeline?.hopeUV.lastFiledAt && <p className="mt-1 text-xs text-gray-500">Last: {timeline.hopeUV.lastFiledAt}</p>}
          {timeline?.hopeUV.nextDue && <p className="text-xs text-gray-500">Next est.: {timeline.hopeUV.nextDue}</p>}
          {timeline?.symptomFollowUp.required && !timeline.symptomFollowUp.completed && (
            <div className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Follow-up due {timeline.symptomFollowUp.dueAt ?? "ASAP"}
            </div>
          )}
        </div>
        <div className="flex items-center text-gray-400 text-sm font-bold">→</div>
        {/* HOPE-D */}
        <div className="flex-1 rounded-lg border border-gray-200 p-3">
          <p className="text-xs font-semibold text-purple-700 mb-1">{HOPE_ASSESSMENT_TYPE_LABELS["03"]}</p>
          {timeline?.hopeD.required ? (
            <>
              <HOPEStatusBadge status={timeline.hopeD.status} />
              {timeline.hopeD.windowDeadline && <p className="mt-1 text-xs text-gray-500">Deadline: {timeline.hopeD.windowDeadline}</p>}
              {hopeDAssessment && (
                <div className="mt-2 flex items-center gap-2">
                  <HOPECompletenessRing score={hopeDAssessment.completenessScore} />
                  <button type="button" className="text-xs text-blue-600 hover:underline"
                    onClick={() => setShowHistory((p) => p === hopeDAssessment.id ? null : hopeDAssessment.id)}>
                    {showHistory === hopeDAssessment.id ? "Hide" : "iQIES History"}
                  </button>
                </div>
              )}
            </>
          ) : (
            <span className="text-xs text-gray-400 italic">Not yet required</span>
          )}
        </div>
      </div>
      {timeline?.penaltyExposure.atRisk && (
        <div className="rounded-md bg-red-50 border border-red-200 p-3">
          <p className="text-xs font-semibold text-red-700">
            HQRP Penalty Risk — shortfalls on: {timeline.penaltyExposure.measureShortfalls.join(", ")}
          </p>
        </div>
      )}
      {showHistory && submissions && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            iQIES Submission History ({submissions.data.length} attempt{submissions.data.length !== 1 ? "s" : ""})
          </h3>
          {submissions.data.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No submission attempts yet.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-gray-500 border-b border-gray-200">
                  <th className="text-left py-1 font-medium">#</th>
                  <th className="text-left py-1 font-medium">Submitted</th>
                  <th className="text-left py-1 font-medium">Status</th>
                  <th className="text-left py-1 font-medium">Tracking ID</th>
                  <th className="text-left py-1 font-medium">Rejection Codes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {submissions.data.map((sub: HOPESubmissionRow) => (
                  <tr key={sub.id}>
                    <td className="py-1.5 font-mono">{sub.attemptNumber}</td>
                    <td className="py-1.5">{new Date(sub.submittedAt).toLocaleDateString()}</td>
                    <td className="py-1.5">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        sub.submissionStatus === "accepted" ? "bg-green-100 text-green-700"
                        : sub.submissionStatus === "rejected" ? "bg-red-100 text-red-700"
                        : sub.submissionStatus === "pending" ? "bg-yellow-100 text-yellow-700"
                        : "bg-orange-100 text-orange-700"
                      }`}>{sub.submissionStatus}</span>
                    </td>
                    <td className="py-1.5 font-mono text-gray-600">{sub.trackingId ?? "—"}</td>
                    <td className="py-1.5">
                      {sub.rejectionCodes.length > 0
                        ? sub.rejectionCodes.map((c) => (
                            <div key={c}>
                              <span className="text-red-600 font-mono">{c}</span>
                              {IQIES_ERROR_GUIDANCE[c] && (
                                <p className="text-gray-500 mt-0.5">{IQIES_ERROR_GUIDANCE[c]}</p>
                              )}
                            </div>
                          ))
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ── F2F panel ─────────────────────────────────────────────────────────────────

function F2FPanel({ patientId }: { patientId: string }) {
  const { data, isLoading } = useQuery<F2FEncounterListResponse>({
    queryKey: ["f2f-encounters", patientId],
    queryFn: () => getPatientF2FFn({ data: { patientId } }) as Promise<F2FEncounterListResponse>,
  });
  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Face-to-Face Certification</h2>
        <div className="text-xs text-gray-400">Loading F2F status…</div>
      </div>
    );
  }
  const encounters = data?.encounters ?? [];
  const period3Encounters = encounters.filter((e) => e.periodNumber >= 3);
  const latestPeriod3 = period3Encounters[0];
  const maxPeriodNumber = encounters.reduce((max, e) => (e.periodNumber > max ? e.periodNumber : max), 0);
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Face-to-Face Certification</h2>
        <span className="text-xs text-gray-400">42 CFR §418.22</span>
      </div>
      {maxPeriodNumber < 3 ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Not Required</span>
          <span className="text-xs text-gray-500">F2F certification required from benefit period 3 onwards</span>
        </div>
      ) : latestPeriod3?.isValidForRecert ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">F2F Valid</span>
            <span className="text-xs text-gray-600">
              {latestPeriod3.f2fDate} · Period {latestPeriod3.periodNumber} ({latestPeriod3.periodType})
            </span>
          </div>
          {latestPeriod3.f2fProviderRole && (
            <p className="text-xs text-gray-500 capitalize">Provider role: {latestPeriod3.f2fProviderRole} · {latestPeriod3.encounterSetting}</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
              {latestPeriod3 && !latestPeriod3.isValidForRecert ? "F2F Invalid" : "F2F Required"}
            </span>
            {latestPeriod3?.invalidationReason && (
              <span className="text-xs text-red-600 truncate max-w-xs">{latestPeriod3.invalidationReason}</span>
            )}
          </div>
          <Link
            to="/patients/$patientId/f2f/new"
            params={{ patientId }}
            search={{ periodId: undefined }}
            className="inline-flex items-center px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700"
          >
            Document F2F Encounter
          </Link>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function PatientOverviewPage() {
  const { patientId } = Route.useParams();

  const { data: patient, isLoading } = useQuery<PatientResponse>({
    queryKey: patientKeys.detail(patientId),
    queryFn: () => getPatientFn({ data: { patientId } }) as Promise<PatientResponse>,
  });

  if (isLoading) {
    return <div className="text-gray-500 py-12 text-center text-sm">Loading…</div>;
  }
  if (!patient) return null;

  const primaryAddress = patient.address?.[0];

  return (
    <div className="p-6 space-y-6">
      {/* ── Two-column summary ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Left: demographics + enrollment */}
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Demographics</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Date of Birth</dt>
                <dd className="mt-1 text-sm text-gray-900">{patient.birthDate}</dd>
              </div>
              {patient.gender && (
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Gender</dt>
                  <dd className="mt-1 text-sm text-gray-900 capitalize">{patient.gender}</dd>
                </div>
              )}
              {primaryAddress && (
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Address</dt>
                  <dd className="mt-1 text-sm text-gray-900">
                    {primaryAddress.line.join(", ")}, {primaryAddress.city}, {primaryAddress.state} {primaryAddress.postalCode}
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Enrollment</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Admission Date</dt>
                <dd className="mt-1 text-sm text-gray-900">{patient.admissionDate ?? "—"}</dd>
              </div>
              {patient.dischargeDate && (
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Discharge Date</dt>
                  <dd className="mt-1 text-sm text-gray-900">{patient.dischargeDate}</dd>
                </div>
              )}
              {patient.identifier.length > 0 && (
                <div>
                  <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">Identifiers</dt>
                  <dd className="mt-1 text-sm text-gray-900 space-y-1">
                    {patient.identifier.map((id) => (
                      <div key={`${id.system}:${id.value}`}>
                        <span className="text-gray-500">{id.system}:</span> {id.value}
                      </div>
                    ))}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        {/* Right: HOPE status + F2F */}
        <div className="space-y-6">
          <HOPEPanel patientId={patientId} />
          <F2FPanel patientId={patientId} />
        </div>
      </div>

      {/* ── Full-width: care plan ────────────────────────────────────── */}
      <CarePlanPanel patientId={patientId} />
    </div>
  );
}
