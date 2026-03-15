// routes/_authed/patients/index.tsx
// Patient list view — fetches real data from backend API

import { getPatientsFn } from "@/functions/patient.functions.js";
import { patientKeys } from "@/lib/query/keys.js";
import type { RouterContext } from "@/routes/__root.js";
import type { HumanName, PatientListResponse } from "@hospici/shared-types";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/patients/")({
  loader: ({ context: { queryClient } }: { context: RouterContext }) =>
    queryClient.ensureQueryData({
      queryKey: patientKeys.list(),
      queryFn: () => getPatientsFn(),
    }),
  component: PatientsListPage,
});

function formatName(names: HumanName[]): string {
  const primary = names[0];
  if (!primary) return "—";
  return `${primary.given.join(" ")} ${primary.family}`;
}

function PatientsListPage() {
  const { data, isLoading, error } = useQuery<PatientListResponse>({
    queryKey: patientKeys.list(),
    queryFn: () => getPatientsFn() as Promise<PatientListResponse>,
  });

  if (isLoading) {
    return <div className="text-gray-500 py-8 text-center">Loading patients…</div>;
  }

  if (error) {
    return (
      <div className="text-red-600 py-8">
        Error loading patients: {error instanceof Error ? error.message : "Unknown error"}
      </div>
    );
  }

  const patients = data?.patients ?? [];

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Patients</h1>
        <Link
          to="/patients/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
        >
          + Admit Patient
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date of Birth
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Admission Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Care Model
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {patients.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-500">
                  No patients found
                </td>
              </tr>
            ) : (
              patients.map((patient) => (
                <tr key={patient.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {formatName(patient.name)}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{patient.birthDate}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{patient.admissionDate ?? "—"}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                      {patient.careModel}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <Link
                      to="/patients/$patientId"
                      params={{ patientId: patient.id }}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && (
        <div className="text-sm text-gray-500">
          Showing {patients.length} of {data.total} patients
        </div>
      )}
    </div>
  );
}
