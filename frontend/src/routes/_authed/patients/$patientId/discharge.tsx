// routes/_authed/patients/$patientId/discharge.tsx
// Patient Discharge Workflow — §5B.1
// 4 discharge types: Expected Death · Revocation · Transfer · Live Discharge
// CMS rules: discharge date ≤ today; HOPE-D window = +7 days; NOTR = +5 business days

import { dischargeFn } from "@/functions/discharge.functions.js";
import type { DeathLocation, DischargeInput, DischargeResponse, DischargeType } from "@hospici/shared-types";
import { useMutation } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_authed/patients/$patientId/discharge")({
  validateSearch: (search: Record<string, unknown>) => ({
    type: (search.type as DischargeType | undefined) ?? undefined,
  }),
  component: DischargeWorkflowPage,
});

// ── Constants ──────────────────────────────────────────────────────────────────

const DISCHARGE_TYPES: {
  key: DischargeType;
  label: string;
  description: string;
  severity: "destructive" | "warning" | "info";
}[] = [
  {
    key: "expected_death",
    label: "Expected Death",
    description: "Document death and open HOPE-D 7-day assessment window.",
    severity: "info",
  },
  {
    key: "revocation",
    label: "Revocation",
    description: "Patient revokes hospice election. NOTR auto-generated with 5-business-day deadline.",
    severity: "warning",
  },
  {
    key: "transfer",
    label: "Transfer to Another Hospice",
    description: "Patient transferring to a different hospice agency. NOTR auto-generated.",
    severity: "warning",
  },
  {
    key: "live_discharge",
    label: "Live Discharge",
    description: "Patient no longer meets hospice eligibility criteria. Physician documentation required.",
    severity: "destructive",
  },
];

const DEATH_LOCATIONS: { key: DeathLocation; label: string }[] = [
  { key: "home", label: "Home" },
  { key: "inpatient", label: "Inpatient Hospice Facility" },
  { key: "snf", label: "Skilled Nursing Facility" },
  { key: "hospital", label: "Hospital" },
];

const TODAY = new Date().toISOString().slice(0, 10);

// ── Helpers ───────────────────────────────────────────────────────────────────

function addCalendarDays(date: string, days: number): string {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ── Confirmation Modal ────────────────────────────────────────────────────────

function ConfirmModal({
  dischargeType,
  onConfirm,
  onCancel,
  isPending,
}: {
  dischargeType: DischargeType;
  onConfirm: () => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const labels: Record<DischargeType, { title: string; body: string; confirmLabel: string }> = {
    expected_death: {
      title: "Confirm Death Documentation",
      body: "This will record the patient's death, close the benefit period, and open a 7-day HOPE-D assessment window. This action cannot be undone.",
      confirmLabel: "Confirm Death Documentation",
    },
    revocation: {
      title: "Confirm Revocation",
      body: "This will close the patient's hospice election, generate a required NOTR filing with a 5-business-day deadline, and freeze the cap contribution calculation. This cannot be undone without supervisor override.",
      confirmLabel: "Confirm Revocation",
    },
    transfer: {
      title: "Confirm Transfer",
      body: "This will close the hospice election and generate a NOTR for the transfer to the receiving agency. This cannot be undone without supervisor override.",
      confirmLabel: "Confirm Transfer",
    },
    live_discharge: {
      title: "Confirm Live Discharge",
      body: "This will discharge the patient as no longer meeting hospice eligibility criteria. Physician documentation is required. This cannot be undone without supervisor override.",
      confirmLabel: "Confirm Live Discharge",
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const { title, body, confirmLabel } = labels[dischargeType]!;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="px-6 py-5 border-b border-red-100 bg-red-50">
          <div className="flex items-center gap-3">
            <span className="text-red-500 text-xl">⚠</span>
            <h2 className="text-base font-semibold text-red-900">{title}</h2>
          </div>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-gray-700">{body}</p>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-md disabled:opacity-50 flex items-center gap-2"
          >
            {isPending && (
              <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Success Panel ─────────────────────────────────────────────────────────────

function SuccessPanel({
  result,
  patientId,
}: {
  result: DischargeResponse;
  patientId: string;
}) {
  return (
    <div className="max-w-lg mx-auto mt-12 flex flex-col gap-4">
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 flex flex-col items-center gap-3 text-center">
        <span className="text-3xl text-green-500">✓</span>
        <h2 className="text-lg font-semibold text-green-900">Discharge Recorded</h2>
        <p className="text-sm text-green-700">
          Patient discharged as of {formatDate(result.dischargeDate)}.
        </p>
      </div>

      {result.hopeDWindowDeadline && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
          <span className="text-amber-500 shrink-0 mt-0.5">⏱</span>
          <div>
            <p className="text-sm font-semibold text-amber-900">HOPE-D Assessment Required</p>
            <p className="text-xs text-amber-800 mt-0.5">
              Complete the HOPE-D assessment by{" "}
              <strong>{formatDate(result.hopeDWindowDeadline)}</strong> (7 calendar days from discharge).
            </p>
          </div>
        </div>
      )}

      {result.notrDeadline && (() => {
        const daysLeft = Math.ceil(
          (new Date(`${result.notrDeadline}T00:00:00Z`).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        );
        const isCritical = daysLeft <= 2;
        return (
          <div className={`rounded-lg border px-4 py-3 flex items-start gap-3 ${isCritical ? "border-red-400 bg-red-50" : "border-amber-300 bg-amber-50"}`}>
            <span className={`shrink-0 mt-0.5 ${isCritical ? "text-red-500" : "text-amber-500"}`}>⚠</span>
            <div>
              <p className={`text-sm font-semibold ${isCritical ? "text-red-900" : "text-amber-900"}`}>
                NOTR Filing Required{isCritical ? " — Urgent" : ""}
              </p>
              <p className={`text-xs mt-0.5 ${isCritical ? "text-red-800" : "text-amber-800"}`}>
                Submit the NOTR to CMS MAC by{" "}
                <strong className={isCritical ? "text-red-900" : ""}>{formatDate(result.notrDeadline)}</strong>
                {" "}({daysLeft <= 0 ? "deadline passed" : `${daysLeft} day${daysLeft === 1 ? "" : "s"} remaining`} · 5 business days from revocation).
                {result.notrId && (
                  <> NOTR ID: <code className="font-mono text-[11px]">{result.notrId.slice(0, 8)}…</code></>
                )}
              </p>
            </div>
          </div>
        );
      })()}

      <div className="flex gap-3 mt-2">
        <Link
          to="/patients/$patientId"
          params={{ patientId }}
          className="flex-1 text-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-md"
        >
          Back to Patient Overview
        </Link>
        {result.notrId && (
          <Link
            to="/filings"
            className="flex-1 text-center px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-md"
          >
            View Filings Queue
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

function DischargeWorkflowPage() {
  const { patientId } = Route.useParams();
  const { type: preselectedType } = Route.useSearch();
  const navigate = useNavigate();

  const [selectedType, setSelectedType] = useState<DischargeType | null>(preselectedType ?? null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Form state
  const [dischargeDate, setDischargeDate] = useState(TODAY);
  const [timeOfDeath, setTimeOfDeath] = useState("");
  const [pronouncingPhysician, setPronouncingPhysician] = useState("");
  const [locationAtDeath, setLocationAtDeath] = useState<DeathLocation>("home");
  const [witnessName, setWitnessName] = useState("");
  const [familyNotified, setFamilyNotified] = useState(false);
  const [revocationReason, setRevocationReason] = useState("");
  const [patientRepresentative, setPatientRepresentative] = useState("");
  const [receivingAgencyNpi, setReceivingAgencyNpi] = useState("");
  const [receivingHospiceName, setReceivingHospiceName] = useState("");
  const [transferDate, setTransferDate] = useState(TODAY);
  const [physicianDocumentation, setPhysicianDocumentation] = useState("");
  const [liveDischargeReason, setLiveDischargeReason] = useState("");

  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: DischargeInput) =>
      dischargeFn({ data: { patientId, input } }),
    onError: (err: Error & { code?: string }) => {
      setShowConfirm(false);
      setFormError(err.message);
    },
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  function validate(): string | null {
    if (!selectedType) return "Select a discharge type.";
    if (dischargeDate > TODAY) return "Discharge date cannot be a future date (CMS requirement).";
    if (selectedType === "revocation") {
      if (!revocationReason || revocationReason.trim().length < 20)
        return "Revocation reason must be at least 20 characters.";
    }
    if (selectedType === "transfer") {
      if (!receivingAgencyNpi.trim()) return "Receiving agency NPI is required for transfers.";
    }
    if (selectedType === "live_discharge") {
      if (!physicianDocumentation.trim()) return "Physician documentation is required for live discharge.";
    }
    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validate();
    if (err) { setFormError(err); return; }
    setFormError(null);
    setShowConfirm(true);
  }

  function buildInput(): DischargeInput {
    const base: DischargeInput = { dischargeType: selectedType!, dischargeDate };
    if (selectedType === "expected_death") {
      return {
        ...base,
        timeOfDeath: timeOfDeath || undefined,
        pronouncingPhysician: pronouncingPhysician || undefined,
        locationAtDeath,
        witnessName: witnessName || undefined,
        familyNotified,
      };
    }
    if (selectedType === "revocation") {
      return {
        ...base,
        revocationReason,
        patientRepresentative: patientRepresentative || undefined,
      };
    }
    if (selectedType === "transfer") {
      return {
        ...base,
        receivingAgencyNpi,
        receivingHospiceName: receivingHospiceName || undefined,
        transferDate: transferDate || undefined,
      };
    }
    // live_discharge
    return {
      ...base,
      physicianDocumentation,
      liveDischargeReason: liveDischargeReason || undefined,
    };
  }

  function handleConfirm() {
    mutation.mutate(buildInput());
  }

  // ── Done state ──────────────────────────────────────────────────────────────

  if (mutation.isSuccess && mutation.data) {
    return (
      <div className="px-8 py-6">
        <SuccessPanel result={mutation.data} patientId={patientId} />
      </div>
    );
  }

  // ── HOPE-D preview ──────────────────────────────────────────────────────────

  const hopeDPreview =
    selectedType === "expected_death" && dischargeDate <= TODAY
      ? addCalendarDays(dischargeDate, 7)
      : null;

  return (
    <div className="flex flex-col min-h-full">
      {/* Header */}
      <div className="shrink-0 border-b border-gray-200 px-8 py-4 flex items-center gap-4">
        <Link
          to="/patients/$patientId"
          params={{ patientId }}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ← Patient Overview
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-base font-semibold text-gray-900">Discharge Patient</h1>
      </div>

      <div className="flex-1 px-8 py-6 max-w-2xl">
        {/* Step 1: Discharge type */}
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">
            1. Select Discharge Type
          </h2>
          <div className="grid grid-cols-1 gap-2">
            {DISCHARGE_TYPES.map((dt) => {
              const isSelected = selectedType === dt.key;
              const border = {
                info: isSelected ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-blue-300",
                warning: isSelected ? "border-amber-500 bg-amber-50" : "border-gray-200 hover:border-amber-300",
                destructive: isSelected ? "border-red-500 bg-red-50" : "border-gray-200 hover:border-red-300",
              }[dt.severity];

              return (
                <button
                  key={dt.key}
                  type="button"
                  onClick={() => {
                    setSelectedType(dt.key);
                    setFormError(null);
                  }}
                  className={`w-full text-left px-4 py-3 rounded-lg border-2 transition-colors ${border}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${isSelected ? "border-current bg-current" : "border-gray-300"}`}>
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{dt.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{dt.description}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Step 2: Discharge date (always visible once type selected) */}
        {selectedType && (
          <form onSubmit={handleSubmit}>
            <section className="mb-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">2. Discharge Details</h2>
              <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">

                {/* Discharge date */}
                <div className="px-4 py-3 flex items-center gap-4">
                  <label className="text-sm font-medium text-gray-700 w-44 shrink-0">
                    {selectedType === "expected_death" ? "Date of Death" : "Discharge Date"}
                    <span className="text-red-500 ml-0.5">*</span>
                  </label>
                  <div className="flex-1">
                    <input
                      type="date"
                      value={dischargeDate}
                      max={TODAY}
                      onChange={(e) => setDischargeDate(e.target.value)}
                      className="w-full border border-gray-200 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                    />
                    {dischargeDate > TODAY && (
                      <p className="text-xs text-red-600 mt-1">Cannot be a future date (CMS requirement)</p>
                    )}
                  </div>
                </div>

                {/* ── expected_death fields ─────────────────────────────── */}
                {selectedType === "expected_death" && (
                  <>
                    <div className="px-4 py-3 flex items-center gap-4">
                      <label className="text-sm font-medium text-gray-700 w-44 shrink-0">Time of Death</label>
                      <input
                        type="time"
                        value={timeOfDeath}
                        onChange={(e) => setTimeOfDeath(e.target.value)}
                        className="border border-gray-200 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                      />
                    </div>
                    <div className="px-4 py-3 flex items-center gap-4">
                      <label className="text-sm font-medium text-gray-700 w-44 shrink-0">Pronouncing Physician</label>
                      <input
                        type="text"
                        value={pronouncingPhysician}
                        onChange={(e) => setPronouncingPhysician(e.target.value)}
                        placeholder="Name or ID"
                        className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                      />
                    </div>
                    <div className="px-4 py-3 flex items-center gap-4">
                      <label className="text-sm font-medium text-gray-700 w-44 shrink-0">Location at Death</label>
                      <select
                        value={locationAtDeath}
                        onChange={(e) => setLocationAtDeath(e.target.value as DeathLocation)}
                        className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400 bg-white"
                      >
                        {DEATH_LOCATIONS.map((loc) => (
                          <option key={loc.key} value={loc.key}>{loc.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="px-4 py-3 flex items-center gap-4">
                      <label className="text-sm font-medium text-gray-700 w-44 shrink-0">Witness Name</label>
                      <input
                        type="text"
                        value={witnessName}
                        onChange={(e) => setWitnessName(e.target.value)}
                        placeholder="Optional"
                        className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                      />
                    </div>
                    <div className="px-4 py-3 flex items-center gap-4">
                      <label className="text-sm font-medium text-gray-700 w-44 shrink-0">Family Notified</label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={familyNotified}
                          onChange={(e) => setFamilyNotified(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700">Family has been notified</span>
                      </label>
                    </div>

                    {/* HOPE-D window preview */}
                    {hopeDPreview && (
                      <div className="px-4 py-3 bg-amber-50">
                        <div className="flex items-center gap-2">
                          <span className="text-amber-500 text-sm">⏱</span>
                          <p className="text-sm text-amber-800">
                            <span className="font-semibold">HOPE-D Assessment Window:</span> Must be completed by{" "}
                            <strong>{formatDate(hopeDPreview)}</strong> (7 calendar days)
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ── revocation fields ─────────────────────────────────── */}
                {selectedType === "revocation" && (
                  <>
                    <div className="px-4 py-3 flex items-start gap-4">
                      <label className="text-sm font-medium text-gray-700 w-44 shrink-0 mt-1.5">
                        Revocation Reason <span className="text-red-500">*</span>
                        <p className="text-[11px] text-gray-400 font-normal mt-0.5">Min. 20 characters</p>
                      </label>
                      <div className="flex-1">
                        <textarea
                          value={revocationReason}
                          onChange={(e) => setRevocationReason(e.target.value)}
                          placeholder="Document why the patient is revoking their hospice election…"
                          className="w-full border border-gray-200 rounded px-3 py-2 text-sm outline-none focus:border-blue-400 min-h-[80px] resize-y"
                        />
                        <p className={`text-[11px] mt-0.5 ${revocationReason.length < 20 ? "text-amber-600" : "text-green-600"}`}>
                          {revocationReason.length} / 20 minimum characters
                        </p>
                      </div>
                    </div>
                    <div className="px-4 py-3 flex items-center gap-4">
                      <label className="text-sm font-medium text-gray-700 w-44 shrink-0">Patient Representative</label>
                      <input
                        type="text"
                        value={patientRepresentative}
                        onChange={(e) => setPatientRepresentative(e.target.value)}
                        placeholder="Name of patient or representative who requested revocation"
                        className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                      />
                    </div>

                    {/* NOTR preview */}
                    {dischargeDate <= TODAY && (
                      <div className="px-4 py-3 bg-amber-50">
                        <div className="flex items-center gap-2">
                          <span className="text-amber-500 text-sm">⚠</span>
                          <p className="text-sm text-amber-800">
                            <span className="font-semibold">NOTR will be auto-generated.</span> A Notice of Termination/Revocation will be created as a draft with a 5-business-day CMS filing deadline.
                          </p>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* ── transfer fields ───────────────────────────────────── */}
                {selectedType === "transfer" && (
                  <>
                    <div className="px-4 py-3 flex items-center gap-4">
                      <label className="text-sm font-medium text-gray-700 w-44 shrink-0">
                        Receiving Agency NPI <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={receivingAgencyNpi}
                        onChange={(e) => setReceivingAgencyNpi(e.target.value)}
                        placeholder="10-digit NPI"
                        className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                      />
                    </div>
                    <div className="px-4 py-3 flex items-center gap-4">
                      <label className="text-sm font-medium text-gray-700 w-44 shrink-0">Receiving Hospice Name</label>
                      <input
                        type="text"
                        value={receivingHospiceName}
                        onChange={(e) => setReceivingHospiceName(e.target.value)}
                        placeholder="Name of receiving hospice agency"
                        className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                      />
                    </div>
                    <div className="px-4 py-3 flex items-center gap-4">
                      <label className="text-sm font-medium text-gray-700 w-44 shrink-0">Transfer Date</label>
                      <input
                        type="date"
                        value={transferDate}
                        max={TODAY}
                        onChange={(e) => setTransferDate(e.target.value)}
                        className="border border-gray-200 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                      />
                    </div>

                    {/* NOTR preview */}
                    <div className="px-4 py-3 bg-amber-50">
                      <div className="flex items-center gap-2">
                        <span className="text-amber-500 text-sm">⚠</span>
                        <p className="text-sm text-amber-800">
                          <span className="font-semibold">NOTR will be auto-generated.</span> A Notice of Termination/Revocation for the transfer will be created with a 5-business-day CMS filing deadline.
                        </p>
                      </div>
                    </div>
                  </>
                )}

                {/* ── live_discharge fields ─────────────────────────────── */}
                {selectedType === "live_discharge" && (
                  <>
                    <div className="px-4 py-3 flex items-start gap-4">
                      <label className="text-sm font-medium text-gray-700 w-44 shrink-0 mt-1.5">
                        Physician Documentation <span className="text-red-500">*</span>
                        <p className="text-[11px] text-gray-400 font-normal mt-0.5">Required — eligibility criteria</p>
                      </label>
                      <textarea
                        value={physicianDocumentation}
                        onChange={(e) => setPhysicianDocumentation(e.target.value)}
                        placeholder="Document why the patient no longer meets hospice eligibility criteria (6-month prognosis, functional status change, etc.)…"
                        className="flex-1 border border-gray-200 rounded px-3 py-2 text-sm outline-none focus:border-blue-400 min-h-[100px] resize-y"
                      />
                    </div>
                    <div className="px-4 py-3 flex items-start gap-4">
                      <label className="text-sm font-medium text-gray-700 w-44 shrink-0 mt-1.5">Discharge Reason</label>
                      <textarea
                        value={liveDischargeReason}
                        onChange={(e) => setLiveDischargeReason(e.target.value)}
                        placeholder="Optional — additional context for the discharge reason"
                        className="flex-1 border border-gray-200 rounded px-3 py-2 text-sm outline-none focus:border-blue-400 min-h-[60px] resize-y"
                      />
                    </div>

                    {/* Cap flag notice */}
                    <div className="px-4 py-3 bg-blue-50">
                      <div className="flex items-center gap-2">
                        <span className="text-blue-500 text-sm">ℹ</span>
                        <p className="text-sm text-blue-800">
                          The patient's cap contribution will be flagged as a live discharge, which may affect the hospice cap calculation for this benefit period.
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </section>

            {/* Error */}
            {formError && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-2">
                <span className="text-red-500 shrink-0">⚠</span>
                <p className="text-sm text-red-700">{formError}</p>
              </div>
            )}

            {/* Submit */}
            <div className="flex items-center gap-3">
              <button
                type="submit"
                className="px-6 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-md"
              >
                Discharge Patient
              </button>
              <Link
                to="/patients/$patientId"
                params={{ patientId }}
                className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900"
              >
                Cancel
              </Link>
            </div>
          </form>
        )}
      </div>

      {/* Confirmation modal */}
      {showConfirm && selectedType && (
        <ConfirmModal
          dischargeType={selectedType}
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
          isPending={mutation.isPending}
        />
      )}
    </div>
  );
}
