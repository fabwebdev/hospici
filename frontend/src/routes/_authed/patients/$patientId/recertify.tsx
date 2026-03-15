// routes/_authed/patients/$patientId/recertify.tsx
// Recertification Wizard — §5B.4
// 3-step stepper: Clinical Summary → F2F Documentation (period 3+) → Physician Certification
//
// CMS rules enforced:
//   - Period 3+: F2F required within 30 days prior to recert date (42 CFR §418.22)
//   - Cannot complete recertification without valid F2F if f2fRequired === true
//   - Physician must electronically attest the recertification

import { getBenefitPeriodFn, recertifyFn } from "@/functions/benefit-period.functions.js";
import { createF2FFn } from "@/functions/f2f.functions.js";
import type {
  BenefitPeriodDetail,
  CreateF2FInput,
  F2FEncounterResponse,
  F2FEncounterSetting,
  F2FProviderRole,
  F2FValidityResult,
} from "@hospici/shared-types";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

// ── Route ────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_authed/patients/$patientId/recertify")({
  validateSearch: (search: Record<string, unknown>) => ({
    periodId: typeof search.periodId === "string" ? search.periodId : undefined,
  }),
  component: RecertificationWizard,
});

// ── Constants ─────────────────────────────────────────────────────────────────

const STEPS = [
  { number: 1, label: "Clinical Summary" },
  { number: 2, label: "F2F Documentation" },
  { number: 3, label: "Physician Certification" },
] as const;

const F2F_SETTINGS: { key: F2FEncounterSetting; label: string }[] = [
  { key: "home", label: "Home Visit" },
  { key: "office", label: "Office Visit" },
  { key: "telehealth", label: "Telehealth" },
  { key: "snf", label: "Skilled Nursing Facility" },
  { key: "hospital", label: "Hospital" },
];

const F2F_ROLES: { key: F2FProviderRole; label: string }[] = [
  { key: "physician", label: "Physician (MD/DO)" },
  { key: "np", label: "Nurse Practitioner (NP)" },
  { key: "pa", label: "Physician Assistant (PA)" },
];

const TODAY = new Date().toISOString().slice(0, 10);

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"] as const;
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? "th");
}

// ── Stepper header ────────────────────────────────────────────────────────────

function StepperHeader({
  current,
  skipF2F,
}: {
  current: number;
  skipF2F: boolean;
}) {
  const steps = skipF2F ? [STEPS[0], STEPS[2]] : [...STEPS];
  return (
    <div className="flex items-center gap-0 mb-8">
      {steps.map((step, idx) => {
        const isActive = step.number === current;
        const isDone = step.number < current;
        return (
          <div key={step.number} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                  isDone
                    ? "bg-green-500 text-white"
                    : isActive
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-500"
                }`}
              >
                {isDone ? "✓" : step.number}
              </div>
              <span
                className={`text-sm whitespace-nowrap ${isActive ? "font-semibold text-gray-900" : "text-gray-400"}`}
              >
                {step.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div className="w-8 h-px bg-gray-200 mx-3 shrink-0" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Step 1: Clinical Summary ───────────────────────────────────────────────────

function Step1ClinicalSummary({
  period,
  narrative,
  onChange,
  onNext,
}: {
  period: BenefitPeriodDetail;
  narrative: string;
  onChange: (v: string) => void;
  onNext: () => void;
}) {
  const canProceed = narrative.trim().length >= 50;

  return (
    <div className="flex flex-col gap-5">
      {/* Period context */}
      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 flex items-start gap-3">
        <span className="text-blue-500 shrink-0 mt-0.5 text-sm">ℹ</span>
        <div>
          <p className="text-sm font-semibold text-blue-900">
            {ordinal(period.periodNumber)} Benefit Period Recertification
          </p>
          <p className="text-xs text-blue-700 mt-0.5">
            Period ends <strong>{formatDate(period.endDate)}</strong>
            {period.recertDueDate && (
              <> · Recertification due by <strong>{formatDate(period.recertDueDate)}</strong></>
            )}
            {period.f2fRequired && (
              <> · <span className="font-semibold text-amber-700">F2F required (period {period.periodNumber}+)</span></>
            )}
          </p>
        </div>
      </div>

      {/* Narrative */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Clinical Eligibility Narrative
          <span className="text-red-500 ml-0.5">*</span>
        </label>
        <p className="text-xs text-gray-500 mb-2">
          Document continued hospice eligibility: 6-month prognosis rationale, functional decline trajectory,
          current diagnoses and progression. Minimum 50 characters.
        </p>
        <textarea
          value={narrative}
          onChange={(e) => onChange(e.target.value)}
          rows={8}
          placeholder={
            "Example: Patient continues to meet hospice eligibility criteria. " +
            "Diagnosis of CHF stage IV with progressive functional decline — " +
            "ECOG status 3, dependent for ADLs. Weight loss of 8% over past 60 days. " +
            "6-month prognosis supported by continued decline in functional status…"
          }
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 resize-y font-mono leading-relaxed"
        />
        <p
          className={`text-xs mt-1 ${narrative.trim().length < 50 ? "text-amber-600" : "text-green-600"}`}
        >
          {narrative.trim().length} characters
          {narrative.trim().length < 50 && ` — ${50 - narrative.trim().length} more needed`}
        </p>
      </div>

      <div className="pt-2 flex justify-end">
        <button
          type="button"
          onClick={onNext}
          disabled={!canProceed}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-semibold rounded-md"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

// ── Step 2: F2F Documentation ─────────────────────────────────────────────────

function Step2F2FDocumentation({
  period,
  patientId,
  onF2FValid,
  onBack,
  onNext,
}: {
  period: BenefitPeriodDetail;
  patientId: string;
  onF2FValid: (result: F2FEncounterResponse & { validity: F2FValidityResult }) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [form, setForm] = useState<CreateF2FInput>({
    benefitPeriodId: period.id,
    f2fDate: "",
    f2fProviderRole: "physician",
    encounterSetting: "home",
    clinicalFindings: "",
    f2fProviderNpi: "",
  });
  const [validityResult, setValidityResult] = useState<F2FValidityResult | null>(null);
  const [alreadyValid] = useState(
    period.f2fStatus === "documented",
  );

  const createMutation = useMutation<
    F2FEncounterResponse & { validity: F2FValidityResult },
    Error,
    void
  >({
    mutationFn: () => createF2FFn({ data: { patientId, body: form } }),
    onSuccess: (result) => {
      setValidityResult(result.validity);
      onF2FValid(result);
    },
  });

  const canSubmit =
    form.f2fDate.length > 0 &&
    form.clinicalFindings.trim().length >= 20;

  // Date constraints: within the F2F window
  const minDate = period.f2fWindowStart ?? undefined;
  const maxDate = period.f2fWindowEnd ?? TODAY;

  if (alreadyValid) {
    return (
      <div className="flex flex-col gap-5">
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-4 flex items-start gap-3">
          <span className="text-green-500 text-lg shrink-0">✓</span>
          <div>
            <p className="text-sm font-semibold text-green-900">F2F Already Documented</p>
            <p className="text-xs text-green-700 mt-0.5">
              A valid face-to-face encounter is on record for this benefit period
              (documented {formatDate(period.f2fDocumentedAt)}). You may proceed to physician certification.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onBack}
            className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-md"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={onNext}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-md"
          >
            Continue →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {/* CMS rule banner */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-3">
        <span className="text-amber-500 shrink-0 mt-0.5">⚠</span>
        <div>
          <p className="text-sm font-semibold text-amber-900">
            Face-to-Face Required — 42 CFR §418.22
          </p>
          <p className="text-xs text-amber-800 mt-0.5">
            Period {period.periodNumber} recertification requires a face-to-face encounter
            within <strong>30 calendar days prior</strong> to the recert date.
            {period.f2fWindowStart && period.f2fWindowEnd && (
              <>
                {" "}Valid window:{" "}
                <strong>
                  {formatDate(period.f2fWindowStart)} – {formatDate(period.f2fWindowEnd)}
                </strong>
              </>
            )}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
        {/* F2F date */}
        <div className="px-4 py-3 flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700 w-44 shrink-0">
            F2F Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={form.f2fDate}
            min={minDate}
            max={maxDate}
            onChange={(e) => setForm((f) => ({ ...f, f2fDate: e.target.value }))}
            className="border border-gray-200 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400"
          />
          {form.f2fDate && (minDate ? form.f2fDate < minDate : false) && (
            <p className="text-xs text-red-600">Outside 30-day window (too early)</p>
          )}
        </div>

        {/* Encounter setting */}
        <div className="px-4 py-3 flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700 w-44 shrink-0">
            Encounter Setting <span className="text-red-500">*</span>
          </label>
          <select
            value={form.encounterSetting}
            onChange={(e) =>
              setForm((f) => ({ ...f, encounterSetting: e.target.value as F2FEncounterSetting }))
            }
            className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400 bg-white"
          >
            {F2F_SETTINGS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {/* Provider role */}
        <div className="px-4 py-3 flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700 w-44 shrink-0">
            Provider Role <span className="text-red-500">*</span>
          </label>
          <select
            value={form.f2fProviderRole}
            onChange={(e) =>
              setForm((f) => ({ ...f, f2fProviderRole: e.target.value as F2FProviderRole }))
            }
            className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400 bg-white"
          >
            {F2F_ROLES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {/* Provider NPI (optional) */}
        <div className="px-4 py-3 flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700 w-44 shrink-0">Provider NPI</label>
          <input
            type="text"
            value={form.f2fProviderNpi ?? ""}
            onChange={(e) => setForm((f) => ({ ...f, f2fProviderNpi: e.target.value || undefined }))}
            placeholder="10-digit NPI (optional)"
            className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400"
          />
        </div>

        {/* Clinical findings */}
        <div className="px-4 py-3 flex items-start gap-4">
          <label className="text-sm font-medium text-gray-700 w-44 shrink-0 mt-1.5">
            Clinical Findings <span className="text-red-500">*</span>
            <p className="text-[11px] text-gray-400 font-normal mt-0.5">Min. 20 characters</p>
          </label>
          <div className="flex-1">
            <textarea
              value={form.clinicalFindings}
              onChange={(e) => setForm((f) => ({ ...f, clinicalFindings: e.target.value }))}
              rows={4}
              placeholder="Clinical findings supporting continued hospice eligibility, 6-month prognosis, functional status assessment…"
              className="w-full border border-gray-200 rounded px-3 py-2 text-sm outline-none focus:border-blue-400 resize-y"
            />
            <p
              className={`text-[11px] mt-0.5 ${form.clinicalFindings.trim().length < 20 ? "text-amber-600" : "text-green-600"}`}
            >
              {form.clinicalFindings.trim().length} / 20 minimum characters
            </p>
          </div>
        </div>
      </div>

      {/* Validity result */}
      {validityResult && (
        <div
          className={`rounded-lg border px-4 py-3 flex items-start gap-3 ${
            validityResult.isValid
              ? "border-green-200 bg-green-50"
              : "border-red-200 bg-red-50"
          }`}
        >
          <span className={`shrink-0 mt-0.5 ${validityResult.isValid ? "text-green-500" : "text-red-500"}`}>
            {validityResult.isValid ? "✓" : "✗"}
          </span>
          <div>
            <p
              className={`text-sm font-semibold ${validityResult.isValid ? "text-green-900" : "text-red-900"}`}
            >
              {validityResult.isValid
                ? "F2F Valid for Recertification"
                : "F2F Not Valid for Recertification"}
            </p>
            {!validityResult.isValid && validityResult.reasons.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {validityResult.reasons.map((r) => (
                  <li key={r} className="text-xs text-red-700">
                    • {r}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Mutation error */}
      {createMutation.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-2">
          <span className="text-red-500 shrink-0">⚠</span>
          <p className="text-sm text-red-700">{createMutation.error.message}</p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-md"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={() => createMutation.mutate()}
          disabled={!canSubmit || createMutation.isPending}
          className="px-6 py-2.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-sm font-semibold rounded-md flex items-center gap-2"
        >
          {createMutation.isPending && (
            <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          )}
          Document F2F Encounter
        </button>
        {validityResult?.isValid && (
          <button
            type="button"
            onClick={onNext}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-md"
          >
            Continue →
          </button>
        )}
      </div>
    </div>
  );
}

// ── Step 3: Physician Certification ───────────────────────────────────────────

function Step3PhysicianCertification({
  period,
  patientId,
  clinicalNarrative,
  onBack,
  onComplete,
}: {
  period: BenefitPeriodDetail;
  patientId: string;
  clinicalNarrative: string;
  onBack: () => void;
  onComplete: () => void;
}) {
  const [physicianId, setPhysicianId] = useState("");
  const [completedAt, setCompletedAt] = useState(TODAY);
  const [attestation, setAttestation] = useState(false);
  const [typedName, setTypedName] = useState("");

  const recertMutation = useMutation({
    mutationFn: () =>
      recertifyFn({
        data: {
          id: period.id,
          physicianId,
          completedAt,
          clinicalNarrative,
        },
      }),
    onSuccess: onComplete,
  });

  // CMS block: F2F required and not documented
  const f2fBlocked =
    period.f2fRequired &&
    period.f2fStatus !== "documented";

  const canCertify =
    !f2fBlocked &&
    physicianId.trim().length > 0 &&
    completedAt.length > 0 &&
    attestation &&
    typedName.trim().length > 0 &&
    !recertMutation.isPending;

  return (
    <div className="flex flex-col gap-5">
      {/* F2F block warning */}
      {f2fBlocked && (
        <div className="rounded-lg border-2 border-red-300 bg-red-50 px-4 py-4 flex items-start gap-3">
          <span className="text-red-500 text-lg shrink-0">⛔</span>
          <div>
            <p className="text-sm font-semibold text-red-900">
              Cannot Certify — Face-to-Face Encounter Required
            </p>
            <p className="text-xs text-red-800 mt-1">
              Period {period.periodNumber} recertification requires a valid face-to-face encounter
              within 30 days prior to the recertification date (42 CFR §418.22). Return to Step 2
              and document the F2F encounter before certifying.
            </p>
          </div>
        </div>
      )}

      {/* Period summary */}
      <div className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
        <div className="px-4 py-3 flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700 w-44 shrink-0">
            Period
          </label>
          <span className="text-sm text-gray-900 font-mono">
            {ordinal(period.periodNumber)} · {formatDate(period.startDate)} → {formatDate(period.endDate)}
          </span>
        </div>

        <div className="px-4 py-3 flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700 w-44 shrink-0">
            Certification Date <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            value={completedAt}
            max={TODAY}
            onChange={(e) => setCompletedAt(e.target.value)}
            className="border border-gray-200 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400"
          />
        </div>

        <div className="px-4 py-3 flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700 w-44 shrink-0">
            Physician ID <span className="text-red-500">*</span>
            <p className="text-[11px] text-gray-400 font-normal mt-0.5">UUID from provider directory</p>
          </label>
          <input
            type="text"
            value={physicianId}
            onChange={(e) => setPhysicianId(e.target.value)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            className="flex-1 border border-gray-200 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400 font-mono"
          />
        </div>
      </div>

      {/* Electronic attestation */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-5 py-4 flex flex-col gap-3">
        <p className="text-sm font-semibold text-gray-700">Electronic Certification Attestation</p>
        <p className="text-xs text-gray-600 leading-relaxed">
          I certify that this patient continues to meet hospice eligibility criteria under 42 CFR §418.22.
          The clinical narrative and F2F documentation (where required) accurately reflect my clinical
          assessment. I understand this electronic signature carries the same legal weight as a physical
          signature on a paper document.
        </p>
        <div>
          <label className="text-xs text-gray-600 block mb-1">
            Type your full name to sign:
          </label>
          <input
            type="text"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder="Full legal name"
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm outline-none focus:border-blue-400 font-mono"
          />
        </div>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={attestation}
            onChange={(e) => setAttestation(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 mt-0.5 shrink-0"
          />
          <span className="text-sm text-gray-700">
            I confirm the above attestation is accurate and I am electronically signing this
            recertification as the certifying physician / authorized clinician.
          </span>
        </label>
      </div>

      {/* Mutation error */}
      {recertMutation.error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-2">
          <span className="text-red-500 shrink-0">⚠</span>
          <p className="text-sm text-red-700">{recertMutation.error.message}</p>
        </div>
      )}

      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={onBack}
          disabled={recertMutation.isPending}
          className="px-4 py-2.5 text-sm text-gray-600 hover:text-gray-900 border border-gray-200 rounded-md disabled:opacity-50"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={() => recertMutation.mutate()}
          disabled={!canCertify}
          className="px-6 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-sm font-semibold rounded-md flex items-center gap-2"
        >
          {recertMutation.isPending && (
            <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />
          )}
          Complete Recertification
        </button>
      </div>
    </div>
  );
}

// ── Success Screen ────────────────────────────────────────────────────────────

function SuccessScreen({
  period,
  patientId,
}: {
  period: BenefitPeriodDetail;
  patientId: string;
}) {
  return (
    <div className="max-w-lg mx-auto mt-12 flex flex-col gap-4">
      <div className="rounded-xl border border-green-200 bg-green-50 p-6 flex flex-col items-center gap-3 text-center">
        <span className="text-4xl text-green-500">✓</span>
        <h2 className="text-lg font-semibold text-green-900">Recertification Complete</h2>
        <p className="text-sm text-green-700">
          {ordinal(period.periodNumber)} benefit period has been certified. A new{" "}
          {ordinal(period.periodNumber + 1)} period has been opened.
        </p>
      </div>

      <div className="flex gap-3 mt-2">
        <Link
          to="/patients/$patientId"
          params={{ patientId }}
          className="flex-1 text-center px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-md"
        >
          Back to Patient Overview
        </Link>
        <Link
          to="/compliance/recert-queue"
          className="flex-1 text-center px-4 py-2.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-semibold rounded-md"
        >
          Recert Queue
        </Link>
      </div>
    </div>
  );
}

// ── Main Wizard ────────────────────────────────────────────────────────────────

function RecertificationWizard() {
  const { patientId } = Route.useParams();
  const { periodId } = Route.useSearch();
  const navigate = useNavigate();

  const { data: period, isLoading, error } = useQuery<BenefitPeriodDetail>({
    queryKey: ["benefit-period", periodId],
    queryFn: () =>
      getBenefitPeriodFn({ data: { id: periodId as string } }) as Promise<BenefitPeriodDetail>,
    enabled: !!periodId,
  });

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [clinicalNarrative, setClinicalNarrative] = useState("");
  const [f2fResult, setF2FResult] = useState<
    (F2FEncounterResponse & { validity: F2FValidityResult }) | null
  >(null);
  const [done, setDone] = useState(false);

  if (!periodId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] gap-4">
        <p className="text-sm text-gray-500">No benefit period specified.</p>
        <Link
          to="/compliance/recert-queue"
          className="text-sm text-blue-600 hover:underline"
        >
          ← Go to Recertification Queue
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !period) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
        <p className="text-sm text-red-600">Failed to load benefit period.</p>
        <Link to="/compliance/recert-queue" className="text-sm text-blue-600 hover:underline">
          ← Back to Queue
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="px-8 py-6">
        <SuccessScreen period={period} patientId={patientId} />
      </div>
    );
  }

  // Period 1 and 2 skip F2F step
  const skipF2F = !period.f2fRequired;

  function handleStep1Next() {
    setStep(skipF2F ? 3 : 2);
  }

  function handleStep2Next() {
    setStep(3);
  }

  function handleStep3Back() {
    setStep(skipF2F ? 1 : 2);
  }

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
        <h1 className="text-base font-semibold text-gray-900">
          Recertification Wizard — {ordinal(period.periodNumber)} Period
        </h1>
      </div>

      <div className="flex-1 px-8 py-6 max-w-2xl">
        <StepperHeader current={step} skipF2F={skipF2F} />

        {step === 1 && (
          <Step1ClinicalSummary
            period={period}
            narrative={clinicalNarrative}
            onChange={setClinicalNarrative}
            onNext={handleStep1Next}
          />
        )}

        {step === 2 && !skipF2F && (
          <Step2F2FDocumentation
            period={period}
            patientId={patientId}
            onF2FValid={(result) => {
              setF2FResult(result);
            }}
            onBack={() => setStep(1)}
            onNext={handleStep2Next}
          />
        )}

        {step === 3 && (
          <Step3PhysicianCertification
            period={period}
            patientId={patientId}
            clinicalNarrative={clinicalNarrative}
            onBack={handleStep3Back}
            onComplete={() => setDone(true)}
          />
        )}
      </div>
    </div>
  );
}
