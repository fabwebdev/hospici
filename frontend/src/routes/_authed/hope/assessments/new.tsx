// routes/_authed/hope/assessments/new.tsx
// Create new HOPE assessment — stub (full form is T3-1b)

import { createHOPEAssessmentFn } from "@/functions/hope.functions.js";
import type { CreateHOPEAssessmentInput, HOPEAssessmentType } from "@hospici/shared-types";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

export const Route = createFileRoute("/_authed/hope/assessments/new")({
  component: NewHOPEAssessmentPage,
});

function NewHOPEAssessmentPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<Partial<CreateHOPEAssessmentInput>>({
    assessmentType: "01",
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateHOPEAssessmentInput) =>
      createHOPEAssessmentFn({ data: input }),
    onSuccess: (assessment) => {
      void navigate({ to: "/hope/assessments/$id", params: { id: assessment.id } });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      form.patientId &&
      form.locationId &&
      form.assessmentType &&
      form.assessmentDate &&
      form.electionDate
    ) {
      createMutation.mutate(form as CreateHOPEAssessmentInput);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">New HOPE Assessment</h1>
        <p className="text-sm text-gray-500 mt-1">
          Hospice Outcomes and Patient Evaluation — CMS Quality Reporting (42 CFR §418.312)
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Assessment Type</label>
          <select
            value={form.assessmentType ?? "01"}
            onChange={(e) => setForm((f) => ({ ...f, assessmentType: e.target.value as HOPEAssessmentType }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="01">HOPE-A — Admission (7-day window)</option>
            <option value="02">HOPE-UV — Update Visit (same day)</option>
            <option value="03">HOPE-D — Discharge (7-day window)</option>
          </select>
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Patient ID</label>
          <input
            type="text"
            placeholder="Patient UUID"
            value={form.patientId ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, patientId: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">Location ID</label>
          <input
            type="text"
            placeholder="Location UUID"
            value={form.locationId ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, locationId: e.target.value }))}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Assessment Date</label>
            <input
              type="date"
              value={form.assessmentDate ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, assessmentDate: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Election Date</label>
            <input
              type="date"
              value={form.electionDate ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, electionDate: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        {createMutation.isError && (
          <p className="text-sm text-red-600">
            {createMutation.error instanceof Error
              ? createMutation.error.message
              : "Failed to create assessment"}
          </p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {createMutation.isPending ? "Creating…" : "Create Assessment"}
          </button>
          <button
            type="button"
            onClick={() => void navigate({ to: "/hope/assessments" })}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
