// routes/_authed/patients/index.tsx
// Patient list view

import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/patients/")({
	component: PatientsListPage,
});

// Mock patient data
const mockPatients = [
	{ id: "1", name: "John Doe", dob: "1950-03-15", admissionDate: "2026-01-10", status: "Active" },
	{ id: "2", name: "Jane Smith", dob: "1945-07-22", admissionDate: "2026-02-05", status: "Active" },
	{ id: "3", name: "Robert Johnson", dob: "1938-11-30", admissionDate: "2025-12-15", status: "Active" },
];

function PatientsListPage() {
	return (
		<div className="space-y-6">
			<div className="flex justify-between items-center">
				<h1 className="text-2xl font-bold text-gray-900">Patients</h1>
				<button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
					+ Admit Patient
				</button>
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
								Status
							</th>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Actions
							</th>
						</tr>
					</thead>
					<tbody className="bg-white divide-y divide-gray-200">
						{mockPatients.map((patient) => (
							<tr key={patient.id}>
								<td className="px-6 py-4 whitespace-nowrap">
									<div className="text-sm font-medium text-gray-900">{patient.name}</div>
								</td>
								<td className="px-6 py-4 whitespace-nowrap">
									<div className="text-sm text-gray-500">{patient.dob}</div>
								</td>
								<td className="px-6 py-4 whitespace-nowrap">
									<div className="text-sm text-gray-500">{patient.admissionDate}</div>
								</td>
								<td className="px-6 py-4 whitespace-nowrap">
									<span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
										{patient.status}
									</span>
								</td>
								<td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
									<Link
										to={`/patients/${patient.id}`}
										className="text-blue-600 hover:text-blue-900"
									>
										View
									</Link>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
		</div>
	);
}
