// routes/_authed/patients/new.tsx
// Patient Admission Wizard — 5-step multi-step form (§5.5)
// Design: hospici-screens.pen "23 Patient Admission Wizard"
//
// Steps: 1·Demographics → 2·Clinical → 3·Physician → 4·Election → 5·Care Team
// Progress bar: numbered circles + connector lines, centered in white bar
// Form: 720px white card, cornerRadius 8, centered in #F1F5F9 area
// Footer: "Step N of 5" + Back (← icon) + Continue (→ icon) / Admit Patient

import {
  addAllergyFn,
  addConditionFn,
  assignCareTeamMemberFn,
  createNOEFn,
  createPatientFn,
} from "@/functions/patient-admission.functions.js";
import { patientKeys } from "@/lib/query/keys.js";
import type { RouterContext } from "@/routes/__root.js";
import type {
  AllergySeverity,
  AssignCareTeamMemberInput,
  CareModel,
  CareTeamDiscipline,
  CreateConditionBody,
} from "@hospici/shared-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useRef, useState } from "react";

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_authed/patients/new")({
  component: PatientAdmissionWizard,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type AdmissionStep = "demographics" | "clinical" | "physician" | "election" | "care-team";

const STEPS: AdmissionStep[] = ["demographics", "clinical", "physician", "election", "care-team"];

const STEP_META: Record<
  AdmissionStep,
  { num: number; label: string; title: string; subtitle: string }
> = {
  demographics: {
    num: 1,
    label: "Demographics",
    title: "Step 1: Patient Demographics",
    subtitle: "Enter the patient's personal information (PHI — encrypted at rest).",
  },
  clinical: {
    num: 2,
    label: "Clinical",
    title: "Step 2: Clinical Information",
    subtitle:
      "Enter the patient's primary diagnosis, secondary conditions, and allergy information.",
  },
  physician: {
    num: 3,
    label: "Physician",
    title: "Step 3: Physician Information",
    subtitle: "Attending and certifying physician details, and face-to-face encounter status.",
  },
  election: {
    num: 4,
    label: "Election",
    title: "Step 4: Election Statement",
    subtitle:
      "Hospice election date, NOE filing deadline (auto-calculated), and benefit period start.",
  },
  "care-team": {
    num: 5,
    label: "Care Team",
    title: "Step 5: Care Team Assignment",
    subtitle: "Assign the interdisciplinary team members for this patient (42 CFR §418.56).",
  },
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
  ecFirstName: string;
  ecLastName: string;
  ecPhone: string;
  ecRelationship: string;
}

interface DiagnosisEntry {
  icd10Code: string;
  description: string;
  isTerminal: boolean;
}

interface AllergyEntry {
  allergen: string;
  reaction: string;
  severity: AllergySeverity;
}

interface ClinicalData {
  primaryDiagnosis: DiagnosisEntry | null;
  secondaryDiagnoses: DiagnosisEntry[];
  allergies: AllergyEntry[];
  careModel: CareModel;
}

interface PhysicianData {
  attendingName: string;
  certifyingName: string;
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

interface AdmissionFormData {
  demographics: DemographicsData;
  clinical: ClinicalData;
  physician: PhysicianData;
  election: ElectionData;
  careTeam: { members: CareTeamEntry[] };
}

const INITIAL: AdmissionFormData = {
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
    ecFirstName: "",
    ecLastName: "",
    ecPhone: "",
    ecRelationship: "family",
  },
  clinical: {
    primaryDiagnosis: null,
    secondaryDiagnoses: [],
    allergies: [],
    careModel: "HOSPICE",
  },
  physician: { attendingName: "", certifyingName: "", f2fCompleted: false, f2fDate: "" },
  election: { electionDate: "", benefitPeriodStart: "" },
  careTeam: {
    members: [
      { name: "", discipline: "RN", role: "Primary RN", phone: "" },
      { name: "", discipline: "SW", role: "Social Worker", phone: "" },
      { name: "", discipline: "CHAPLAIN", role: "Chaplain", phone: "" },
      { name: "", discipline: "AIDE", role: "Hospice Aide", phone: "" },
    ],
  },
};

// ── NOE deadline helper (5 business days) ────────────────────────────────────

const US_HOLIDAYS_2025_2027 = new Set([
  "2025-01-01",
  "2025-01-20",
  "2025-02-17",
  "2025-05-26",
  "2025-07-04",
  "2025-09-01",
  "2025-11-27",
  "2025-12-25",
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-05-25",
  "2026-07-03",
  "2026-09-07",
  "2026-11-26",
  "2026-12-25",
  "2027-01-01",
  "2027-01-18",
  "2027-02-15",
  "2027-05-31",
  "2027-07-05",
  "2027-09-06",
  "2027-11-25",
  "2027-12-24",
]);

function addBusinessDays(start: string, n: number): string {
  const d = new Date(`${start}T00:00:00`);
  let added = 0;
  while (added < n) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    const iso = d.toISOString().slice(0, 10);
    if (day !== 0 && day !== 6 && !US_HOLIDAYS_2025_2027.has(iso)) added++;
  }
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso: string) {
  const [y, m, day] = iso.split("-");
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${months[Number(m) - 1]} ${day}, ${y}`;
}

// ── Main wizard ───────────────────────────────────────────────────────────────

function PatientAdmissionWizard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = Route.useRouteContext() as RouterContext;

  const [step, setStep] = useState<AdmissionStep>("demographics");
  const [form, setForm] = useState<AdmissionFormData>(INITIAL);
  const [admitted, setAdmitted] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const stepIdx = STEPS.indexOf(step);
  const isFirst = stepIdx === 0;
  const isLast = step === "care-team";

  const goNext = () => {
    const n = STEPS[stepIdx + 1];
    if (n) setStep(n);
  };
  const goPrev = () => {
    const p = STEPS[stepIdx - 1];
    if (p) setStep(p);
  };

  const update = useCallback(
    <K extends keyof AdmissionFormData>(section: K, data: Partial<AdmissionFormData[K]>) => {
      setForm((prev) => ({ ...prev, [section]: { ...prev[section], ...data } }));
    },
    [],
  );

  // ── Admit mutation ──────────────────────────────────────────────────────────

  const admitMutation = useMutation({
    mutationFn: async () => {
      const locationId = session?.locationId;
      if (!locationId) throw new Error("No location context. Contact your administrator.");

      const d = form.demographics;
      const c = form.clinical;
      const e = form.election;

      const patient = await createPatientFn({
        data: {
          body: {
            identifier: [],
            name: [{ use: "official", family: d.lastName, given: [d.firstName] }],
            gender: d.gender || undefined,
            birthDate: d.birthDate || new Date().toISOString().slice(0, 10),
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
            contact: d.ecLastName
              ? [
                  {
                    relationship: [d.ecRelationship || "family"],
                    name: { family: d.ecLastName, given: [d.ecFirstName].filter(Boolean) },
                    telecom: d.ecPhone
                      ? [{ system: "phone" as const, value: d.ecPhone }]
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

      const pid = patient.id;
      const allDx = [
        ...(c.primaryDiagnosis ? [{ ...c.primaryDiagnosis, isRelated: true }] : []),
        ...c.secondaryDiagnoses.map((dx) => ({ ...dx, isRelated: true })),
      ];

      await Promise.all([
        ...allDx
          .filter((dx) => dx.icd10Code)
          .map((dx) => {
            const body: CreateConditionBody = {
              icd10Code: dx.icd10Code,
              description: dx.description,
              isTerminal: dx.isTerminal,
              isRelated: dx.isRelated,
              clinicalStatus: "ACTIVE",
            };
            return addConditionFn({ data: { patientId: pid, body } });
          }),
        ...c.allergies.map((a) =>
          addAllergyFn({
            data: {
              patientId: pid,
              body: {
                allergen: a.allergen,
                reaction: a.reaction,
                severity: a.severity,
                allergenType: "DRUG",
              },
            },
          }),
        ),
        ...form.careTeam.members
          .filter((m) => m.name.trim())
          .map((m) => {
            const body: AssignCareTeamMemberInput = {
              name: m.name,
              discipline: m.discipline,
              role: m.role,
              phone: m.phone || undefined,
              isPrimaryContact: m.discipline === "RN",
            };
            return assignCareTeamMemberFn({ data: { patientId: pid, body } });
          }),
        ...(e.electionDate
          ? [createNOEFn({ data: { patientId: pid, body: { electionDate: e.electionDate } } })]
          : []),
      ]);

      return patient;
    },
    onSuccess: (patient) => {
      setAdmitted(true);
      queryClient.invalidateQueries({ queryKey: patientKeys.all() });
      setTimeout(
        () => navigate({ to: "/patients/$patientId", params: { patientId: patient.id } }),
        1500,
      );
    },
  });

  // ── Success screen ──────────────────────────────────────────────────────────

  if (admitted) {
    return (
      <div className="flex items-center justify-center h-full bg-[#F1F5F9]">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-full bg-[#F0FDF4] border-2 border-[#86EFAC] flex items-center justify-center">
            <svg
              className="w-7 h-7 text-[#16A34A]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <title>Admitted</title>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p
            className="text-[18px] font-semibold text-[#0F172A]"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Patient Admitted
          </p>
          <p className="text-[13px] text-[#64748B]">Redirecting to patient chart…</p>
        </div>
      </div>
    );
  }

  // ── Confirm dialog ──────────────────────────────────────────────────────────

  const noeDeadline = form.election.electionDate
    ? addBusinessDays(form.election.electionDate, 5)
    : null;

  return (
    <div className="flex flex-col h-full bg-[#F8FAFC]">
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white w-full max-w-[440px] mx-4 p-6 rounded-lg border border-[#E2E8F0]">
            <h3
              className="text-[16px] font-semibold text-[#0F172A] mb-1"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              Confirm Patient Admission
            </h3>
            <p className="text-[13px] text-[#64748B] mb-1">
              You are about to admit{" "}
              <span className="font-medium text-[#0F172A]">
                {form.demographics.firstName} {form.demographics.lastName}
              </span>{" "}
              as a <span className="font-medium text-[#0F172A]">{form.clinical.careModel}</span>{" "}
              patient.
            </p>
            {noeDeadline && (
              <p className="text-[13px] text-[#64748B] mb-1">
                Election date:{" "}
                <span className="font-mono text-[#0F172A]">{form.election.electionDate}</span>
                {" · "}NOE deadline:{" "}
                <span className="font-mono text-[#D97706] font-semibold">
                  {fmtDate(noeDeadline)}
                </span>
              </p>
            )}
            <p className="text-[13px] text-[#64748B] mb-4">
              {[
                form.clinical.primaryDiagnosis ? 1 : 0,
                form.clinical.secondaryDiagnoses.length,
              ].reduce((a, b) => a + b, 0)}{" "}
              diagnosis(es) · {form.clinical.allergies.length} allerg
              {form.clinical.allergies.length === 1 ? "y" : "ies"} ·{" "}
              {form.careTeam.members.filter((m) => m.name).length} care team member(s)
            </p>

            {admitMutation.isError && (
              <div className="mb-4 p-3 bg-[#FEF2F2] border border-[#FCA5A5] text-[13px] text-[#991B1B]">
                {admitMutation.error instanceof Error
                  ? admitMutation.error.message
                  : "Admission failed"}
              </div>
            )}

            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                disabled={admitMutation.isPending}
                className="h-[38px] px-5 text-[13px] font-medium text-[#374151] border border-[#D1D5DB] rounded-md hover:bg-[#F8FAFC] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => admitMutation.mutate()}
                disabled={admitMutation.isPending}
                className="h-[38px] px-5 text-[13px] font-semibold text-white bg-[#DC2626] rounded-md hover:bg-[#B91C1C] disabled:opacity-50"
              >
                {admitMutation.isPending ? "Admitting…" : "Admit Patient"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Progress bar */}
      <WizardProgressBar current={step} onStepClick={setStep} completedUpTo={stepIdx} />

      {/* Form area */}
      <div className="flex-1 overflow-y-auto bg-[#F1F5F9]">
        <div className="flex justify-center px-20 py-7">
          <div className="w-[720px] bg-white border border-[#E2E8F0] rounded-lg p-8 space-y-5">
            {/* Step header */}
            <div className="space-y-1">
              <h2
                className="text-[18px] font-semibold text-[#0F172A]"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {STEP_META[step].title}
              </h2>
              <p className="text-[13px] text-[#64748B]">{STEP_META[step].subtitle}</p>
            </div>
            <div className="h-px bg-[#F1F5F9]" />

            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.15 }}
              >
                <StepContent step={step} form={form} update={update} />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 flex items-center justify-between bg-white border-t border-[#E2E8F0] px-20 py-3.5">
        <span className="text-[13px] text-[#64748B]">
          Step {stepIdx + 1} of {STEPS.length}
        </span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={goPrev}
            disabled={isFirst}
            className="inline-flex items-center gap-1.5 h-[38px] px-5 text-[13px] font-medium text-[#374151] border border-[#D1D5DB] rounded-md hover:bg-[#F8FAFC] disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowLeftIcon />
            Back
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={() => setShowConfirm(true)}
              className="inline-flex items-center gap-1.5 h-[38px] px-5 text-[13px] font-semibold text-white bg-[#DC2626] rounded-md hover:bg-[#B91C1C]"
            >
              Admit Patient
            </button>
          ) : (
            <button
              type="button"
              onClick={goNext}
              className="inline-flex items-center gap-1.5 h-[38px] px-5 text-[13px] font-semibold text-white bg-[#2563EB] rounded-md hover:bg-[#1D4ED8]"
            >
              Continue
              <ArrowRightIcon />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function WizardProgressBar({
  current,
  onStepClick,
  completedUpTo,
}: {
  current: AdmissionStep;
  onStepClick: (s: AdmissionStep) => void;
  completedUpTo: number;
}) {
  return (
    <div className="shrink-0 flex items-center justify-center gap-0 bg-white border-b border-[#E2E8F0] px-12 py-5">
      {STEPS.map((s, i) => {
        const meta = STEP_META[s];
        const done = i < completedUpTo;
        const active = s === current;
        const lineAfter = i < STEPS.length - 1;

        return (
          <div key={s} className="flex items-center">
            <button
              type="button"
              onClick={() => onStepClick(s)}
              className="flex items-center gap-2 cursor-pointer"
            >
              {/* Circle */}
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
                  done || active ? "bg-[#2563EB]" : "bg-white border-2 border-[#D1D5DB]"
                }`}
              >
                {done ? (
                  <svg
                    className="w-3.5 h-3.5 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <title>Done</title>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span
                    className={`text-[12px] font-semibold ${active ? "text-white" : "text-[#64748B]"}`}
                  >
                    {meta.num}
                  </span>
                )}
              </div>
              {/* Label */}
              <span
                className={`text-[13px] ${active || done ? "font-semibold text-[#2563EB]" : "font-normal text-[#64748B]"}`}
              >
                {meta.label}
              </span>
            </button>
            {/* Connector line */}
            {lineAfter && (
              <div
                className={`w-[60px] h-0.5 mx-3 ${i < completedUpTo ? "bg-[#2563EB]" : "bg-[#E2E8F0]"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step content router ───────────────────────────────────────────────────────

function StepContent({
  step,
  form,
  update,
}: {
  step: AdmissionStep;
  form: AdmissionFormData;
  update: <K extends keyof AdmissionFormData>(
    section: K,
    data: Partial<AdmissionFormData[K]>,
  ) => void;
}) {
  switch (step) {
    case "demographics":
      return (
        <DemographicsStep data={form.demographics} onChange={(d) => update("demographics", d)} />
      );
    case "clinical":
      return <ClinicalStep data={form.clinical} onChange={(d) => update("clinical", d)} />;
    case "physician":
      return <PhysicianStep data={form.physician} onChange={(d) => update("physician", d)} />;
    case "election":
      return <ElectionStep data={form.election} onChange={(d) => update("election", d)} />;
    case "care-team":
      return (
        <CareTeamStep
          data={form.careTeam}
          onChange={(members) => update("careTeam", { members })}
        />
      );
  }
}

// ── Shared field components ───────────────────────────────────────────────────

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <span className="block text-[13px] font-medium text-[#374151] mb-1.5">
      {text}
      {required && <span className="text-[#DC2626] ml-0.5">*</span>}
    </span>
  );
}

function Field({
  label,
  required,
  children,
}: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <Label text={label} required={required} />
      {children}
    </div>
  );
}

const inputCls =
  "w-full h-10 px-3 text-[13px] text-[#0F172A] border border-[#D1D5DB] rounded-md bg-white placeholder-[#94A3B8] focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]";
const selectCls =
  "w-full h-10 px-3 text-[13px] text-[#0F172A] border border-[#D1D5DB] rounded-md bg-white focus:outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]";

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="pt-1">
      <p className="text-[11px] font-semibold text-[#94A3B8] tracking-wide uppercase mb-3">
        {label}
      </p>
    </div>
  );
}

// ── Step 1: Demographics ──────────────────────────────────────────────────────

function DemographicsStep({
  data,
  onChange,
}: { data: DemographicsData; onChange: (d: Partial<DemographicsData>) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="First Name" required>
          <input
            className={inputCls}
            value={data.firstName}
            onChange={(e) => onChange({ firstName: e.target.value })}
            placeholder="John"
          />
        </Field>
        <Field label="Last Name" required>
          <input
            className={inputCls}
            value={data.lastName}
            onChange={(e) => onChange({ lastName: e.target.value })}
            placeholder="Doe"
          />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Date of Birth" required>
          <input
            type="date"
            className={inputCls}
            value={data.birthDate}
            onChange={(e) => onChange({ birthDate: e.target.value })}
          />
        </Field>
        <Field label="Gender">
          <select
            className={selectCls}
            value={data.gender}
            onChange={(e) => onChange({ gender: e.target.value as DemographicsData["gender"] })}
          >
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
            <option value="unknown">Unknown</option>
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Phone">
          <input
            type="tel"
            className={inputCls}
            value={data.phone}
            onChange={(e) => onChange({ phone: e.target.value })}
            placeholder="(555) 123-4567"
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            className={inputCls}
            value={data.email}
            onChange={(e) => onChange({ email: e.target.value })}
            placeholder="patient@example.com"
          />
        </Field>
      </div>

      <div className="h-px bg-[#F1F5F9]" />
      <SectionDivider label="Address" />

      <Field label="Address Line 1">
        <input
          className={inputCls}
          value={data.addressLine1}
          onChange={(e) => onChange({ addressLine1: e.target.value })}
          placeholder="123 Main St"
        />
      </Field>
      <Field label="Address Line 2">
        <input
          className={inputCls}
          value={data.addressLine2}
          onChange={(e) => onChange({ addressLine2: e.target.value })}
          placeholder="Apt 4B (optional)"
        />
      </Field>
      <div className="grid grid-cols-3 gap-4">
        <Field label="City">
          <input
            className={inputCls}
            value={data.city}
            onChange={(e) => onChange({ city: e.target.value })}
            placeholder="Springfield"
          />
        </Field>
        <Field label="State">
          <input
            className={inputCls}
            value={data.state}
            onChange={(e) => onChange({ state: e.target.value })}
            placeholder="IL"
          />
        </Field>
        <Field label="ZIP Code">
          <input
            className={inputCls}
            value={data.postalCode}
            onChange={(e) => onChange({ postalCode: e.target.value })}
            placeholder="62704"
          />
        </Field>
      </div>

      <div className="h-px bg-[#F1F5F9]" />
      <SectionDivider label="Emergency Contact" />

      <div className="grid grid-cols-2 gap-4">
        <Field label="First Name">
          <input
            className={inputCls}
            value={data.ecFirstName}
            onChange={(e) => onChange({ ecFirstName: e.target.value })}
          />
        </Field>
        <Field label="Last Name">
          <input
            className={inputCls}
            value={data.ecLastName}
            onChange={(e) => onChange({ ecLastName: e.target.value })}
          />
        </Field>
        <Field label="Phone">
          <input
            type="tel"
            className={inputCls}
            value={data.ecPhone}
            onChange={(e) => onChange({ ecPhone: e.target.value })}
          />
        </Field>
        <Field label="Relationship">
          <select
            className={selectCls}
            value={data.ecRelationship}
            onChange={(e) => onChange({ ecRelationship: e.target.value })}
          >
            <option value="family">Family</option>
            <option value="spouse">Spouse</option>
            <option value="child">Child</option>
            <option value="friend">Friend</option>
            <option value="emergency">Emergency Contact</option>
            <option value="other">Other</option>
          </select>
        </Field>
      </div>
    </div>
  );
}

// ── Step 2: Clinical ──────────────────────────────────────────────────────────

function ClinicalStep({
  data,
  onChange,
}: { data: ClinicalData; onChange: (d: Partial<ClinicalData>) => void }) {
  const [primaryInput, setPrimaryInput] = useState(
    data.primaryDiagnosis
      ? `${data.primaryDiagnosis.icd10Code} — ${data.primaryDiagnosis.description}`
      : "",
  );
  const [secInput, setSecInput] = useState("");
  const [allergyInput, setAllergyInput] = useState("");
  const secRef = useRef<HTMLInputElement>(null);
  const allergyRef = useRef<HTMLInputElement>(null);

  // Parse "C34.90 — Malignant neoplasm…" or "C34.90 Malignant neoplasm…" into { icd10Code, description }
  function parseDx(raw: string): DiagnosisEntry | null {
    const trimmed = raw.trim();
    if (!trimmed) return null;
    // Preferred format: "CODE — Description"
    const dashSep = trimmed.indexOf(" — ");
    if (dashSep > 0) {
      return {
        icd10Code: trimmed.slice(0, dashSep).trim(),
        description: trimmed.slice(dashSep + 3).trim(),
        isTerminal: false,
      };
    }
    // Fallback: first space-delimited token is the code (ICD-10 codes never contain spaces)
    const spaceSep = trimmed.indexOf(" ");
    if (spaceSep > 0) {
      return {
        icd10Code: trimmed.slice(0, spaceSep).trim(),
        description: trimmed.slice(spaceSep).trim(),
        isTerminal: false,
      };
    }
    return { icd10Code: trimmed, description: trimmed, isTerminal: false };
  }

  // Parse "Penicillin — Anaphylaxis (SEVERE)" or just "Penicillin"
  function parseAllergy(raw: string): AllergyEntry {
    const trimmed = raw.trim();
    const sep = trimmed.indexOf(" — ");
    if (sep > 0) {
      const left = trimmed.slice(0, sep).trim();
      const right = trimmed.slice(sep + 3).trim();
      const sevMatch = right.match(/\(([^)]+)\)$/);
      const sev = (sevMatch?.[1]?.toUpperCase() ?? "SEVERE") as AllergySeverity;
      const reaction = sevMatch ? right.slice(0, right.lastIndexOf("(")).trim() : right;
      return { allergen: left, reaction, severity: sev };
    }
    return { allergen: trimmed, reaction: "", severity: "SEVERE" };
  }

  const commitPrimary = () => {
    const dx = parseDx(primaryInput);
    onChange({ primaryDiagnosis: dx });
  };

  const addSecondary = () => {
    const dx = parseDx(secInput);
    if (!dx) return;
    onChange({ secondaryDiagnoses: [...data.secondaryDiagnoses, dx] });
    setSecInput("");
    secRef.current?.focus();
  };

  const removeSecondary = (i: number) => {
    onChange({ secondaryDiagnoses: data.secondaryDiagnoses.filter((_, idx) => idx !== i) });
  };

  const addAllergy = () => {
    const a = parseAllergy(allergyInput);
    if (!a.allergen) return;
    onChange({ allergies: [...data.allergies, a] });
    setAllergyInput("");
    allergyRef.current?.focus();
  };

  const removeAllergy = (i: number) => {
    onChange({ allergies: data.allergies.filter((_, idx) => idx !== i) });
  };

  const severityColor: Record<AllergySeverity, string> = {
    MILD: "bg-[#FFFBEB] border-[#FCD34D] text-[#92400E]",
    MODERATE: "bg-[#FFF7ED] border-[#FED7AA] text-[#9A3412]",
    SEVERE: "bg-[#FEF2F2] border-[#FCA5A5] text-[#991B1B]",
    LIFE_THREATENING: "bg-[#FEF2F2] border-[#F87171] text-[#7F1D1D]",
  };

  return (
    <div className="space-y-5">
      {/* Primary diagnosis */}
      <div className="space-y-1.5">
        <Label text="Primary Diagnosis (ICD-10)" required />
        <div className="relative">
          <input
            className={`${inputCls} pr-10 focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]`}
            value={primaryInput}
            onChange={(e) => setPrimaryInput(e.target.value)}
            onBlur={commitPrimary}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitPrimary();
              }
            }}
            placeholder="C34.90 — Malignant neoplasm of lung, unspecified"
          />
          <svg
            className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#64748B]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <title>Search</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
        <p className="text-[11px] text-[#64748B]">Search by ICD-10 code or description</p>
        {data.primaryDiagnosis && (
          <div className="flex items-center gap-1.5 mt-1">
            <span className="inline-flex items-center gap-1.5 h-[26px] px-2.5 bg-[#EFF6FF] border border-[#BFDBFE] text-[12px] text-[#1D4ED8] rounded">
              <span className="font-mono font-semibold">{data.primaryDiagnosis.icd10Code}</span>
              <span>{data.primaryDiagnosis.description}</span>
            </span>
            <label className="flex items-center gap-1.5 text-[12px] text-[#64748B] ml-2 cursor-pointer">
              <input
                type="checkbox"
                checked={data.primaryDiagnosis.isTerminal}
                onChange={(e) => {
                  if (data.primaryDiagnosis)
                    onChange({
                      primaryDiagnosis: { ...data.primaryDiagnosis, isTerminal: e.target.checked },
                    });
                }}
                className="rounded border-[#D1D5DB] text-[#2563EB] focus:ring-[#2563EB]"
              />
              Terminal (42 CFR §418.22)
            </label>
          </div>
        )}
      </div>

      {/* Secondary diagnoses */}
      <div className="space-y-1.5">
        <Label text="Secondary Diagnoses" />
        {data.secondaryDiagnoses.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {data.secondaryDiagnoses.map((dx, i) => (
              <span
                key={`${dx.icd10Code}-${i}`}
                className="inline-flex items-center gap-1.5 h-[26px] px-2.5 bg-[#F1F5F9] text-[12px] text-[#374151] rounded"
              >
                <span className="font-mono font-medium text-[#2563EB]">{dx.icd10Code}</span>
                <span>{dx.description}</span>
                <button
                  type="button"
                  onClick={() => removeSecondary(i)}
                  className="ml-0.5 text-[#94A3B8] hover:text-[#DC2626]"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <title>Remove</title>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            ref={secRef}
            className={`${inputCls} flex-1`}
            value={secInput}
            onChange={(e) => setSecInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSecondary();
              }
            }}
            placeholder="Search to add another diagnosis…"
          />
          {secInput && (
            <button
              type="button"
              onClick={addSecondary}
              className="h-10 px-3 text-[13px] font-medium text-[#2563EB] border border-[#BFDBFE] bg-[#EFF6FF] rounded-md hover:bg-[#DBEAFE]"
            >
              Add
            </button>
          )}
        </div>
      </div>

      {/* Allergies */}
      <div className="space-y-1.5">
        <Label text="Allergies" />
        {data.allergies.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {data.allergies.map((a, i) => (
              <div
                key={`${a.allergen}-${i}`}
                className={`inline-flex items-center gap-2 h-[34px] px-3 border rounded-md text-[12px] font-medium mr-2 ${severityColor[a.severity]}`}
              >
                <svg
                  className="w-3.5 h-3.5 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <title>Alert</title>
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                  />
                </svg>
                <span>
                  {a.allergen}
                  {a.reaction ? ` — ${a.reaction}` : ""} ({a.severity})
                </span>
                <button
                  type="button"
                  onClick={() => removeAllergy(i)}
                  className="ml-0.5 opacity-60 hover:opacity-100"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <title>Remove</title>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            ref={allergyRef}
            className={`${inputCls} flex-1`}
            value={allergyInput}
            onChange={(e) => setAllergyInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addAllergy();
              }
            }}
            placeholder="Add allergy… e.g. Penicillin — Anaphylaxis (SEVERE)"
          />
          {allergyInput && (
            <button
              type="button"
              onClick={addAllergy}
              className="h-10 px-3 text-[13px] font-medium text-[#991B1B] border border-[#FCA5A5] bg-[#FEF2F2] rounded-md hover:bg-[#FEE2E2]"
            >
              Add
            </button>
          )}
        </div>
      </div>

      {/* Care model */}
      <div className="space-y-1.5">
        <Label text="Care Model" required />
        <div className="flex gap-3">
          {(["HOSPICE", "PALLIATIVE", "CCM"] as CareModel[]).map((model) => (
            <button
              key={model}
              type="button"
              onClick={() => onChange({ careModel: model })}
              className={`flex-1 h-[46px] text-[13px] font-semibold rounded-lg border-2 transition-colors ${
                data.careModel === model
                  ? "bg-[#EFF6FF] border-[#2563EB] text-[#1D4ED8]"
                  : "bg-white border-[#D1D5DB] text-[#374151] hover:bg-[#F8FAFC]"
              }`}
            >
              {model}
            </button>
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
}: { data: PhysicianData; onChange: (d: Partial<PhysicianData>) => void }) {
  return (
    <div className="space-y-4">
      <Field label="Attending Physician" required>
        <input
          className={inputCls}
          value={data.attendingName}
          onChange={(e) => onChange({ attendingName: e.target.value })}
          placeholder="Dr. Jane Smith"
        />
      </Field>

      <Field label="Certifying Physician" required>
        <input
          className={inputCls}
          value={data.certifyingName}
          onChange={(e) => onChange({ certifyingName: e.target.value })}
          placeholder="Dr. John Williams"
        />
      </Field>

      <div className="h-px bg-[#F1F5F9]" />
      <SectionDivider label="Face-to-Face (F2F) Encounter" />

      <div className="p-3 bg-[#FFFBEB] border border-[#FCD34D] rounded-md">
        <p className="text-[12px] text-[#92400E]">
          Required from benefit period 3 onwards. Must be within 30 calendar days before
          recertification (42 CFR §418.22).
        </p>
      </div>

      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={data.f2fCompleted}
          onChange={(e) => onChange({ f2fCompleted: e.target.checked })}
          className="w-4 h-4 rounded border-[#D1D5DB] text-[#2563EB] focus:ring-[#2563EB]"
        />
        <span className="text-[13px] text-[#374151]">F2F encounter completed</span>
      </label>

      {data.f2fCompleted && (
        <Field label="F2F Date">
          <input
            type="date"
            className={inputCls}
            value={data.f2fDate}
            onChange={(e) => onChange({ f2fDate: e.target.value })}
          />
        </Field>
      )}
    </div>
  );
}

// ── Step 4: Election ──────────────────────────────────────────────────────────

function ElectionStep({
  data,
  onChange,
}: { data: ElectionData; onChange: (d: Partial<ElectionData>) => void }) {
  const noeDeadline = data.electionDate ? addBusinessDays(data.electionDate, 5) : null;

  return (
    <div className="space-y-4">
      <Field label="Election Date" required>
        <input
          type="date"
          className={inputCls}
          value={data.electionDate}
          onChange={(e) => onChange({ electionDate: e.target.value })}
        />
      </Field>

      {noeDeadline && (
        <div className="flex items-start gap-3 p-3.5 bg-[#FFFBEB] border border-[#FCD34D] rounded-md">
          <svg
            className="w-4 h-4 text-[#D97706] mt-0.5 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <title>NOE deadline</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
          <div>
            <p className="text-[13px] font-semibold text-[#92400E]">
              NOE Filing Deadline: <span className="font-mono">{fmtDate(noeDeadline)}</span>
            </p>
            <p className="text-[11px] text-[#A16207] mt-0.5">
              5 business days from election date (excludes weekends &amp; federal holidays). Late
              filing may reduce reimbursement.
            </p>
          </div>
        </div>
      )}

      <Field label="Benefit Period Start" required>
        <input
          type="date"
          className={inputCls}
          value={data.benefitPeriodStart}
          onChange={(e) => onChange({ benefitPeriodStart: e.target.value })}
        />
      </Field>

      <div className="p-3 bg-[#EFF6FF] border border-[#BFDBFE] rounded-md">
        <p className="text-[12px] text-[#1D4ED8]">
          <span className="font-semibold">Benefit periods:</span> 90 days / 90 days / 60 days
          thereafter. Recertification required at the start of each new period.
        </p>
      </div>
    </div>
  );
}

// ── Step 5: Care Team ─────────────────────────────────────────────────────────

const DISCIPLINE_META: Record<CareTeamDiscipline, { label: string; color: string }> = {
  PHYSICIAN: { label: "Physician", color: "text-[#1D4ED8]" },
  RN: { label: "Registered Nurse", color: "text-[#0D9488]" },
  SW: { label: "Social Worker", color: "text-[#7C3AED]" },
  CHAPLAIN: { label: "Chaplain", color: "text-[#7C3AED]" },
  AIDE: { label: "Hospice Aide", color: "text-[#64748B]" },
  VOLUNTEER: { label: "Volunteer", color: "text-[#64748B]" },
  BEREAVEMENT: { label: "Bereavement", color: "text-[#64748B]" },
  THERAPIST: { label: "Therapist", color: "text-[#0D9488]" },
};

function CareTeamStep({
  data,
  onChange,
}: {
  data: { members: CareTeamEntry[] };
  onChange: (members: CareTeamEntry[]) => void;
}) {
  const updateMember = (i: number, patch: Partial<CareTeamEntry>) => {
    onChange(data.members.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  };
  const removeMember = (i: number) => onChange(data.members.filter((_, idx) => idx !== i));
  const addMember = () =>
    onChange([...data.members, { name: "", discipline: "RN", role: "", phone: "" }]);

  return (
    <div className="space-y-3">
      {data.members.map((m, i) => {
        const meta = DISCIPLINE_META[m.discipline] ?? {
          label: m.discipline,
          color: "text-[#374151]",
        };
        return (
          <div
            key={`${m.discipline}-${i}`}
            className="border border-[#E2E8F0] rounded-md p-4 bg-white space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className={`text-[11px] font-semibold uppercase tracking-wide ${meta.color}`}>
                {meta.label}
              </span>
              {data.members.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeMember(i)}
                  className="text-[#94A3B8] hover:text-[#DC2626]"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <title>Remove</title>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Full Name">
                <input
                  className={inputCls}
                  value={m.name}
                  onChange={(e) => updateMember(i, { name: e.target.value })}
                  placeholder="Jane Smith, RN"
                />
              </Field>
              <Field label="Discipline">
                <select
                  className={selectCls}
                  value={m.discipline}
                  onChange={(e) =>
                    updateMember(i, { discipline: e.target.value as CareTeamDiscipline })
                  }
                >
                  {Object.entries(DISCIPLINE_META).map(([val, dm]) => (
                    <option key={val} value={val}>
                      {dm.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Role / Title">
                <input
                  className={inputCls}
                  value={m.role}
                  onChange={(e) => updateMember(i, { role: e.target.value })}
                  placeholder="Primary RN"
                />
              </Field>
              <Field label="Phone">
                <input
                  type="tel"
                  className={inputCls}
                  value={m.phone}
                  onChange={(e) => updateMember(i, { phone: e.target.value })}
                  placeholder="(555) 123-4567"
                />
              </Field>
            </div>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addMember}
        className="flex items-center gap-2 h-[38px] px-4 text-[13px] font-medium text-[#2563EB] border border-[#BFDBFE] bg-[#EFF6FF] rounded-md hover:bg-[#DBEAFE] w-full justify-center"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <title>Add</title>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14M5 12h14" />
        </svg>
        Add Team Member
      </button>
    </div>
  );
}

// ── Icon helpers ──────────────────────────────────────────────────────────────

function ArrowLeftIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <title>Back</title>
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      className="w-3.5 h-3.5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <title>Continue</title>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}
