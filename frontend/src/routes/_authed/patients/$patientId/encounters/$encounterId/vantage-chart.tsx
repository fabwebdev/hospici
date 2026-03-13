// routes/_authed/patients/$patientId/encounters/$encounterId/vantage-chart.tsx
// VantageChart™ — 9-step structured visit documentation
//
// Layout: two-panel split — left 60% step input, right 40% live narrative preview
// Steps: patient-status → pain-assessment → symptom-review → interventions →
//        psychosocial → care-plan → safety → plan-changes → review

import {
  enhanceWithLLMFn,
  finalizeNoteFn,
  getEncounterFn,
  getPatientContextFn,
  previewNarrativeFn,
} from "@/functions/vantage-chart.functions.js";
import { patientKeys } from "@/lib/query/keys.js";
import type { RouterContext } from "@/routes/__root.js";
import type {
  ContextAlert,
  EnhanceNarrativeResponse,
  GenerateNarrativeResponse,
  PatientContextResponse,
  TraceabilityEntry,
  VantageChartInput,
  VantageChartStep,
} from "@hospici/shared-types";
import { VANTAGE_CHART_STEPS } from "@hospici/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

// ── Route definition ──────────────────────────────────────────────────────────

export const Route = createFileRoute(
  "/_authed/patients/$patientId/encounters/$encounterId/vantage-chart",
)({
  loader: async ({
    context: { queryClient },
    params: { patientId, encounterId },
  }: { context: RouterContext; params: { patientId: string; encounterId: string } }) => {
    await Promise.all([
      queryClient.ensureQueryData({
        queryKey: ["encounter", encounterId],
        queryFn: () => getEncounterFn({ data: { patientId, encounterId } }),
      }),
      queryClient.ensureQueryData({
        queryKey: ["vantage-context", patientId, encounterId],
        queryFn: () => getPatientContextFn({ data: { patientId, encounterId } }),
      }),
    ]);
  },
  component: VantageChartPage,
});

// ── Step labels ───────────────────────────────────────────────────────────────

const STEP_LABELS: Record<VantageChartStep, string> = {
  "patient-status": "Patient Status",
  "pain-assessment": "Pain Assessment",
  "symptom-review": "Symptom Review",
  interventions: "Interventions",
  psychosocial: "Psychosocial",
  "care-plan": "Care Plan",
  safety: "Safety",
  "plan-changes": "Plan Changes",
  review: "Review & Finalize",
};

// ── Main page component ───────────────────────────────────────────────────────

function VantageChartPage() {
  const params = Route.useParams() as { patientId: string; encounterId: string };
  const { patientId, encounterId } = params;
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: encounter } = useQuery({
    queryKey: ["encounter", encounterId],
    queryFn: () => getEncounterFn({ data: { patientId, encounterId } }),
  });

  const { data: context } = useQuery<PatientContextResponse>({
    queryKey: ["vantage-context", patientId, encounterId],
    queryFn: async () => {
      const result = await getPatientContextFn({ data: { patientId, encounterId } });
      return result as PatientContextResponse;
    },
  });

  const [currentStep, setCurrentStep] = useState<VantageChartStep>("patient-status");
  const [input, setInput] = useState<Partial<VantageChartInput>>({
    symptoms: [],
    interventions: [],
    planChanges: [],
    inputMethod: "touch",
    recordedAt: new Date().toISOString(),
  });

  // Preview state
  const [preview, setPreview] = useState<GenerateNarrativeResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [enhancedNote, setEnhancedNote] = useState<EnhanceNarrativeResponse | null>(null);
  const [showEnhanced, setShowEnhanced] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Debounced preview
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const generatePreview = useCallback(async () => {
    if (!isMinimalInputReady(input)) return;
    setPreviewLoading(true);
    try {
      const result = await previewNarrativeFn({
        data: { patientId, encounterId, input: input as VantageChartInput },
      });
      setPreview(result);
    } catch {
      // fail silently on preview — user can still navigate steps
    } finally {
      setPreviewLoading(false);
    }
  }, [input, patientId, encounterId]);

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(generatePreview, 500);
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [generatePreview]);

  // Apply context suggestions on mount
  useEffect(() => {
    if (context?.suggestions && Object.keys(context.suggestions).length > 0) {
      setInput((prev: Partial<VantageChartInput>) => {
        const merged: Record<string, unknown> = { ...prev };
        for (const [dotPath, value] of Object.entries(context.suggestions)) {
          setNestedValue(merged, dotPath, value);
        }
        return merged as Partial<VantageChartInput>;
      });
    }
  }, [context]);

  // Mutations
  const enhanceMutation = useMutation({
    mutationFn: () =>
      enhanceWithLLMFn({
        data: { patientId, encounterId, draft: preview?.draft ?? "" },
      }),
    onSuccess: (data) => {
      setEnhancedNote(data);
      setShowEnhanced(true);
    },
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      const draft = showEnhanced && enhancedNote ? enhancedNote.enhanced : (preview?.draft ?? "");
      const method = showEnhanced && enhancedNote ? "LLM" : "TEMPLATE";
      return finalizeNoteFn({
        data: {
          patientId,
          encounterId,
          draft,
          method,
          traceability: (preview?.traceability ?? []) as TraceabilityEntry[],
          inputData: input as VantageChartInput,
        },
      });
    },
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: patientKeys.detail(patientId) });
      setTimeout(() => navigate({ to: "/patients/$patientId", params: { patientId } }), 1500);
    },
  });

  const stepIdx = VANTAGE_CHART_STEPS.indexOf(currentStep);
  const isFirst = stepIdx === 0;
  const isReview = currentStep === "review";

  const goNext = () => {
    const next = VANTAGE_CHART_STEPS[stepIdx + 1];
    if (next) setCurrentStep(next);
  };
  const goPrev = () => {
    const prev = VANTAGE_CHART_STEPS[stepIdx - 1];
    if (prev) setCurrentStep(prev);
  };

  if (submitted) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="text-4xl mb-4">✓</div>
          <h2 className="text-xl font-semibold text-gray-800">Note finalized</h2>
          <p className="text-gray-500 mt-1">Returning to patient chart…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            to="/patients/$patientId"
            params={{ patientId }}
            className="text-gray-400 hover:text-gray-600 text-sm"
          >
            ← Back to patient
          </Link>
          <span className="text-gray-300">|</span>
          <h1 className="text-sm font-semibold text-gray-700">
            VantageChart™ — {encounter?.visitType?.replace("_", " ").toUpperCase() ?? "Visit"}
          </h1>
        </div>
        <div className="text-xs text-gray-400">Encounter {encounterId.slice(0, 8)}</div>
      </header>

      {/* Context alerts */}
      {context && context.alerts.length > 0 && <ContextAlertsBar alerts={context.alerts} />}

      {/* Step progress */}
      <StepProgressBar steps={VANTAGE_CHART_STEPS} current={currentStep} />

      {/* Main split panel */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: step input (60%) */}
        <div className="w-3/5 overflow-y-auto border-r border-gray-200 bg-white">
          <div className="p-6">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.18 }}
              >
                <StepContent
                  step={currentStep}
                  input={input}
                  onChange={setInput}
                  context={context ?? null}
                />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Navigation */}
          <div className="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-3 flex items-center justify-between">
            <button
              type="button"
              onClick={goPrev}
              disabled={isFirst}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50"
            >
              Previous
            </button>

            <span className="text-xs text-gray-400">
              {stepIdx + 1} / {VANTAGE_CHART_STEPS.length}
            </span>

            {isReview ? (
              <button
                type="button"
                onClick={() => finalizeMutation.mutate()}
                disabled={finalizeMutation.isPending || !preview}
                className="px-5 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
              >
                {finalizeMutation.isPending ? "Saving…" : "Finalize Note"}
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

        {/* Right: live narrative preview (40%) */}
        <div className="w-2/5 overflow-y-auto bg-gray-50 p-5">
          <NarrativePreviewPanel
            preview={preview}
            enhanced={enhancedNote}
            showEnhanced={showEnhanced}
            isLoading={previewLoading}
            isEnhancing={enhanceMutation.isPending}
            onEnhance={() => enhanceMutation.mutate()}
            onRevert={() => setShowEnhanced(false)}
            onToggleView={() => setShowEnhanced((v) => !v)}
            similarityWarning={preview?.similarityWarning ?? false}
          />
        </div>
      </div>
    </div>
  );
}

// ── Context alerts bar ────────────────────────────────────────────────────────

function ContextAlertsBar({ alerts }: { alerts: ContextAlert[] }) {
  const bgClass = alerts.some((a) => a.type === "warning" || a.type === "critical")
    ? "bg-amber-50 border-amber-200 text-amber-800"
    : "bg-blue-50 border-blue-200 text-blue-700";

  return (
    <div className={`border-b px-6 py-2 text-xs ${bgClass}`}>
      {alerts.map((a) => (
        <span key={`${a.type}-${a.message}`} className="mr-4">
          {a.type === "warning" ? "⚠" : a.type === "critical" ? "🔴" : "ℹ"} {a.message}
        </span>
      ))}
    </div>
  );
}

// ── Step progress bar ─────────────────────────────────────────────────────────

function StepProgressBar({
  steps,
  current,
}: {
  steps: VantageChartStep[];
  current: VantageChartStep;
}) {
  const currentIdx = steps.indexOf(current);
  return (
    <div className="bg-white border-b border-gray-100 px-6 py-2">
      <div className="flex items-center gap-1">
        {steps.map((step, i) => {
          const done = i < currentIdx;
          const active = step === current;
          return (
            <div key={step} className="flex items-center gap-1">
              <div
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  done
                    ? "bg-emerald-500"
                    : active
                      ? "bg-blue-500 ring-2 ring-blue-200"
                      : "bg-gray-200"
                }`}
              />
              {active && (
                <span className="text-xs font-medium text-blue-700 whitespace-nowrap">
                  {STEP_LABELS[step]}
                </span>
              )}
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

// ── Narrative preview panel ───────────────────────────────────────────────────

function NarrativePreviewPanel({
  preview,
  enhanced,
  showEnhanced,
  isLoading,
  isEnhancing,
  onEnhance,
  onRevert,
  onToggleView,
  similarityWarning,
}: {
  preview: GenerateNarrativeResponse | null;
  enhanced: EnhanceNarrativeResponse | null;
  showEnhanced: boolean;
  isLoading: boolean;
  isEnhancing: boolean;
  onEnhance: () => void;
  onRevert: () => void;
  onToggleView: () => void;
  similarityWarning: boolean;
}) {
  const displayText = showEnhanced && enhanced ? enhanced.enhanced : (preview?.draft ?? "");

  return (
    <div className="sticky top-0">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-700">Live Preview</h2>
          {preview && (
            <div className="flex items-center gap-3 mt-1">
              <CompletenessRing percent={preview.metadata.completenessPercent} />
              <span className="text-xs text-gray-400">{preview.metadata.wordCount} words</span>
              {showEnhanced && (
                <span className="text-xs text-purple-600 font-medium">AI Enhanced</span>
              )}
            </div>
          )}
        </div>
        {preview && (
          <div className="flex gap-2">
            {enhanced ? (
              <button
                type="button"
                onClick={onToggleView}
                className="text-xs px-3 py-1 border border-purple-300 rounded text-purple-700 hover:bg-purple-50"
              >
                {showEnhanced ? "View Original" : "View Enhanced"}
              </button>
            ) : (
              <button
                type="button"
                onClick={onEnhance}
                disabled={isEnhancing || !preview}
                className="text-xs px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50"
              >
                {isEnhancing ? "Enhancing…" : "Enhance with AI"}
              </button>
            )}
            {showEnhanced && (
              <button
                type="button"
                onClick={onRevert}
                className="text-xs px-2 py-1 text-gray-500 underline hover:text-gray-700"
              >
                Revert
              </button>
            )}
          </div>
        )}
      </div>

      {similarityWarning && (
        <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
          ⚠ Documentation is similar to the prior visit (&gt;90% match). Please review for clinical
          accuracy.
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 p-4 min-h-48">
        {isLoading ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <span className="animate-pulse">Generating preview…</span>
          </div>
        ) : displayText ? (
          <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed font-mono">
            {displayText}
          </div>
        ) : (
          <div className="text-gray-400 text-sm italic">
            Complete the steps on the left to see a live preview of your clinical note.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Completeness ring (SVG) ───────────────────────────────────────────────────

function CompletenessRing({ percent }: { percent: number }) {
  const r = 10;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;
  const color = percent >= 80 ? "#10b981" : percent >= 50 ? "#f59e0b" : "#e5e7eb";
  return (
    <svg width="28" height="28" viewBox="0 0 28 28">
      <title>Note completeness: {percent}%</title>
      <circle cx="14" cy="14" r={r} fill="none" stroke="#e5e7eb" strokeWidth="3" />
      <circle
        cx="14"
        cy="14"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 14 14)"
      />
      <text x="14" y="17" textAnchor="middle" fontSize="6" fill={color} fontWeight="600">
        {percent}%
      </text>
    </svg>
  );
}

// ── Step content router ───────────────────────────────────────────────────────

function StepContent({
  step,
  input,
  onChange,
  context,
}: {
  step: VantageChartStep;
  input: Partial<VantageChartInput>;
  onChange: (v: Partial<VantageChartInput>) => void;
  context: PatientContextResponse | null;
}) {
  switch (step) {
    case "patient-status":
      return <PatientStatusStep input={input} onChange={onChange} />;
    case "pain-assessment":
      return <PainAssessmentStep input={input} onChange={onChange} context={context} />;
    case "symptom-review":
      return <SymptomReviewStep input={input} onChange={onChange} />;
    case "interventions":
      return <InterventionsStep input={input} onChange={onChange} />;
    case "psychosocial":
      return <PsychosocialStep input={input} onChange={onChange} />;
    case "care-plan":
      return <CarePlanStep input={input} onChange={onChange} />;
    case "safety":
      return <SafetyStep input={input} onChange={onChange} />;
    case "plan-changes":
      return <PlanChangesStep input={input} onChange={onChange} />;
    case "review":
      return <ReviewStep input={input} onChange={onChange} />;
  }
}

// ── Step 1: Patient Status ────────────────────────────────────────────────────

function PatientStatusStep({
  input,
  onChange,
}: {
  input: Partial<VantageChartInput>;
  onChange: (v: Partial<VantageChartInput>) => void;
}) {
  const ps = input.patientStatus;

  const setCondition = (v: VantageChartInput["patientStatus"]["overallCondition"]) =>
    onChange({
      ...input,
      patientStatus: {
        ...ps,
        overallCondition: v,
        isAlertAndOriented: ps?.isAlertAndOriented ?? true,
      },
    });

  const conditions: VantageChartInput["patientStatus"]["overallCondition"][] = [
    "stable",
    "declining",
    "improving",
    "critical",
    "deceased",
  ];

  const orientationLevels: Array<VantageChartInput["patientStatus"]["orientationLevel"]> = [
    "x4",
    "x3",
    "x2",
    "x1",
    "x0",
  ];

  return (
    <div className="space-y-6">
      <StepHeader
        title="Patient Status"
        subtitle="Document the patient's overall condition at time of visit"
      />

      <div>
        <p className="block text-sm font-medium text-gray-700 mb-2">Overall Condition</p>
        <div className="flex flex-wrap gap-2">
          {conditions.map((c) => (
            <QuickActionButton
              key={c}
              label={c.charAt(0).toUpperCase() + c.slice(1)}
              active={ps?.overallCondition === c}
              onClick={() => setCondition(c)}
              danger={c === "critical" || c === "deceased"}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="block text-sm font-medium text-gray-700 mb-2">Alert & Oriented</p>
        <div className="flex gap-2">
          <QuickActionButton
            label="Yes — A&O"
            active={ps?.isAlertAndOriented === true}
            onClick={() =>
              onChange({
                ...input,
                patientStatus: {
                  ...ps,
                  overallCondition: ps?.overallCondition ?? "stable",
                  isAlertAndOriented: true,
                },
              })
            }
          />
          <QuickActionButton
            label="Not A&O"
            active={ps?.isAlertAndOriented === false}
            onClick={() =>
              onChange({
                ...input,
                patientStatus: {
                  ...ps,
                  overallCondition: ps?.overallCondition ?? "stable",
                  isAlertAndOriented: false,
                },
              })
            }
          />
        </div>
      </div>

      {ps?.isAlertAndOriented && (
        <div>
          <p className="block text-sm font-medium text-gray-700 mb-2">Orientation Level</p>
          <div className="flex gap-2">
            {orientationLevels.map((lvl) => (
              <QuickActionButton
                key={lvl}
                label={lvl?.toUpperCase() ?? ""}
                active={ps?.orientationLevel === lvl}
                onClick={() =>
                  onChange({
                    ...input,
                    patientStatus: {
                      ...ps,
                      overallCondition: ps?.overallCondition ?? "stable",
                      isAlertAndOriented: true,
                      orientationLevel: lvl,
                    },
                  })
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Step 2: Pain Assessment ───────────────────────────────────────────────────

function PainAssessmentStep({
  input,
  onChange,
  context,
}: {
  input: Partial<VantageChartInput>;
  onChange: (v: Partial<VantageChartInput>) => void;
  context: PatientContextResponse | null;
}) {
  const pa = input.painAssessment ?? { hasPain: false };

  return (
    <div className="space-y-6">
      <StepHeader title="Pain Assessment" subtitle="Rate and characterize patient pain" />

      {context?.trends?.painTrend === "worsening" && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
          ⚠ Pain trend worsening from prior visits. Consider IDG discussion.
        </div>
      )}

      <div>
        <p className="block text-sm font-medium text-gray-700 mb-2">Pain Present?</p>
        <div className="flex gap-2">
          <QuickActionButton
            label="No Pain"
            active={pa.hasPain === false}
            onClick={() => onChange({ ...input, painAssessment: { ...pa, hasPain: false } })}
          />
          <QuickActionButton
            label="Pain Present"
            active={pa.hasPain === true}
            onClick={() => onChange({ ...input, painAssessment: { ...pa, hasPain: true } })}
            danger
          />
        </div>
      </div>

      {pa.hasPain && (
        <>
          <div>
            <p className="block text-sm font-medium text-gray-700 mb-2">Pain Scale (0–10)</p>
            <VisualAnalogScale
              value={pa.painScale ?? 0}
              onChange={(v) => onChange({ ...input, painAssessment: { ...pa, painScale: v } })}
            />
          </div>

          <div>
            <label htmlFor="pain-location" className="block text-sm font-medium text-gray-700 mb-2">
              Pain Location
            </label>
            <input
              id="pain-location"
              type="text"
              value={pa.painLocation ?? ""}
              onChange={(e) =>
                onChange({
                  ...input,
                  painAssessment: { ...pa, painLocation: e.target.value },
                })
              }
              placeholder="e.g. lower back, abdomen"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <p className="block text-sm font-medium text-gray-700 mb-2">Pain Quality</p>
            <CheckboxGrid
              options={["sharp", "dull", "aching", "burning", "throbbing"]}
              selected={pa.painQuality ?? []}
              onChange={(v) =>
                onChange({
                  ...input,
                  painAssessment: {
                    ...pa,
                    painQuality: v as VantageChartInput["painAssessment"]["painQuality"],
                  },
                })
              }
            />
          </div>

          <div className="flex gap-4">
            <ToggleField
              label="Pain management effective?"
              value={pa.painManagementEffective}
              onChange={(v) =>
                onChange({
                  ...input,
                  painAssessment: { ...pa, painManagementEffective: v },
                })
              }
            />
            <ToggleField
              label="Breakthrough pain?"
              value={pa.breakthroughPain}
              onChange={(v) =>
                onChange({
                  ...input,
                  painAssessment: { ...pa, breakthroughPain: v },
                })
              }
            />
          </div>
        </>
      )}
    </div>
  );
}

// ── Step 3: Symptom Review ────────────────────────────────────────────────────

const SYMPTOM_OPTIONS: VantageChartInput["symptoms"][0]["symptom"][] = [
  "pain",
  "dyspnea",
  "fatigue",
  "nausea",
  "depression",
  "anxiety",
  "drowsiness",
  "appetite",
  "wellbeing",
];

function SymptomReviewStep({
  input,
  onChange,
}: {
  input: Partial<VantageChartInput>;
  onChange: (v: Partial<VantageChartInput>) => void;
}) {
  type SymptomEntry = VantageChartInput["symptoms"][number];
  const symptoms: SymptomEntry[] = input.symptoms ?? [];

  const toggleSymptom = (symptom: (typeof SYMPTOM_OPTIONS)[0]) => {
    const existing = symptoms.find((s: SymptomEntry) => s.symptom === symptom);
    if (existing) {
      onChange({ ...input, symptoms: symptoms.filter((s: SymptomEntry) => s.symptom !== symptom) });
    } else {
      onChange({
        ...input,
        symptoms: [
          ...symptoms,
          {
            symptom,
            severity: 5,
            isNew: false,
            isWorsening: false,
            interventionProvided: false,
          },
        ],
      });
    }
  };

  const updateSymptom = (idx: number, field: keyof (typeof symptoms)[0], value: unknown) => {
    const updated = symptoms.map((s: SymptomEntry, i: number) =>
      i === idx ? { ...s, [field]: value as SymptomEntry[keyof SymptomEntry] } : s,
    );
    onChange({ ...input, symptoms: updated as SymptomEntry[] });
  };

  return (
    <div className="space-y-6">
      <StepHeader title="Symptom Review" subtitle="Select and rate presenting symptoms" />

      <div>
        <p className="block text-sm font-medium text-gray-700 mb-2">Active Symptoms</p>
        <CheckboxGrid
          options={SYMPTOM_OPTIONS}
          selected={symptoms.map((s: SymptomEntry) => s.symptom)}
          onChange={(selected) => {
            const updated = selected.map((sym) => {
              const existing = symptoms.find((s: SymptomEntry) => s.symptom === sym);
              return (
                existing ?? {
                  symptom: sym as (typeof SYMPTOM_OPTIONS)[0],
                  severity: 5,
                  isNew: false,
                  isWorsening: false,
                  interventionProvided: false,
                }
              );
            });
            onChange({ ...input, symptoms: updated });
          }}
        />
      </div>

      {symptoms.map((s: SymptomEntry, i: number) => (
        <div key={s.symptom} className="border border-gray-200 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm text-gray-800 capitalize">{s.symptom}</span>
            <button
              type="button"
              onClick={() => toggleSymptom(s.symptom)}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Remove
            </button>
          </div>

          <div>
            <p className="text-xs text-gray-500 mb-1">Severity (0–10)</p>
            <VisualAnalogScale
              value={s.severity}
              onChange={(v) => updateSymptom(i, "severity", v)}
            />
          </div>

          <div className="flex gap-4">
            <ToggleField
              label="New?"
              value={s.isNew}
              onChange={(v) => updateSymptom(i, "isNew", v)}
            />
            <ToggleField
              label="Worsening?"
              value={s.isWorsening}
              onChange={(v) => updateSymptom(i, "isWorsening", v)}
            />
            <ToggleField
              label="Intervention provided?"
              value={s.interventionProvided}
              onChange={(v) => updateSymptom(i, "interventionProvided", v)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Step 4: Interventions ─────────────────────────────────────────────────────

const INTERVENTION_CATEGORIES: Array<{
  value: VantageChartInput["interventions"][0]["category"];
  label: string;
}> = [
  { value: "medication_admin", label: "Medication Administration" },
  { value: "wound_care", label: "Wound Care" },
  { value: "symptom_management", label: "Symptom Management" },
  { value: "psychosocial_support", label: "Psychosocial Support" },
  { value: "spiritual_care", label: "Spiritual Care" },
  { value: "caregiver_education", label: "Caregiver Education" },
  { value: "safety_assessment", label: "Safety Assessment" },
  { value: "equipment", label: "Equipment" },
];

function InterventionsStep({
  input,
  onChange,
}: {
  input: Partial<VantageChartInput>;
  onChange: (v: Partial<VantageChartInput>) => void;
}) {
  const interventions: VantageChartInput["interventions"] = input.interventions ?? [];

  const addIntervention = (category: VantageChartInput["interventions"][0]["category"]) => {
    onChange({
      ...input,
      interventions: [...interventions, { category, description: "", patientResponse: "positive" }],
    });
  };

  type InterventionEntry = VantageChartInput["interventions"][number];
  const updateIntervention = (idx: number, field: string, value: unknown) => {
    const updated = interventions.map((iv: InterventionEntry, i: number) =>
      i === idx ? { ...iv, [field]: value as InterventionEntry[keyof InterventionEntry] } : iv,
    );
    onChange({ ...input, interventions: updated as VantageChartInput["interventions"] });
  };

  const removeIntervention = (idx: number) => {
    onChange({
      ...input,
      interventions: interventions.filter((_: InterventionEntry, i: number) => i !== idx),
    });
  };

  return (
    <div className="space-y-6">
      <StepHeader
        title="Interventions Provided"
        subtitle="Document care interventions performed during this visit"
      />

      <div>
        <p className="block text-sm font-medium text-gray-700 mb-2">Add Intervention</p>
        <div className="flex flex-wrap gap-2">
          {INTERVENTION_CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => addIntervention(c.value)}
              className="text-xs px-3 py-1.5 border border-blue-300 text-blue-700 rounded-full hover:bg-blue-50"
            >
              + {c.label}
            </button>
          ))}
        </div>
      </div>

      {interventions.map((iv: InterventionEntry, i: number) => {
        const catLabel =
          INTERVENTION_CATEGORIES.find((c) => c.value === iv.category)?.label ?? iv.category;
        return (
          <div
            key={`${iv.category}-${iv.description}-${iv.patientResponse}`}
            className="border border-gray-200 rounded-lg p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-800">{catLabel}</span>
              <button
                type="button"
                onClick={() => removeIntervention(i)}
                className="text-xs text-red-500"
              >
                Remove
              </button>
            </div>
            <div>
              <label
                htmlFor={`intervention-desc-${i}`}
                className="text-xs text-gray-500 mb-1 block"
              >
                Description
              </label>
              <input
                id={`intervention-desc-${i}`}
                type="text"
                value={iv.description}
                onChange={(e) => updateIntervention(i, "description", e.target.value)}
                placeholder="Describe the intervention…"
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-1">Patient Response</p>
              <div className="flex gap-2">
                {(["positive", "neutral", "negative"] as const).map((r) => (
                  <QuickActionButton
                    key={r}
                    label={r.charAt(0).toUpperCase() + r.slice(1)}
                    active={iv.patientResponse === r}
                    onClick={() => updateIntervention(i, "patientResponse", r)}
                    danger={r === "negative"}
                  />
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Step 5: Psychosocial ──────────────────────────────────────────────────────

function PsychosocialStep({
  input,
  onChange,
}: {
  input: Partial<VantageChartInput>;
  onChange: (v: Partial<VantageChartInput>) => void;
}) {
  const ps = input.psychosocial ?? {
    caregiverCoping: "well",
    patientMood: "calm",
  };

  return (
    <div className="space-y-6">
      <StepHeader
        title="Psychosocial Assessment"
        subtitle="Assess caregiver coping and patient emotional status"
      />

      <div>
        <p className="block text-sm font-medium text-gray-700 mb-2">Caregiver Coping</p>
        <div className="flex gap-2 flex-wrap">
          {(["well", "adequate", "struggling", "crisis"] as const).map((c) => (
            <QuickActionButton
              key={c}
              label={c.charAt(0).toUpperCase() + c.slice(1)}
              active={ps.caregiverCoping === c}
              onClick={() => onChange({ ...input, psychosocial: { ...ps, caregiverCoping: c } })}
              danger={c === "crisis"}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="block text-sm font-medium text-gray-700 mb-2">Patient Mood</p>
        <div className="flex gap-2 flex-wrap">
          {(["calm", "anxious", "depressed", "agitated", "peaceful"] as const).map((m) => (
            <QuickActionButton
              key={m}
              label={m.charAt(0).toUpperCase() + m.slice(1)}
              active={ps.patientMood === m}
              onClick={() => onChange({ ...input, psychosocial: { ...ps, patientMood: m } })}
              danger={m === "agitated"}
            />
          ))}
        </div>
      </div>

      <ToggleField
        label="Spiritual concerns identified?"
        value={ps.spiritualConcerns}
        onChange={(v) => onChange({ ...input, psychosocial: { ...ps, spiritualConcerns: v } })}
      />
    </div>
  );
}

// ── Step 6: Care Plan ─────────────────────────────────────────────────────────

function CarePlanStep({
  input,
  onChange,
}: {
  input: Partial<VantageChartInput>;
  onChange: (v: Partial<VantageChartInput>) => void;
}) {
  const cp = input.carePlan ?? {
    frequenciesFollowed: true,
    medicationCompliance: "compliant",
  };

  return (
    <div className="space-y-6">
      <StepHeader
        title="Care Plan Adherence"
        subtitle="Document adherence to the interdisciplinary care plan"
      />

      <div>
        <p className="block text-sm font-medium text-gray-700 mb-2">
          Care plan frequencies being followed?
        </p>
        <div className="flex gap-2">
          <QuickActionButton
            label="Yes"
            active={cp.frequenciesFollowed === true}
            onClick={() => onChange({ ...input, carePlan: { ...cp, frequenciesFollowed: true } })}
          />
          <QuickActionButton
            label="No"
            active={cp.frequenciesFollowed === false}
            onClick={() => onChange({ ...input, carePlan: { ...cp, frequenciesFollowed: false } })}
            danger
          />
        </div>
      </div>

      <div>
        <p className="block text-sm font-medium text-gray-700 mb-2">Medication Compliance</p>
        <div className="flex gap-2">
          {(["compliant", "partial", "noncompliant"] as const).map((c) => (
            <QuickActionButton
              key={c}
              label={c.charAt(0).toUpperCase() + c.slice(1)}
              active={cp.medicationCompliance === c}
              onClick={() => onChange({ ...input, carePlan: { ...cp, medicationCompliance: c } })}
              danger={c === "noncompliant"}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Step 7: Safety ────────────────────────────────────────────────────────────

function SafetyStep({
  input,
  onChange,
}: {
  input: Partial<VantageChartInput>;
  onChange: (v: Partial<VantageChartInput>) => void;
}) {
  const s = input.safety ?? { fallRisk: "low" };

  return (
    <div className="space-y-6">
      <StepHeader
        title="Safety Assessment"
        subtitle="Assess fall risk and environmental concerns"
      />

      <div>
        <p className="block text-sm font-medium text-gray-700 mb-2">Fall Risk</p>
        <div className="flex gap-2">
          {(["low", "moderate", "high"] as const).map((r) => (
            <QuickActionButton
              key={r}
              label={r.charAt(0).toUpperCase() + r.slice(1)}
              active={s.fallRisk === r}
              onClick={() => onChange({ ...input, safety: { ...s, fallRisk: r } })}
              danger={r === "high"}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Step 8: Plan Changes ──────────────────────────────────────────────────────

function PlanChangesStep({
  input,
  onChange,
}: {
  input: Partial<VantageChartInput>;
  onChange: (v: Partial<VantageChartInput>) => void;
}) {
  type PlanChangeEntry = VantageChartInput["planChanges"][number];
  const changes: VantageChartInput["planChanges"] = input.planChanges ?? [];

  const addChange = () =>
    onChange({
      ...input,
      planChanges: [...changes, { type: "new_order", description: "", requiresPhysician: false }],
    });

  const updateChange = (idx: number, field: string, value: unknown) => {
    const updated = changes.map((c: PlanChangeEntry, i: number) =>
      i === idx ? { ...c, [field]: value as PlanChangeEntry[keyof PlanChangeEntry] } : c,
    );
    onChange({ ...input, planChanges: updated as VantageChartInput["planChanges"] });
  };

  const removeChange = (idx: number) =>
    onChange({
      ...input,
      planChanges: changes.filter((_: PlanChangeEntry, i: number) => i !== idx),
    });

  return (
    <div className="space-y-6">
      <StepHeader title="Plan Changes" subtitle="Document any care plan modifications needed" />

      <button
        type="button"
        onClick={addChange}
        className="text-sm text-blue-600 border border-blue-300 px-4 py-2 rounded-lg hover:bg-blue-50"
      >
        + Add Plan Change
      </button>

      {changes.length === 0 && (
        <p className="text-sm text-gray-400 italic">
          No plan changes — add if needed or proceed to review.
        </p>
      )}

      {changes.map((c: PlanChangeEntry, i: number) => (
        <div
          key={`${c.type}-${c.description}-${String(c.requiresPhysician)}`}
          className="border border-gray-200 rounded-lg p-4 space-y-3"
        >
          <div className="flex justify-between">
            <select
              value={c.type}
              onChange={(e) => updateChange(i, "type", e.target.value)}
              className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none"
            >
              <option value="new_order">New Order</option>
              <option value="discontinue">Discontinue</option>
              <option value="frequency_change">Frequency Change</option>
              <option value="medication_change">Medication Change</option>
            </select>
            <button type="button" onClick={() => removeChange(i)} className="text-xs text-red-500">
              Remove
            </button>
          </div>
          <input
            type="text"
            value={c.description}
            onChange={(e) => updateChange(i, "description", e.target.value)}
            placeholder="Describe the change…"
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <ToggleField
            label="Requires physician notification?"
            value={c.requiresPhysician}
            onChange={(v) => updateChange(i, "requiresPhysician", v)}
          />
        </div>
      ))}
    </div>
  );
}

// ── Step 9: Review ────────────────────────────────────────────────────────────

function ReviewStep({
  input,
  onChange,
}: {
  input: Partial<VantageChartInput>;
  onChange: (v: Partial<VantageChartInput>) => void;
}) {
  return (
    <div className="space-y-6">
      <StepHeader
        title="Review & Finalize"
        subtitle="Add any additional notes, then finalize the note on the right panel"
      />

      <div>
        <label htmlFor="additional-notes" className="block text-sm font-medium text-gray-700 mb-2">
          Additional Notes (optional, max 1000 characters)
        </label>
        <textarea
          id="additional-notes"
          value={input.additionalNotes ?? ""}
          onChange={(e) =>
            onChange({
              ...input,
              additionalNotes: e.target.value.slice(0, 1000),
              recordedAt: new Date().toISOString(),
            })
          }
          rows={5}
          placeholder="Any additional clinical observations…"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="text-xs text-gray-400 mt-1 text-right">
          {(input.additionalNotes ?? "").length} / 1000
        </div>
      </div>

      <div className="p-4 bg-blue-50 rounded-lg text-sm text-blue-700">
        Review the live preview on the right. When satisfied, click "Finalize Note" to accept and
        complete this encounter. Optionally use "Enhance with AI" for prose polish — the original is
        always preserved.
      </div>
    </div>
  );
}

// ── Primitive components ──────────────────────────────────────────────────────

function StepHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-2">
      <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
      <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
    </div>
  );
}

function QuickActionButton({
  label,
  active,
  onClick,
  danger = false,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  danger?: boolean;
}) {
  const base = "px-3 py-1.5 text-sm rounded-lg border font-medium transition-colors";
  const activeClass = danger
    ? "bg-red-600 text-white border-red-600"
    : "bg-blue-600 text-white border-blue-600";
  const inactiveClass = danger
    ? "bg-white text-red-600 border-red-300 hover:bg-red-50"
    : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${base} ${active ? activeClass : inactiveClass}`}
    >
      {label}
    </button>
  );
}

function VisualAnalogScale({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const color =
    value >= 7 ? "accent-red-500" : value >= 4 ? "accent-amber-500" : "accent-green-500";

  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`flex-1 h-2 rounded-lg cursor-pointer ${color}`}
      />
      <span
        className={`text-lg font-bold w-8 text-center ${
          value >= 7 ? "text-red-600" : value >= 4 ? "text-amber-600" : "text-green-600"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function CheckboxGrid({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (opt: string) => {
    if (selected.includes(opt)) {
      onChange(selected.filter((s) => s !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      {options.map((opt) => (
        <label key={opt} className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
          <input
            type="checkbox"
            checked={selected.includes(opt)}
            onChange={() => toggle(opt)}
            className="w-4 h-4 accent-blue-600"
          />
          <span className="capitalize">{opt}</span>
        </label>
      ))}
    </div>
  );
}

function ToggleField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | undefined;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={value ?? false}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <div
        className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${
          value ? "bg-blue-600" : "bg-gray-300"
        }`}
      >
        <div
          className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${
            value ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </div>
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function isMinimalInputReady(input: Partial<VantageChartInput>): boolean {
  return !!(input.visitType && input.patientStatus?.overallCondition !== undefined);
}

function setNestedValue(obj: Record<string, unknown>, dotPath: string, value: unknown): void {
  const keys = dotPath.split(".");
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!key) break;
    if (current[key] === undefined || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  const lastKey = keys[keys.length - 1];
  if (lastKey) current[lastKey] = value;
}
