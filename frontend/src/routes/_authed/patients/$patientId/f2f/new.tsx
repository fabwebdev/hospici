// routes/_authed/patients/$patientId/f2f/new.tsx
// Document F2F Encounter form — T3-2b
//
// Features:
//   - Pre-filled with periodId from query param (?periodId=...)
//   - Submit triggers POST to create F2F and auto-validates
//   - Green "Valid for recertification" / red reason badges on result
//   - Submit disabled if form is incomplete

import { createF2FFn } from "@/functions/f2f.functions.js";
import type {
	CreateF2FInput,
	F2FEncounterResponse,
	F2FEncounterSetting,
	F2FProviderRole,
	F2FValidityResult,
} from "@hospici/shared-types";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_authed/patients/$patientId/f2f/new")({
	validateSearch: (search: Record<string, unknown>) => ({
		periodId: typeof search.periodId === "string" ? search.periodId : undefined,
	}),
	component: NewF2FForm,
});

function NewF2FForm() {
	const { patientId } = Route.useParams();
	const search = useSearch({ from: "/_authed/patients/$patientId/f2f/new" });
	const navigate = useNavigate();

	const [form, setForm] = useState<CreateF2FInput>({
		benefitPeriodId: search.periodId ?? "",
		f2fDate: "",
		f2fProviderRole: "physician",
		encounterSetting: "office",
		clinicalFindings: "",
	});
	const [validity, setValidity] = useState<F2FValidityResult | null>(null);

	const createMutation = useMutation<
		F2FEncounterResponse & { validity: F2FValidityResult },
		Error,
		void
	>({
		mutationFn: () => createF2FFn({ data: { patientId, body: form } }),
		onSuccess: (result) => {
			setValidity(result.validity);
			if (result.validity.isValid) {
				void navigate({ to: "/patients/$patientId", params: { patientId } });
			}
		},
	});

	function field(label: string, children: React.ReactNode) {
		return (
			<div>
				<label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
				{children}
			</div>
		);
	}

	const inputCls =
		"w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500";

	const canSubmit =
		form.benefitPeriodId && form.f2fDate && form.clinicalFindings.trim().length > 0;

	return (
		<div className="max-w-2xl mx-auto px-4 py-8">
			<h1 className="text-2xl font-bold text-gray-900 mb-6">
				Document Face-to-Face Encounter
			</h1>

			{!search.periodId && (
				<div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-md text-amber-800 text-sm">
					No benefit period selected. Navigate from a recertification blocker to pre-fill
					the period.
				</div>
			)}

			<div className="bg-white rounded-lg shadow p-6 space-y-5">
				{field(
					"Benefit Period ID",
					<input
						type="text"
						className={inputCls}
						value={form.benefitPeriodId}
						onChange={(e) => setForm((f) => ({ ...f, benefitPeriodId: e.target.value }))}
						placeholder="UUID"
					/>,
				)}

				{field(
					"F2F Date",
					<input
						type="date"
						className={inputCls}
						value={form.f2fDate}
						onChange={(e) => setForm((f) => ({ ...f, f2fDate: e.target.value }))}
					/>,
				)}

				{field(
					"Provider NPI (if external)",
					<input
						type="text"
						className={inputCls}
						value={form.f2fProviderNpi ?? ""}
						onChange={(e) =>
							setForm((f) => ({ ...f, f2fProviderNpi: e.target.value || undefined }))
						}
						maxLength={10}
						placeholder="10-digit NPI"
					/>,
				)}

				{field(
					"Provider Role",
					<select
						className={inputCls}
						value={form.f2fProviderRole}
						onChange={(e) =>
							setForm((f) => ({ ...f, f2fProviderRole: e.target.value as F2FProviderRole }))
						}
					>
						<option value="physician">Physician (MD/DO)</option>
						<option value="np">Nurse Practitioner (NP)</option>
						<option value="pa">Physician Assistant (PA)</option>
					</select>,
				)}

				{field(
					"Encounter Setting",
					<select
						className={inputCls}
						value={form.encounterSetting}
						onChange={(e) =>
							setForm((f) => ({
								...f,
								encounterSetting: e.target.value as F2FEncounterSetting,
							}))
						}
					>
						<option value="office">Office Visit</option>
						<option value="home">Home Visit</option>
						<option value="telehealth">Telehealth</option>
						<option value="snf">Skilled Nursing Facility</option>
						<option value="hospital">Hospital</option>
					</select>,
				)}

				{field(
					"Clinical Findings (required)",
					<textarea
						className={`${inputCls} h-32 resize-y`}
						value={form.clinicalFindings}
						onChange={(e) =>
							setForm((f) => ({ ...f, clinicalFindings: e.target.value }))
						}
						placeholder="Describe clinical findings from the face-to-face encounter..."
					/>,
				)}

				{/* Validity result after submission */}
				{validity && (
					<div
						className={`p-3 rounded-md text-sm ${
							validity.isValid
								? "bg-green-50 border border-green-200 text-green-800"
								: "bg-red-50 border border-red-200 text-red-800"
						}`}
					>
						{validity.isValid ? (
							<span className="font-semibold">Valid for recertification</span>
						) : (
							<div>
								<p className="font-semibold mb-1">Not valid for recertification:</p>
								<ul className="list-disc list-inside space-y-1">
									{validity.reasons.map((r) => (
										<li key={r}>{r}</li>
									))}
								</ul>
							</div>
						)}
					</div>
				)}

				{createMutation.error && (
					<div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-800 text-sm">
						{String(createMutation.error)}
					</div>
				)}

				<div className="flex gap-3 pt-2">
					<button
						type="button"
						onClick={() =>
							navigate({ to: "/patients/$patientId", params: { patientId } })
						}
						className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
					>
						Cancel
					</button>
					<button
						type="button"
						disabled={!canSubmit || createMutation.isPending}
						onClick={() => createMutation.mutate()}
						className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{createMutation.isPending ? "Saving…" : "Save F2F Encounter"}
					</button>
				</div>
			</div>
		</div>
	);
}
