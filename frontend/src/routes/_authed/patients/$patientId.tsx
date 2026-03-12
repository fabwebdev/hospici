// routes/_authed/patients/$patientId.tsx
// Patient detail view with decline trajectory sparklines

import { getTrajectoryFn } from "@/functions/assessment.functions.js";
import { getPatientFn } from "@/functions/patient.functions.js";
import { patientKeys } from "@/lib/query/keys.js";
import type { HumanName, PatientResponse, TrajectoryDataPoint, TrajectoryResponse } from "@hospici/shared-types";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/patients/$patientId")({
  loader: ({ context: { queryClient }, params: { patientId } }) =>
    Promise.all([
      queryClient.ensureQueryData({
        queryKey: patientKeys.detail(patientId),
        queryFn: () => getPatientFn({ data: { patientId } }),
      }),
      queryClient.ensureQueryData({
        queryKey: ["trajectory", patientId],
        queryFn: () => getTrajectoryFn({ data: { patientId } }),
      }),
    ]),
  component: PatientDetailPage,
});

function formatName(names: HumanName[]): string {
  const primary = names[0];
  if (!primary) return "—";
  return `${primary.given.join(" ")} ${primary.family}`;
}

// ── Sparkline component (pure SVG, no extra deps) ─────────────────────────────

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

  // Build path from non-null consecutive pairs
  const pathSegments: string[] = [];
  let inSegment = false;

  points.forEach((val, i) => {
    if (val === null) {
      inSegment = false;
      return;
    }
    const x = i * stepX;
    const y = height - (val / max) * height;
    if (!inSegment) {
      pathSegments.push(`M${x.toFixed(1)},${y.toFixed(1)}`);
      inSegment = true;
    } else {
      pathSegments.push(`L${x.toFixed(1)},${y.toFixed(1)}`);
    }
  });

  const lastDefined = defined[defined.length - 1] ?? 0;
  const lastIdx = points.lastIndexOf(lastDefined);
  const lastX = lastIdx * stepX;
  const lastY = height - (lastDefined / max) * height;

  return (
    <div className="text-center">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <svg width={width} height={height} className="mx-auto">
        <path d={pathSegments.join(" ")} stroke={color} strokeWidth="1.5" fill="none" />
        <circle cx={lastX} cy={lastY} r="2" fill={color} />
      </svg>
      <div className="text-xs font-medium mt-1" style={{ color }}>
        {lastDefined}/10
      </div>
    </div>
  );
}

// ── Trajectory panel ──────────────────────────────────────────────────────────

function TrajectoryPanel({ patientId }: { patientId: string }) {
  const { data: trajectory, isLoading } = useQuery<TrajectoryResponse>({
    queryKey: ["trajectory", patientId],
    queryFn: () => getTrajectoryFn({ data: { patientId } }) as Promise<TrajectoryResponse>,
  });

  if (isLoading) {
    return <div className="text-xs text-gray-400 py-2">Loading trajectory…</div>;
  }

  const points: TrajectoryDataPoint[] = trajectory?.dataPoints ?? [];

  if (points.length === 0) {
    return (
      <div className="text-xs text-gray-400 italic py-2">No assessments recorded yet.</div>
    );
  }

  const pain = points.map((p) => p.pain);
  const dyspnea = points.map((p) => p.dyspnea);
  const nausea = points.map((p) => p.nausea);

  const lastPain = pain.filter((p): p is number => p !== null).slice(-1)[0] ?? null;
  const trendColor = (vals: (number | null)[]) => {
    const defined = vals.filter((v): v is number => v !== null);
    if (defined.length < 2) return "#6b7280";
    const last = defined[defined.length - 1] ?? 0;
    const prev = defined[defined.length - 2] ?? 0;
    if (last > prev + 1) return "#ef4444"; // worsening
    if (last < prev - 1) return "#22c55e"; // improving
    return "#f59e0b"; // stable
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Decline Trajectory</h2>
        {lastPain !== null && (
          <span className="text-sm text-gray-500">{points.length} assessments</span>
        )}
      </div>
      <div className="flex gap-6 justify-around flex-wrap">
        <Sparkline label="Pain" points={pain} color={trendColor(pain)} />
        <Sparkline label="Dyspnea" points={dyspnea} color={trendColor(dyspnea)} />
        <Sparkline label="Nausea" points={nausea} color={trendColor(nausea)} />
      </div>
      <p className="text-xs text-gray-400 mt-3 text-center">
        Red = worsening · Amber = stable · Green = improving
      </p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function PatientDetailPage() {
  const { patientId } = Route.useParams();

  const {
    data: patient,
    isLoading,
    error,
  } = useQuery<PatientResponse>({
    queryKey: patientKeys.detail(patientId),
    queryFn: () => getPatientFn({ data: { patientId } }) as Promise<PatientResponse>,
  });

  if (isLoading) {
    return <div className="text-gray-500 py-8 text-center">Loading patient…</div>;
  }

  if (error) {
    return (
      <div className="text-red-600 py-8">
        {error instanceof Error ? error.message : "Failed to load patient"}
      </div>
    );
  }

  if (!patient) return null;

  const primaryAddress = patient.address?.[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <Link to="/patients" className="text-blue-600 hover:text-blue-900 text-sm">
          ← Patients
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{formatName(patient.name)}</h1>
        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
          {patient.careModel}
        </span>
      </div>

      {/* Decline trajectory sparklines */}
      <TrajectoryPanel patientId={patientId} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Demographics */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Demographics</h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date of Birth
              </dt>
              <dd className="mt-1 text-sm text-gray-900">{patient.birthDate}</dd>
            </div>
            {patient.gender && (
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Gender
                </dt>
                <dd className="mt-1 text-sm text-gray-900 capitalize">{patient.gender}</dd>
              </div>
            )}
            {primaryAddress && (
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Address
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {primaryAddress.line.join(", ")}, {primaryAddress.city}, {primaryAddress.state}{" "}
                  {primaryAddress.postalCode}
                </dd>
              </div>
            )}
          </dl>
        </div>

        {/* Enrollment */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Enrollment</h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Admission Date
              </dt>
              <dd className="mt-1 text-sm text-gray-900">{patient.admissionDate ?? "—"}</dd>
            </div>
            {patient.dischargeDate && (
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Discharge Date
                </dt>
                <dd className="mt-1 text-sm text-gray-900">{patient.dischargeDate}</dd>
              </div>
            )}
            {patient.identifier.length > 0 && (
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Identifiers
                </dt>
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
    </div>
  );
}
