// routes/_authed/patients/$patientId.tsx
// Patient detail view

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { HumanName, PatientResponse } from "@hospici/shared-types";
import { patientKeys } from "@/lib/query/keys.js";
import { getPatientFn } from "@/functions/patient.functions.js";

export const Route = createFileRoute("/_authed/patients/$patientId")({
  loader: ({ context: { queryClient }, params: { patientId } }) =>
    queryClient.ensureQueryData({
      queryKey: patientKeys.detail(patientId),
      queryFn: () => getPatientFn({ data: { patientId } }),
    }),
  component: PatientDetailPage,
});

function formatName(names: HumanName[]): string {
  const primary = names[0];
  if (!primary) return "—";
  return `${primary.given.join(" ")} ${primary.family}`;
}

function PatientDetailPage() {
  const { patientId } = Route.useParams();

  const { data: patient, isLoading, error } = useQuery<PatientResponse>({
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
        <h1 className="text-2xl font-bold text-gray-900">
          {formatName(patient.name)}
        </h1>
        <span className="px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
          {patient.careModel}
        </span>
      </div>

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
                <dd className="mt-1 text-sm text-gray-900 capitalize">
                  {patient.gender}
                </dd>
              </div>
            )}
            {primaryAddress && (
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Address
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {primaryAddress.line.join(", ")}, {primaryAddress.city},{" "}
                  {primaryAddress.state} {primaryAddress.postalCode}
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
              <dd className="mt-1 text-sm text-gray-900">
                {patient.admissionDate ?? "—"}
              </dd>
            </div>
            {patient.dischargeDate && (
              <div>
                <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Discharge Date
                </dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {patient.dischargeDate}
                </dd>
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
