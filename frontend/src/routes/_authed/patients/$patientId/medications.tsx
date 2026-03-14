// routes/_authed/patients/$patientId/medications.tsx
// Patient Medications tab — active meds, PRN, drug interactions, pharmacy, summary

import {
  getAllergiesFn,
  getMedicationsFn,
} from "@/functions/medications.functions.js";
import type {
  AllergyListResponse,
  DrugInteractionWarning,
  MedicationListResponse,
  MedicationResponse,
} from "@hospici/shared-types";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_authed/patients/$patientId/medications")({
  component: PatientMedicationsPage,
});

// ── Constants ──────────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<string, { label: string; classes: string }> = {
  ACTIVE: { label: "Active", classes: "bg-green-100 text-green-700" },
  ON_HOLD: { label: "Hold", classes: "bg-yellow-100 text-yellow-700 border border-yellow-300" },
  DISCONTINUED: { label: "D/C'd", classes: "bg-gray-100 text-gray-500" },
};
const DEFAULT_BADGE = { label: "Active", classes: "bg-green-100 text-green-700" } as const;

const INTERACTION_SEVERITY: Record<string, string> = {
  MAJOR: "bg-red-100 text-red-700",
  MODERATE: "bg-amber-100 text-amber-700",
  MINOR: "bg-yellow-100 text-yellow-600",
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function ActiveMedRow({ med }: { med: MedicationResponse }) {
  const badge = STATUS_BADGE[med.status] ?? DEFAULT_BADGE;
  const holdRow = med.status === "ON_HOLD";

  return (
    <div
      className={`flex items-center px-4 py-3 border-b border-gray-100 text-sm ${holdRow ? "bg-amber-50" : "hover:bg-gray-50"}`}
    >
      {/* Name */}
      <div className="flex-1 min-w-0 pr-3">
        <div className="font-medium text-gray-900 truncate">
          {med.name}
          {med.isControlledSubstance && (
            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 align-middle">
              C{med.deaSchedule ?? "II"}
            </span>
          )}
        </div>
        {(med.genericName || med.brandName) && (
          <div className="text-xs text-gray-400 truncate mt-0.5">
            {med.brandName ?? med.genericName}
            {med.indication ? ` · ${med.indication}` : ""}
          </div>
        )}
      </div>
      {/* Dose / route */}
      <div className="w-[110px] shrink-0 text-gray-600">{med.dosage} / {med.route}</div>
      {/* Frequency */}
      <div className="w-[90px] shrink-0 text-gray-900">{med.frequency}</div>
      {/* Prescriber */}
      <div className="w-[110px] shrink-0 text-gray-500 text-xs truncate">{med.prescriberId ?? "—"}</div>
      {/* Started */}
      <div className="w-[80px] shrink-0 text-gray-400 text-xs">
        {med.startDate ? new Date(med.startDate).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" }) : "—"}
      </div>
      {/* D/C date */}
      <div className={`w-[80px] shrink-0 text-xs ${med.endDate ? "text-red-600 font-medium" : "text-gray-400"}`}>
        {med.endDate ? new Date(med.endDate).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "2-digit" }) : "—"}
      </div>
      {/* Status */}
      <div className="w-[70px] shrink-0">
        <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${badge.classes}`}>
          {badge.label}
        </span>
      </div>
    </div>
  );
}

function PrnMedRow({ med }: { med: MedicationResponse }) {
  return (
    <div className="flex items-center px-4 py-3 border-b border-gray-100 text-sm hover:bg-gray-50">
      <div className="flex-1 min-w-0 pr-3">
        <div className="font-medium text-gray-900 truncate">
          {med.name}
          {med.isControlledSubstance && (
            <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 align-middle">
              C{med.deaSchedule ?? "II"}
            </span>
          )}
        </div>
        {med.brandName && <div className="text-xs text-gray-400 mt-0.5">{med.brandName}</div>}
      </div>
      <div className="w-[150px] shrink-0 text-gray-600">{med.dosage} / {med.route}</div>
      <div className="w-[100px] shrink-0 text-gray-900">{med.frequency}</div>
      <div className="w-[130px] shrink-0 text-gray-500 text-xs truncate">{med.indication || "—"}</div>
    </div>
  );
}

function DrugInteractionsPanel({ interactions }: { interactions: Array<DrugInteractionWarning & { medName: string }> }) {
  if (interactions.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 h-11 border-b border-amber-200">
        <div className="flex items-center gap-2">
          <span className="text-amber-600 text-sm">⚠</span>
          <span className="text-sm font-semibold text-amber-900">Drug Interactions</span>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-200 text-amber-800">
          {interactions.length} Found
        </span>
      </div>
      <div>
        {interactions.map((w, i) => (
          <div
            key={`${w.medName}-${w.interactingDrug}-${i}`}
            className="px-4 py-3 border-b border-amber-100 last:border-0"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-amber-900">{w.medName} + {w.interactingDrug}</span>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${INTERACTION_SEVERITY[w.severity.toUpperCase()] ?? "bg-gray-100 text-gray-600"}`}>
                {w.severity}
              </span>
            </div>
            <p className="text-xs text-amber-800">{w.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function PharmacyPanel({ meds }: { meds: MedicationResponse[] }) {
  const pharmed = meds.find((m) => m.pharmacyName);
  if (!pharmed) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 h-11 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-900">Pharmacy</span>
        {pharmed.pharmacyPhone && (
          <a
            href={`tel:${pharmed.pharmacyPhone}`}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-600 text-xs font-medium hover:bg-blue-100"
          >
            📞 Call
          </a>
        )}
      </div>
      <div className="px-4 py-3 space-y-2 text-sm">
        <p className="font-medium text-gray-900">{pharmed.pharmacyName}</p>
        {pharmed.pharmacyPhone && (
          <p className="text-gray-600 text-xs">{pharmed.pharmacyPhone}</p>
        )}
        {pharmed.pharmacyFax && (
          <p className="text-gray-500 text-xs">Fax: {pharmed.pharmacyFax}</p>
        )}
      </div>
    </div>
  );
}

function SummaryPanel({ meds }: { meds: MedicationResponse[] }) {
  const active = meds.filter((m) => m.status === "ACTIVE" && m.frequencyType === "SCHEDULED").length;
  const onHold = meds.filter((m) => m.status === "ON_HOLD").length;
  const prn = meds.filter((m) => m.frequencyType === "PRN").length;
  const disc = meds.filter((m) => m.status === "DISCONTINUED").length;

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 h-11 flex items-center border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-900">Medication Summary</span>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3">
        <div className="rounded-lg bg-green-50 p-2.5 flex flex-col items-center">
          <span className="text-xl font-bold text-green-600">{active}</span>
          <span className="text-[11px] text-green-700">Active</span>
        </div>
        <div className="rounded-lg bg-amber-50 p-2.5 flex flex-col items-center">
          <span className="text-xl font-bold text-amber-600">{onHold}</span>
          <span className="text-[11px] text-amber-700">On Hold</span>
        </div>
        <div className="rounded-lg bg-blue-50 p-2.5 flex flex-col items-center">
          <span className="text-xl font-bold text-blue-600">{prn}</span>
          <span className="text-[11px] text-blue-700">PRN</span>
        </div>
        <div className="rounded-lg bg-gray-50 p-2.5 flex flex-col items-center">
          <span className="text-xl font-bold text-gray-500">{disc}</span>
          <span className="text-[11px] text-gray-400">D/C'd</span>
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

function PatientMedicationsPage() {
  const { patientId } = Route.useParams();
  const [search, setSearch] = useState("");

  const { data: medData, isLoading: medsLoading } = useQuery<MedicationListResponse>({
    queryKey: ["medications", patientId],
    queryFn: () => getMedicationsFn({ data: { patientId } }),
  });

  const { data: allergyData } = useQuery<AllergyListResponse>({
    queryKey: ["allergies", patientId],
    queryFn: () => getAllergiesFn({ data: { patientId } }),
  });

  const medications = medData?.medications ?? [];
  const allergies = allergyData?.allergies ?? [];

  const filtered = search
    ? medications.filter(
        (m) =>
          m.name.toLowerCase().includes(search.toLowerCase()) ||
          (m.genericName ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : medications;

  const scheduled = filtered.filter((m) => m.frequencyType === "SCHEDULED");
  const prn = filtered.filter((m) => m.frequencyType === "PRN");
  const hasEpcs = medications.some((m) => m.isControlledSubstance);

  // Aggregate all interaction warnings from every medication
  const interactions: Array<DrugInteractionWarning & { medName: string }> = medications.flatMap(
    (m) => (m.interactionWarnings ?? []).map((w) => ({ ...w, medName: m.name })),
  );

  return (
    <div className="flex flex-col h-full">
      {/* Allergy alert */}
      {allergies.length > 0 && (
        <div className="shrink-0 mx-8 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 flex items-center gap-2.5">
          <span className="text-red-500">⚠</span>
          <p className="text-sm font-semibold text-red-800">
            {allergies.length} known allerg{allergies.length === 1 ? "y" : "ies"}:
            <span className="font-normal ml-1">{allergies.map((a) => a.allergen).join(" · ")}</span>
          </p>
        </div>
      )}

      {/* Filter bar */}
      <div className="shrink-0 flex items-center gap-3 px-8 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2 border border-gray-200 rounded-md px-3 h-9 bg-white w-60">
          <span className="text-gray-400 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Search medications..."
            className="flex-1 text-sm outline-none text-gray-700 placeholder-gray-400"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5 h-9 px-3.5 border border-gray-200 rounded-md text-sm text-gray-700 bg-white hover:bg-gray-50"
        >
          ⚙ Filter
        </button>
        <div className="flex-1" />
        {hasEpcs && (
          <div className="flex items-center gap-1.5 h-7 px-2.5 rounded-full border border-blue-200 bg-blue-50">
            <span className="text-blue-600 text-xs">🛡</span>
            <span className="text-xs font-semibold text-blue-700">EPCS Active</span>
          </div>
        )}
        <button
          type="button"
          className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-semibold text-white"
        >
          + Add Medication
        </button>
      </div>

      {/* Two-column body */}
      <div className="flex gap-5 flex-1 min-h-0 px-8 py-5 overflow-y-auto">
        {/* Left column */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {medsLoading ? (
            <div className="text-center py-12 text-gray-400 text-sm">Loading medications…</div>
          ) : (
            <>
              {/* Active / Scheduled meds */}
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <div className="flex items-center justify-between h-11 px-4 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">Active Medications</span>
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-700">
                      {scheduled.length}
                    </span>
                  </div>
                  <button type="button" className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700">
                    📄 MAR Export
                  </button>
                </div>
                {/* Table header */}
                <div className="flex items-center px-4 h-9 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                  <div className="flex-1 min-w-0 pr-3">Medication</div>
                  <div className="w-[110px] shrink-0">Dose / Route</div>
                  <div className="w-[90px] shrink-0">Frequency</div>
                  <div className="w-[110px] shrink-0">Prescriber</div>
                  <div className="w-[80px] shrink-0">Started</div>
                  <div className="w-[80px] shrink-0">D/C Date</div>
                  <div className="w-[70px] shrink-0">Status</div>
                </div>
                {scheduled.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-8">No active medications on file.</p>
                ) : (
                  scheduled.map((m) => <ActiveMedRow key={m.id} med={m} />)
                )}
              </div>

              {/* PRN medications */}
              {prn.length > 0 && (
                <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                  <div className="flex items-center justify-between h-11 px-4 border-b border-gray-100">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900">PRN Medications</span>
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600">
                        As Needed
                      </span>
                    </div>
                    <span className="text-xs text-gray-500">{prn.length} active</span>
                  </div>
                  <div className="flex items-center px-4 h-8 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                    <div className="flex-1 min-w-0 pr-3">Medication</div>
                    <div className="w-[150px] shrink-0">Dose / Route</div>
                    <div className="w-[100px] shrink-0">Max Freq</div>
                    <div className="w-[130px] shrink-0">Indication</div>
                  </div>
                  {prn.map((m) => <PrnMedRow key={m.id} med={m} />)}
                </div>
              )}
            </>
          )}
        </div>

        {/* Right sidebar */}
        <div className="w-80 shrink-0 flex flex-col gap-4">
          <DrugInteractionsPanel interactions={interactions} />
          <PharmacyPanel meds={medications} />
          <SummaryPanel meds={medications} />
        </div>
      </div>
    </div>
  );
}
