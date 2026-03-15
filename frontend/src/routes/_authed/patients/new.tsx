// routes/_authed/patients/new.tsx
// Patient Admission Wizard — 5-step multi-step form (§5.5)
//
// Steps: demographics → clinical → physician → election → care-team
// Sticky footer: Back / Next / "Admit Patient" (step 5 only)
// Top progress bar with pill-style step indicators

import {
  addConditionFn,
  assignCareTeamMemberFn,
  createNOEFn,
  createPatientFn,
} from "@/functions/patient-admission.functions.js";
import { patientKeys } from "@/lib/query/keys.js";
import type { RouterContext } from "@/routes/__root.js";
import type {
  AssignCareTeamMemberInput,
  CareModel,
  CareTeamDiscipline,
  CreateConditionBody,
} from "@hospici/shared-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useState } from "react";

// ── Route definition ──────────────────────────────────────────────────────────

export const Route = createFileRoute("/_authed/patients/new")({
  component: PatientAdmissionWizard,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type AdmissionStep = "demographics" | "clinical" | "physician" | "election" | "care-team";

const ADMISSION_STEPS: AdmissionStep[] = [
  "demographics",
  "clinical",
  "physician",
  "election",
  "care-team",
];

const STEP_LABELS: Record<AdmissionStep, string> = {
  demographics: "Demographics",
  clinical: "Clinical",
  physician: "Physician",
  election: "Election",
  "care-team": "Care Team",
};

interface DemographicsData {
  firstName: string;
  lastName: string;
  gender: "male" | "female" | "other" | "unknown";
  birthDate: string;
  phone: string;
  email: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  emergencyContactFirstName: string;
  emergencyContactLastName: string;
  emergencyContactPhone: string;
  emergencyContactRelationship: string;
}

interface DiagnosisEntry {
  icd10Code: string;
  description: string;
  isTerminal: boolean;
  isRelated: boolean;
}

interface ClinicalData {
  diagnoses: DiagnosisEntry[];
  careModel: CareModel;
}

interface PhysicianData {
  attendingPhysicianName: string;
  certifyingPhysicianName: string;
  f2fCompleted: boolean;
  f2fDate: string;
}

interface ElectionData {
  electionDate: string;
  benefitPeriodStart: string;
}

interface CareTeamEntry {
  name: string;
  discipline: CareTeamDiscipline;
  role: string;
  phone: string;
}

interface CareTeamData {
  members: CareTeamEntry[];
}

interface AdmissionFormData {
  demographics: DemographicsData;
  clinical: ClinicalData;
  physician: PhysicianData;
  election: ElectionData;
  careTeam: CareTeamData;
}

const INITIAL_FORM_DATA: AdmissionFormData = {
  demographics: {
    firstName: "",
    lastName: "",
    gender: "unknown",
    birthDate: "",
    phone: "",
    email: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    emergencyContactFirstName: "",
    emergencyContactLastName: "",
    emergencyContactPhone: "",
    emergencyContactRelationship: "family",
  },
  clinical: {
    diagnoses: [],
    careModel: "HOSPICE",
  },
  physician: {
    attendingPhysicianName: "",
    certifyingPhysicianName: "",
    f2fCompleted: false,
    f2fDate: "",
  },
  election: {
    electionDate: "",
    benefitPeriodStart: "",
  },
  careTeam: {
    members: [
      { name: "", discipline: "RN", role: "Primary RN", phone: "" },
      { name: "", discipline: "SW", role: "Social Worker", phone: "" },
      { name: "", discipline: "CHAPLAIN", role: "Chaplain", phone: "" },
      { name: "", discipline: "AIDE", role: "Hospice Aide", phone: "" },
    ],
  },
};

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

// ── Main wizard component ─────────────────────────────────────────────────────

function PatientAdmissionWizard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = Route.useRouteContext() as RouterContext;

  const [currentStep, setCurrentStep] = useState<AdmissionStep>("demographics");
  const [formData, setFormData] = useState<AdmissionFormData>(INITIAL_FORM_DATA);
  const [submitted, setSubmitted] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const stepIdx = ADMISSION_STEPS.indexOf(currentStep);
  const isFirst = stepIdx === 0;
  const isLast = currentStep === "care-team";

  const goNext = () => {
    const next = ADMISSION_STEPS[stepIdx + 1];
    if (next) setCurrentStep(next);
  };
  const goPrev = () => {
    const prev = ADMISSION_STEPS[stepIdx - 1];
    if (prev) setCurrentStep(prev);
  };

  const updateFormData = useCallback(
    <K extends keyof AdmissionFormData>(section: K, data: Partial<AdmissionFormData[K]>) => {
      setFormData((prev) => ({
        ...prev,
        [section]: { ...prev[section], ...data },
      }));
    },
    [],
  );

  // ── Admission mutation ────────────────────────────────────────────────────

  const admitMutation = useMutation({
    mutationFn: async () => {
      const locationId = session?.locationId;
      if (!locationId)
        throw new Error(
          "No location context — your account is missing a location assignment. Contact your administrator.",
        );

      const d = formData.demographics;
      const c = formData.clinical;
      const e = formData.election;

      // Step 1: Create patient
      const patient = await createPatientFn({
        data: {
          body: {
            identifier: [],
            name: [{ use: "official", family: d.lastName, given: [d.firstName] }],
            gender: d.gender || undefined,
            birthDate: d.birthDate || (new Date().toISOString().split("T")[0] ?? ""),
            telecom: [
              ...(d.phone
                ? [{ system: "phone" as const, value: d.phone, use: "home" as const }]
                : []),
              ...(d.email ? [{ system: "email" as const, value: d.email }] : []),
            ],
            address:
              d.addressLine1 && d.city && d.state && d.postalCode
                ? [
                    {
                      use: "home" as const,
                      line: [d.addressLine1, d.addressLine2].filter(Boolean),
                      city: d.city,
                      state: d.state,
                      postalCode: d.postalCode,
                      country: "US",
                    },
                  ]
                : undefined,
            contact: d.emergencyContactLastName
              ? [
                  {
                    relationship: [d.emergencyContactRelationship || "family"],
                    name: {
                      family: d.emergencyContactLastName,
                      given: [d.emergencyContactFirstName].filter(Boolean),
                    },
                    telecom: d.emergencyContactPhone
                      ? [{ system: "phone" as const, value: d.emergencyContactPhone }]
                      : undefined,
                    isPrimary: true,
                  },
                ]
              : undefined,
            hospiceLocationId: locationId,
            admissionDate: e.benefitPeriodStart || undefined,
            careModel: c.careModel || undefined,
          },
        },
      });

      const patientId = patient.id;

      // Step 2: Add conditions (in parallel)
      const conditionPromises = c.diagnoses
        .filter((dx) => dx.icd10Code && dx.description)
        .map((dx) => {
          const body: CreateConditionBody = {
            icd10Code: dx.icd10Code,
            description: dx.description,
            isTerminal: dx.isTerminal,
            isRelated: dx.isRelated,
            clinicalStatus: "ACTIVE",
          };
          return addConditionFn({ data: { patientId, body } });
        });

      // Step 3: Assign care team members (in parallel)
      const teamPromises = formData.careTeam.members
        .filter((m) => m.name.trim() !== "")
        .map((m) => {
          const body: AssignCareTeamMemberInput = {
            name: m.name,
            discipline: m.discipline,
            role: m.role,
            phone: m.phone || undefined,
            isPrimaryContact: m.discipline === "RN",
          };
          return assignCareTeamMemberFn({ data: { patientId, body } });
        });

      // Step 4: Create NOE (if election date provided)
      const noePromise = e.electionDate
        ? createNOEFn({ data: { patientId, body: { electionDate: e.electionDate } } })
        : null;

      await Promise.all([
        ...conditionPromises,
        ...teamPromises,
        ...(noePromise ? [noePromise] : []),
      ]);

      return patient;
    },
    onSuccess: (patient) => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: patientKeys.all() });
      setTimeout(
        () => navigate({ to: "/patients/$patientId", params: { patientId: patient.id } }),
        1500,
      );
    },
  });

  // ── Success screen ────────────────────────────────────────────────────────

  if (submitted) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-50">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-100 flex items-center justify-center">
            <svg
              className="w-8 h-8 text-emerald-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <title>Success</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-800">Patient Admitted</h2>
          <p className="text-gray-500 mt-1">Redirecting to patient chart...</p>
        </div>
      </div>
    );
  }

  // ── Confirmation dialog ───────────────────────────────────────────────────

  const confirmDialog = showConfirmDialog && (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirm Patient Admission</h3>
        <p className="text-sm text-gray-600 mb-1">
          You are about to admit{" "}
          <span className="font-medium">
            {formData.demographics.firstName} {formData.demographics.lastName}
          </span>{" "}
          as a <span className="font-medium">{formData.clinical.careModel}</span> patient.
        </p>
        {formData.election.electionDate && (
          <p className="text-sm text-gray-600 mb-1">
            Election date: <span className="font-medium">{formData.election.electionDate}</span>
            {" | "}NOE deadline:{" "}
            <span className="font-medium text-amber-700">
              {addBusinessDays(formData.election.electionDate, 5)}
            </span>
          </p>
        )}
        <p className="text-sm text-gray-600 mb-4">
          {formData.clinical.diagnoses.length} diagnosis(es),{" "}
          {formData.careTeam.members.filter((m) => m.name).length} care team member(s).
        </p>

        {admitMutation.isError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {admitMutation.error instanceof Error
              ? admitMutation.error.message
              : "Admission failed"}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button
            type="button"
            onClick={() => setShowConfirmDialog(false)}
            disabled={admitMutation.isPending}
            className="px-4 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => admitMutation.mutate()}
            disabled={admitMutation.isPending}
            className="px-5 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            {admitMutation.isPending ? "Admitting..." : "Admit Patient"}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Main layout ───────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {confirmDialog}

      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/patients" className="text-gray-400 hover:text-gray-600 text-sm">
            &larr; Back to patients
          </Link>
          <span className="text-gray-300">|</span>
          <h1 className="text-sm font-semibold text-gray-700">Patient Admission</h1>
        </div>
      </header>

      {/* Step progress bar */}
      <AdmissionProgressBar
        steps={ADMISSION_STEPS}
        current={currentStep}
        onStepClick={setCurrentStep}
      />

      {/* Step content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.18 }}
            >
              <StepContent step={currentStep} formData={formData} updateFormData={updateFormData} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between">
        <button
          type="button"
          onClick={goPrev}
          disabled={isFirst}
          className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
        >
          Back
        </button>

        <span className="text-xs text-gray-400">
          Step {stepIdx + 1} of {ADMISSION_STEPS.length}
        </span>

        {isLast ? (
          <button
            type="button"
            onClick={() => setShowConfirmDialog(true)}
            className="px-5 py-2 text-sm font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Admit Patient
          </button>
        ) : (
          <button
            type="button"
            onClick={goNext}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function AdmissionProgressBar({
  steps,
  current,
  onStepClick,
}: {
  steps: AdmissionStep[];
  current: AdmissionStep;
  onStepClick: (step: AdmissionStep) => void;
}) {
  const currentIdx = steps.indexOf(current);
  return (
    <div className="bg-white border-b border-gray-100 px-6 py-3">
      <div className="flex items-center gap-1 max-w-3xl mx-auto">
        {steps.map((step, i) => {
          const done = i < currentIdx;
          const active = step === current;
          return (
            <div key={step} className="flex items-center gap-1 flex-1">
              <button
                type="button"
                onClick={() => onStepClick(step)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  done
                    ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                    : active
                      ? "bg-blue-100 text-blue-700 ring-2 ring-blue-300"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                    done
                      ? "bg-emerald-500 text-white"
                      : active
                        ? "bg-blue-500 text-white"
                        : "bg-gray-300 text-white"
                  }`}
                >
                  {done ? "\u2713" : i + 1}
                </span>
                {STEP_LABELS[step]}
              </button>
              {i < steps.length - 1 && (
                <div className={`h-px flex-1 min-w-4 ${done ? "bg-emerald-300" : "bg-gray-200"}`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Step content router ───────────────────────────────────────────────────────

function StepContent({
  step,
  formData,
  updateFormData,
}: {
  step: AdmissionStep;
  formData: AdmissionFormData;
  updateFormData: <K extends keyof AdmissionFormData>(
    section: K,
    data: Partial<AdmissionFormData[K]>,
  ) => void;
}) {
  switch (step) {
    case "demographics":
      return (
        <DemographicsStep
          data={formData.demographics}
          onChange={(d) => updateFormData("demographics", d)}
        />
      );
    case "clinical":
      return (
        <ClinicalStep data={formData.clinical} onChange={(d) => updateFormData("clinical", d)} />
      );
    case "physician":
      return (
        <PhysicianStep data={formData.physician} onChange={(d) => updateFormData("physician", d)} />
      );
    case "election":
      return (
        <ElectionStep data={formData.election} onChange={(d) => updateFormData("election", d)} />
      );
    case "care-team":
      return (
        <CareTeamStep
          data={formData.careTeam}
          onChange={(members) => updateFormData("careTeam", { members })}
        />
      );
  }
}

// ── Shared form field components ──────────────────────────────────────────────

function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <span className="block text-sm font-medium text-gray-700 mb-1">
      {label}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </span>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <FieldLabel label={label} required={required} />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      />
    </div>
  );
}

function SelectInput({
  label,
  value,
  onChange,
  options,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean;
}) {
  return (
    <div>
      <FieldLabel label={label} required={required} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
      <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
    </div>
  );
}

// ── Step 1: Demographics ──────────────────────────────────────────────────────

function DemographicsStep({
  data,
  onChange,
}: {
  data: DemographicsData;
  onChange: (d: Partial<DemographicsData>) => void;
}) {
  return (
    <div className="space-y-6">
      <StepHeader
        title="Patient Demographics"
        subtitle="Enter the patient's personal information (PHI — encrypted at rest)"
      />

      {/* Name */}
      <div className="grid grid-cols-2 gap-4">
        <TextInput
          label="First Name"
          value={data.firstName}
          onChange={(v) => onChange({ firstName: v })}
          placeholder="John"
          required
        />
        <TextInput
          label="Last Name"
          value={data.lastName}
          onChange={(v) => onChange({ lastName: v })}
          placeholder="Doe"
          required
        />
      </div>

      {/* DOB + Gender */}
      <div className="grid grid-cols-2 gap-4">
        <TextInput
          label="Date of Birth"
          value={data.birthDate}
          onChange={(v) => onChange({ birthDate: v })}
          type="date"
          required
        />
        <SelectInput
          label="Gender"
          value={data.gender}
          onChange={(v) => onChange({ gender: v as DemographicsData["gender"] })}
          options={[
            { value: "male", label: "Male" },
            { value: "female", label: "Female" },
            { value: "other", label: "Other" },
            { value: "unknown", label: "Unknown" },
          ]}
        />
      </div>

      {/* Contact */}
      <div className="grid grid-cols-2 gap-4">
        <TextInput
          label="Phone"
          value={data.phone}
          onChange={(v) => onChange({ phone: v })}
          placeholder="(555) 123-4567"
          type="tel"
        />
        <TextInput
          label="Email"
          value={data.email}
          onChange={(v) => onChange({ email: v })}
          placeholder="patient@example.com"
          type="email"
        />
      </div>

      {/* Address */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm font-medium text-gray-700 mb-3">Address</p>
        <div className="space-y-3">
          <TextInput
            label="Address Line 1"
            value={data.addressLine1}
            onChange={(v) => onChange({ addressLine1: v })}
            placeholder="123 Main St"
          />
          <TextInput
            label="Address Line 2"
            value={data.addressLine2}
            onChange={(v) => onChange({ addressLine2: v })}
            placeholder="Apt 4B"
          />
          <div className="grid grid-cols-3 gap-4">
            <TextInput
              label="City"
              value={data.city}
              onChange={(v) => onChange({ city: v })}
              placeholder="Springfield"
            />
            <TextInput
              label="State"
              value={data.state}
              onChange={(v) => onChange({ state: v })}
              placeholder="IL"
            />
            <TextInput
              label="ZIP Code"
              value={data.postalCode}
              onChange={(v) => onChange({ postalCode: v })}
              placeholder="62704"
            />
          </div>
        </div>
      </div>

      {/* Emergency contact */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm font-medium text-gray-700 mb-3">Emergency Contact</p>
        <div className="grid grid-cols-2 gap-4">
          <TextInput
            label="First Name"
            value={data.emergencyContactFirstName}
            onChange={(v) => onChange({ emergencyContactFirstName: v })}
          />
          <TextInput
            label="Last Name"
            value={data.emergencyContactLastName}
            onChange={(v) => onChange({ emergencyContactLastName: v })}
          />
          <TextInput
            label="Phone"
            value={data.emergencyContactPhone}
            onChange={(v) => onChange({ emergencyContactPhone: v })}
            type="tel"
          />
          <SelectInput
            label="Relationship"
            value={data.emergencyContactRelationship}
            onChange={(v) => onChange({ emergencyContactRelationship: v })}
            options={[
              { value: "family", label: "Family" },
              { value: "spouse", label: "Spouse" },
              { value: "child", label: "Child" },
              { value: "friend", label: "Friend" },
              { value: "emergency", label: "Emergency Contact" },
              { value: "other", label: "Other" },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

// ── Step 2: Clinical ──────────────────────────────────────────────────────────

function ClinicalStep({
  data,
  onChange,
}: {
  data: ClinicalData;
  onChange: (d: Partial<ClinicalData>) => void;
}) {
  const addDiagnosis = () => {
    onChange({
      diagnoses: [
        ...data.diagnoses,
        { icd10Code: "", description: "", isTerminal: false, isRelated: true },
      ],
    });
  };

  const updateDiagnosis = (idx: number, patch: Partial<DiagnosisEntry>) => {
    const updated = data.diagnoses.map((d, i) => (i === idx ? { ...d, ...patch } : d));
    onChange({ diagnoses: updated });
  };

  const removeDiagnosis = (idx: number) => {
    onChange({ diagnoses: data.diagnoses.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-6">
      <StepHeader
        title="Clinical Information"
        subtitle="Primary diagnosis, secondary diagnoses, and care model"
      />

      {/* Care model selector */}
      <div>
        <FieldLabel label="Care Model" required />
        <div className="flex gap-2">
          {(["HOSPICE", "PALLIATIVE", "CCM"] as CareModel[]).map((model) => (
            <button
              key={model}
              type="button"
              onClick={() => onChange({ careModel: model })}
              className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                data.careModel === model
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {model}
            </button>
          ))}
        </div>
      </div>

      {/* Diagnoses */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <FieldLabel label="Diagnoses (ICD-10)" />
          <button
            type="button"
            onClick={addDiagnosis}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            + Add Diagnosis
          </button>
        </div>

        {data.diagnoses.length === 0 && (
          <div className="text-sm text-gray-400 italic py-4 text-center border border-dashed border-gray-200 rounded-lg">
            No diagnoses added. Click &ldquo;+ Add Diagnosis&rdquo; to begin.
          </div>
        )}

        <div className="space-y-3">
          {data.diagnoses.map((dx, idx) => (
            <div
              key={dx.icd10Code || `dx-new-${idx}`}
              className="border border-gray-200 rounded-lg p-4 bg-white"
            >
              <div className="flex items-start gap-4">
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <TextInput
                    label="ICD-10 Code"
                    value={dx.icd10Code}
                    onChange={(v) => updateDiagnosis(idx, { icd10Code: v })}
                    placeholder="C34.90"
                    required
                  />
                  <TextInput
                    label="Description"
                    value={dx.description}
                    onChange={(v) => updateDiagnosis(idx, { description: v })}
                    placeholder="Malignant neoplasm of lung"
                    required
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeDiagnosis(idx)}
                  className="mt-6 p-1 text-gray-400 hover:text-red-500"
                  title="Remove diagnosis"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <title>Remove</title>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <div className="flex gap-4 mt-3">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dx.isTerminal}
                    onChange={(e) => updateDiagnosis(idx, { isTerminal: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Terminal diagnosis (42 CFR &sect;418.22)
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dx.isRelated}
                    onChange={(e) => updateDiagnosis(idx, { isRelated: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  Related condition (CMS claim)
                </label>
              </div>
              {idx === 0 && (
                <span className="inline-block mt-2 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                  Primary Diagnosis
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Step 3: Physician ─────────────────────────────────────────────────────────

function PhysicianStep({
  data,
  onChange,
}: {
  data: PhysicianData;
  onChange: (d: Partial<PhysicianData>) => void;
}) {
  return (
    <div className="space-y-6">
      <StepHeader
        title="Physician Information"
        subtitle="Attending and certifying physician details"
      />

      <TextInput
        label="Attending Physician"
        value={data.attendingPhysicianName}
        onChange={(v) => onChange({ attendingPhysicianName: v })}
        placeholder="Dr. Jane Smith"
        required
      />

      <TextInput
        label="Certifying Physician"
        value={data.certifyingPhysicianName}
        onChange={(v) => onChange({ certifyingPhysicianName: v })}
        placeholder="Dr. John Williams"
        required
      />

      <div className="border-t border-gray-100 pt-4">
        <p className="text-sm font-medium text-gray-700 mb-3">Face-to-Face (F2F) Encounter</p>
        <p className="text-xs text-gray-500 mb-3">
          Required from benefit period 3 onwards. Must be within 30 calendar days before
          recertification (42 CFR &sect;418.22).
        </p>
        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer mb-3">
          <input
            type="checkbox"
            checked={data.f2fCompleted}
            onChange={(e) => onChange({ f2fCompleted: e.target.checked })}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          F2F encounter completed
        </label>
        {data.f2fCompleted && (
          <TextInput
            label="F2F Date"
            value={data.f2fDate}
            onChange={(v) => onChange({ f2fDate: v })}
            type="date"
          />
        )}
      </div>
    </div>
  );
}

// ── Step 4: Election ──────────────────────────────────────────────────────────

function ElectionStep({
  data,
  onChange,
}: {
  data: ElectionData;
  onChange: (d: Partial<ElectionData>) => void;
}) {
  const noeDeadline = data.electionDate ? addBusinessDays(data.electionDate, 5) : null;

  return (
    <div className="space-y-6">
      <StepHeader
        title="Election Statement"
        subtitle="Hospice election date and benefit period start"
      />

      <TextInput
        label="Election Date"
        value={data.electionDate}
        onChange={(v) => onChange({ electionDate: v })}
        type="date"
        required
      />

      {noeDeadline && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">
            <span className="font-semibold">NOE Filing Deadline:</span> {noeDeadline}
          </p>
          <p className="text-xs text-amber-600 mt-1">
            5 business days from election date (excludes weekends &amp; federal holidays). Late
            filing may result in reduced reimbursement.
          </p>
        </div>
      )}

      <TextInput
        label="Benefit Period Start"
        value={data.benefitPeriodStart}
        onChange={(v) => onChange({ benefitPeriodStart: v })}
        type="date"
        required
      />

      <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-xs text-blue-700">
          <span className="font-semibold">Benefit periods:</span> 90 days / 90 days / 60 days
          thereafter. The first benefit period starts on the date entered above.
        </p>
      </div>
    </div>
  );
}

// ── Step 5: Care Team ─────────────────────────────────────────────────────────

function CareTeamStep({
  data,
  onChange,
}: {
  data: CareTeamData;
  onChange: (members: CareTeamEntry[]) => void;
}) {
  const updateMember = (idx: number, patch: Partial<CareTeamEntry>) => {
    const updated = data.members.map((m, i) => (i === idx ? { ...m, ...patch } : m));
    onChange(updated);
  };

  const addMember = () => {
    onChange([...data.members, { name: "", discipline: "RN", role: "", phone: "" }]);
  };

  const removeMember = (idx: number) => {
    onChange(data.members.filter((_, i) => i !== idx));
  };

  const disciplineOptions: { value: CareTeamDiscipline; label: string }[] = [
    { value: "PHYSICIAN", label: "Physician" },
    { value: "RN", label: "Registered Nurse" },
    { value: "SW", label: "Social Worker" },
    { value: "CHAPLAIN", label: "Chaplain" },
    { value: "AIDE", label: "Hospice Aide" },
    { value: "VOLUNTEER", label: "Volunteer" },
    { value: "BEREAVEMENT", label: "Bereavement" },
    { value: "THERAPIST", label: "Therapist" },
  ];

  return (
    <div className="space-y-6">
      <StepHeader
        title="Care Team Assignment"
        subtitle="Assign the interdisciplinary team members for this patient (42 CFR §418.56)"
      />

      <div className="space-y-4">
        {data.members.map((member, idx) => (
          <div
            key={idx}
            className="border border-gray-200 rounded-lg p-4 bg-white"
          >
            <div className="flex items-start gap-4">
              <div className="flex-1 grid grid-cols-2 gap-3">
                <TextInput
                  label="Name"
                  value={member.name}
                  onChange={(v) => updateMember(idx, { name: v })}
                  placeholder="Jane Smith, RN"
                />
                <SelectInput
                  label="Discipline"
                  value={member.discipline}
                  onChange={(v) => updateMember(idx, { discipline: v as CareTeamDiscipline })}
                  options={disciplineOptions}
                />
                <TextInput
                  label="Role"
                  value={member.role}
                  onChange={(v) => updateMember(idx, { role: v })}
                  placeholder="Primary RN"
                />
                <TextInput
                  label="Phone"
                  value={member.phone}
                  onChange={(v) => updateMember(idx, { phone: v })}
                  placeholder="(555) 123-4567"
                  type="tel"
                />
              </div>
              {data.members.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeMember(idx)}
                  className="mt-6 p-1 text-gray-400 hover:text-red-500"
                  title="Remove member"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <title>Remove</title>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={addMember}
        className="text-sm text-blue-600 hover:text-blue-800 font-medium"
      >
        + Add Team Member
      </button>
    </div>
  );
}
