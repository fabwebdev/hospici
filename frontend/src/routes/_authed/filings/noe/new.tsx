// routes/_authed/filings/noe/new.tsx
// NOE Create/Edit page — File Notice of Election
//
// Two-column layout with form card (left) and filing timeline (right).
// Status stepper: Draft -> Submitted -> Accepted.
// Deadline alert banner with 5-business-day calculation.

import { createNOEFn } from "@/functions/noe.functions.js";
import type { CreateNOEInput } from "@hospici/shared-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Calendar, ChevronRight, Clock, FilePlus, Save, Send, User } from "lucide-react";
import { useMemo, useState } from "react";

// ── Route definition ──────────────────────────────────────────────────────────

export const Route = createFileRoute("/_authed/filings/noe/new")({
  validateSearch: (search: Record<string, unknown>) => ({
    patientId: typeof search.patientId === "string" ? search.patientId : "",
    patientName: typeof search.patientName === "string" ? search.patientName : "",
    medicareId: typeof search.medicareId === "string" ? search.medicareId : "",
  }),
  component: NOECreatePage,
});

// ── NOE 5-business-day deadline helper ────────────────────────────────────────

const US_FEDERAL_HOLIDAYS_2026 = [
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-05-25",
  "2026-07-03",
  "2026-09-07",
  "2026-11-26",
  "2026-12-25",
];

function addBusinessDays(startDate: string, days: number): string {
  const date = new Date(`${startDate}T00:00:00`);
  let added = 0;
  while (added < days) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    const iso = date.toISOString().split("T")[0] ?? "";
    if (day !== 0 && day !== 6 && !US_FEDERAL_HOLIDAYS_2026.includes(iso)) {
      added++;
    }
  }
  return date.toISOString().split("T")[0] ?? "";
}

function countBusinessDaysRemaining(deadlineDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(`${deadlineDate}T00:00:00`);

  if (deadline <= today) return 0;

  let count = 0;
  const cursor = new Date(today);
  while (cursor < deadline) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    const iso = cursor.toISOString().split("T")[0] ?? "";
    if (day !== 0 && day !== 6 && !US_FEDERAL_HOLIDAYS_2026.includes(iso)) {
      count++;
    }
  }
  return count;
}

function formatDate(iso: string): string {
  if (!iso) return "--";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ── Status stepper ────────────────────────────────────────────────────────────

type StepStatus = "active" | "upcoming" | "completed";

function StatusStepper({
  currentStep,
}: {
  currentStep: "draft" | "submitted" | "accepted";
}) {
  const steps: { key: string; label: string; status: StepStatus }[] = [
    {
      key: "draft",
      label: "Draft",
      status:
        currentStep === "draft"
          ? "active"
          : currentStep === "submitted" || currentStep === "accepted"
            ? "completed"
            : "upcoming",
    },
    {
      key: "submitted",
      label: "Submitted",
      status:
        currentStep === "submitted"
          ? "active"
          : currentStep === "accepted"
            ? "completed"
            : "upcoming",
    },
    {
      key: "accepted",
      label: "Accepted",
      status: currentStep === "accepted" ? "active" : "upcoming",
    },
  ];

  return (
    <div className="flex items-center gap-0">
      {steps.map((step, i) => (
        <div key={step.key} className="flex items-center">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold ${
                step.status === "active"
                  ? "bg-blue-600 text-white"
                  : step.status === "completed"
                    ? "bg-blue-600 text-white"
                    : "border-2 border-gray-300 text-gray-400"
              }`}
            >
              {step.status === "completed" ? (
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <title>Completed</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                i + 1
              )}
            </div>
            <span
              className={`text-sm font-medium ${
                step.status === "active"
                  ? "text-blue-700"
                  : step.status === "completed"
                    ? "text-blue-600"
                    : "text-gray-400"
              }`}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`w-16 h-px mx-3 ${
                step.status === "completed" ? "bg-blue-400" : "bg-gray-300"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

function NOECreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { patientId, patientName, medicareId: initialMedicareId } = Route.useSearch();

  // ── Form state ────────────────────────────────────────────────────────────
  const [electionDate, setElectionDate] = useState("");
  const [medicareId, setMedicareId] = useState(initialMedicareId);
  const [benefitPeriod, setBenefitPeriod] = useState("1");
  const [noticeType, setNoticeType] = useState("initial");
  const [primaryDiagnosis, setPrimaryDiagnosis] = useState("");
  const [attendingPhysician] = useState("--");
  const [certifyingPhysician] = useState("--");

  // ── Derived deadline ──────────────────────────────────────────────────────
  const deadlineDate = useMemo(
    () => (electionDate ? addBusinessDays(electionDate, 5) : ""),
    [electionDate],
  );

  const daysRemaining = useMemo(
    () => (deadlineDate ? countBusinessDaysRemaining(deadlineDate) : null),
    [deadlineDate],
  );

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (opts: { submit: boolean }) => {
      if (!patientId) throw new Error("Patient ID is required");
      if (!electionDate) throw new Error("Election date is required");

      const body: CreateNOEInput = { electionDate };
      const noe = await createNOEFn({ data: { patientId, body } });

      if (opts.submit && noe.id) {
        const { submitNOEFn } = await import("@/functions/noe.functions.js");
        return submitNOEFn({ data: { noeId: noe.id } });
      }
      return noe;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["filings", "queue"] });
      void navigate({ to: "/filings" });
    },
  });

  const handleSaveDraft = () => createMutation.mutate({ submit: false });
  const handleSubmit = () => createMutation.mutate({ submit: true });

  const canSubmit = Boolean(patientId && electionDate);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
            <FilePlus className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">File Notice of Election (NOE)</h1>
            <p className="text-sm text-gray-500">
              CMS 42 CFR 418.24 -- 5-business-day filing requirement
            </p>
          </div>
        </div>
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-amber-100 text-amber-800 border border-amber-300">
          Draft
        </span>
      </div>

      {/* Status stepper */}
      <div className="bg-white rounded-lg border border-gray-200 px-6 py-4">
        <StatusStepper currentStep="draft" />
      </div>

      {/* Deadline alert banner */}
      {electionDate && deadlineDate && daysRemaining !== null && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-4 flex items-center justify-between">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                Filing Deadline: {formatDate(deadlineDate)}
              </p>
              <p className="text-sm text-amber-700 mt-0.5">
                5 business days from election date ({formatDate(electionDate)}). {daysRemaining}{" "}
                business day{daysRemaining !== 1 ? "s" : ""} remaining.
              </p>
            </div>
          </div>
          <span
            className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-bold bg-amber-200 text-amber-900 border border-amber-300"
            style={{ fontFamily: "JetBrains Mono, monospace" }}
          >
            {daysRemaining}d left
          </span>
        </div>
      )}

      {/* Two-column layout */}
      <div className="flex gap-6 items-start">
        {/* Left column: form card */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-5">
              Patient &amp; Election Details
            </h2>

            {/* Row 1: Patient + Medicare ID */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label
                  htmlFor="noe-patient"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Patient
                </label>
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-700">
                  <User className="w-4 h-4 text-gray-400 shrink-0" />
                  <span id="noe-patient">{patientName || patientId || "No patient selected"}</span>
                </div>
              </div>
              <div>
                <label
                  htmlFor="noe-medicare-id"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Medicare Beneficiary ID (MBI)
                </label>
                <input
                  id="noe-medicare-id"
                  type="text"
                  value={medicareId}
                  onChange={(e) => setMedicareId(e.target.value)}
                  placeholder="1EG4-TE5-MK72"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Row 2: Election Date + Benefit Period */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label
                  htmlFor="noe-election-date"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Election Date
                  <span className="text-red-500 ml-0.5">*</span>
                </label>
                <div className="relative">
                  <input
                    id="noe-election-date"
                    type="date"
                    value={electionDate}
                    onChange={(e) => setElectionDate(e.target.value)}
                    className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <Calendar className="absolute left-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Deadline auto-calculates to 5 business days from this date
                </p>
              </div>
              <div>
                <label
                  htmlFor="noe-benefit-period"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Benefit Period
                </label>
                <select
                  id="noe-benefit-period"
                  value={benefitPeriod}
                  onChange={(e) => setBenefitPeriod(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="1">1st Benefit Period (90 days)</option>
                  <option value="2">2nd Benefit Period (90 days)</option>
                  <option value="3">3rd Benefit Period (60 days)</option>
                  <option value="4">4th+ Benefit Period (60 days)</option>
                </select>
              </div>
            </div>

            {/* Row 3: Notice Type + Primary Diagnosis */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="noe-notice-type"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Notice Type
                </label>
                <select
                  id="noe-notice-type"
                  value={noticeType}
                  onChange={(e) => setNoticeType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                >
                  <option value="initial">Initial Election</option>
                  <option value="change_of_hospice">Change of Hospice Provider</option>
                  <option value="transfer">Transfer</option>
                </select>
              </div>
              <div>
                <label
                  htmlFor="noe-primary-diagnosis"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Primary Diagnosis (ICD-10)
                </label>
                <input
                  id="noe-primary-diagnosis"
                  type="text"
                  value={primaryDiagnosis}
                  onChange={(e) => setPrimaryDiagnosis(e.target.value)}
                  placeholder="C34.90"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Mutation error */}
            {createMutation.isError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {createMutation.error instanceof Error
                  ? createMutation.error.message
                  : "Failed to save NOE"}
              </div>
            )}
          </div>
        </div>

        {/* Right column: timeline + actions */}
        <div className="w-[360px] shrink-0 space-y-4">
          {/* Filing Timeline card */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">Filing Timeline</h3>

            <div className="space-y-0">
              {/* Election Date */}
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-sm text-gray-500">Election Date</span>
                <span className="text-sm font-medium text-gray-900">
                  {electionDate ? formatDate(electionDate) : "--"}
                </span>
              </div>

              {/* Filing Deadline */}
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-sm text-gray-500">Filing Deadline</span>
                <span className="text-sm font-semibold text-orange-600">
                  {deadlineDate ? formatDate(deadlineDate) : "--"}
                </span>
              </div>

              {/* Days Remaining */}
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-sm text-gray-500">Days Remaining</span>
                <span className="text-sm font-bold text-orange-600">
                  {daysRemaining !== null
                    ? `${daysRemaining} business day${daysRemaining !== 1 ? "s" : ""}`
                    : "--"}
                </span>
              </div>

              {/* Attending Physician */}
              <div className="flex items-center justify-between py-3 border-b border-gray-100">
                <span className="text-sm text-gray-500">Attending Physician</span>
                <span className="text-sm text-gray-700">{attendingPhysician}</span>
              </div>

              {/* Certifying Physician */}
              <div className="flex items-center justify-between py-3">
                <span className="text-sm text-gray-500">Certifying Physician</span>
                <span className="text-sm text-gray-700">{certifyingPhysician}</span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="space-y-3">
            <button
              type="button"
              disabled={!canSubmit || createMutation.isPending}
              onClick={handleSubmit}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Send className="w-4 h-4" />
              {createMutation.isPending ? "Submitting..." : "Submit NOE"}
            </button>

            <button
              type="button"
              disabled={!canSubmit || createMutation.isPending}
              onClick={handleSaveDraft}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white text-gray-700 text-sm font-semibold rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Save className="w-4 h-4" />
              {createMutation.isPending ? "Saving..." : "Save as Draft"}
            </button>
          </div>

          {/* Back to filings link */}
          <button
            type="button"
            onClick={() => navigate({ to: "/filings" })}
            className="w-full flex items-center justify-center gap-1 text-sm text-gray-500 hover:text-gray-700 py-2"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
            Back to Filing Workbench
          </button>
        </div>
      </div>
    </div>
  );
}
