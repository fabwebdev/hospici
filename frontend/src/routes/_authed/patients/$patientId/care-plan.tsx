// routes/_authed/patients/$patientId/care-plan.tsx
// Care Plan — multi-discipline tabs + SMART goals (§5.9)
// Left rail: discipline tabs (RN · SW · Chaplain · Therapy · Aide)
// Content: assessment narrative + SMART goals list per discipline
// Only the user's own discipline section is editable. Read-only for all others.
// Autosave with debounce; save indicator in section header.
// Physician review compliance banner if initial or ongoing review is overdue.

import { getCurrentSessionFn } from "@/functions/auth.functions.js";
import {
  createCarePlanFn,
  getCarePlanFn,
  patchCarePlanFn,
} from "@/functions/carePlan.functions.js";
import type { RouterContext } from "@/routes/__root.js";
import type {
  CarePlanResponse,
  DisciplineSection,
  DisciplineType,
  SmartGoal,
  SmartGoalStatus,
} from "@hospici/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/_authed/patients/$patientId/care-plan")({
  loader: ({
    context: { queryClient },
    params: { patientId },
  }: { context: RouterContext; params: { patientId: string } }) =>
    Promise.all([
      queryClient.ensureQueryData({
        queryKey: ["care-plan", patientId],
        queryFn: () => getCarePlanFn({ data: { patientId } }),
      }),
      queryClient.ensureQueryData({
        queryKey: ["current-session"],
        queryFn: () => getCurrentSessionFn(),
      }),
    ]),
  component: CarePlanPage,
});

// ── Constants ──────────────────────────────────────────────────────────────────

const DISCIPLINE_TABS: { key: DisciplineType; label: string }[] = [
  { key: "RN", label: "RN" },
  { key: "SW", label: "Social Work" },
  { key: "CHAPLAIN", label: "Chaplain" },
  { key: "THERAPY", label: "Therapy" },
  { key: "AIDE", label: "Aide" },
];

const GOAL_STATUS_BADGE: Record<SmartGoalStatus, { label: string; classes: string }> = {
  active: { label: "Active", classes: "bg-blue-100 text-blue-700" },
  met: { label: "Met", classes: "bg-green-100 text-green-700" },
  revised: { label: "Revised", classes: "bg-amber-100 text-amber-700" },
};

/** Map clinical role → owned DisciplineType */
function disciplineForRole(role: string): DisciplineType | null {
  switch (role) {
    case "rn":
    case "admin":
    case "supervisor":
      return "RN";
    case "social_worker":
      return "SW";
    case "chaplain":
      return "CHAPLAIN";
    case "therapist":
      return "THERAPY";
    case "aide":
      return "AIDE";
    case "volunteer":
      return "VOLUNTEER";
    case "bereavement":
      return "BEREAVEMENT";
    case "physician":
    case "medical_director":
      return "PHYSICIAN";
    default:
      return null;
  }
}

function blankGoal(): SmartGoal {
  return {
    id: crypto.randomUUID(),
    goal: "",
    specific: "",
    measurable: "",
    achievable: "",
    relevant: "",
    timeBound: "",
    targetDate: new Date().toISOString().slice(0, 10),
    status: "active",
  };
}

// ── PhysicianReviewBanner ──────────────────────────────────────────────────────

function PhysicianReviewBanner({
  plan,
}: { plan: CarePlanResponse }) {
  const pr = plan.physicianReview;
  if (!pr.isInitialReviewOverdue && !pr.isOngoingReviewOverdue) return null;

  const isInitial = pr.isInitialReviewOverdue && !pr.initialReviewCompletedAt;
  const deadlineLabel = isInitial
    ? `Initial review was due ${pr.initialReviewDeadline ?? "—"} (42 CFR §418.56(b))`
    : `Ongoing review is overdue — due ${pr.nextReviewDue ?? "—"}`;

  return (
    <div className="shrink-0 mx-6 mt-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3 flex items-start gap-3">
      <span className="text-red-500 mt-0.5 shrink-0">⚠</span>
      <div>
        <p className="text-sm font-semibold text-red-800">
          Physician Review Overdue
        </p>
        <p className="text-xs text-red-700 mt-0.5">{deadlineLabel}</p>
      </div>
    </div>
  );
}

// ── SmartGoalCard ──────────────────────────────────────────────────────────────

function SmartGoalCard({
  goal,
  editable,
  onChange,
  onRemove,
}: {
  goal: SmartGoal;
  editable: boolean;
  onChange: (updated: SmartGoal) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const badge = GOAL_STATUS_BADGE[goal.status];

  function field(
    label: string,
    key: keyof Pick<SmartGoal, "specific" | "measurable" | "achievable" | "relevant" | "timeBound">,
  ) {
    return (
      <div key={key}>
        <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-0.5">
          {label}
        </label>
        {editable ? (
          <input
            type="text"
            value={goal[key]}
            onChange={(e) => onChange({ ...goal, [key]: e.target.value })}
            className="w-full text-sm border border-gray-200 rounded px-2 py-1.5 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100"
          />
        ) : (
          <p className="text-sm text-gray-700">{goal[key] || <span className="text-gray-300">—</span>}</p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      {/* Goal header */}
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="shrink-0 mt-0.5 text-gray-400 hover:text-gray-600 text-xs w-4"
          aria-label={expanded ? "Collapse SMART breakdown" : "Expand SMART breakdown"}
        >
          {expanded ? "▾" : "▸"}
        </button>
        <div className="flex-1 min-w-0">
          {editable ? (
            <input
              type="text"
              placeholder="Goal statement…"
              value={goal.goal}
              onChange={(e) => onChange({ ...goal, goal: e.target.value })}
              className="w-full text-sm font-medium border-0 border-b border-gray-200 pb-1 outline-none focus:border-blue-400 bg-transparent"
            />
          ) : (
            <p className="text-sm font-medium text-gray-900">
              {goal.goal || <span className="text-gray-300 font-normal">No goal statement</span>}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Status badge / selector */}
          {editable ? (
            <select
              value={goal.status}
              onChange={(e) => onChange({ ...goal, status: e.target.value as SmartGoalStatus })}
              className="text-[11px] font-semibold border border-gray-200 rounded-full px-2 py-0.5 outline-none bg-white"
            >
              <option value="active">Active</option>
              <option value="met">Met</option>
              <option value="revised">Revised</option>
            </select>
          ) : (
            <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${badge.classes}`}>
              {badge.label}
            </span>
          )}
          {/* Target date */}
          {editable ? (
            <input
              type="date"
              value={goal.targetDate}
              onChange={(e) => onChange({ ...goal, targetDate: e.target.value })}
              className="text-xs border border-gray-200 rounded px-1.5 py-0.5 outline-none focus:border-blue-400 w-[120px]"
            />
          ) : (
            <span className="text-xs text-gray-400">
              {goal.targetDate
                ? new Date(goal.targetDate).toLocaleDateString("en-US", {
                    month: "2-digit",
                    day: "2-digit",
                    year: "2-digit",
                  })
                : "—"}
            </span>
          )}
          {editable && (
            <button
              type="button"
              onClick={onRemove}
              className="text-gray-300 hover:text-red-500 text-sm"
              aria-label="Remove goal"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* SMART breakdown (collapsible) */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-gray-100 pt-3 grid grid-cols-1 gap-3 bg-gray-50">
          {field("S — Specific", "specific")}
          {field("M — Measurable", "measurable")}
          {field("A — Achievable", "achievable")}
          {field("R — Relevant", "relevant")}
          {field("T — Time-Bound", "timeBound")}
        </div>
      )}
    </div>
  );
}

// ── DisciplineSectionPanel ─────────────────────────────────────────────────────

function DisciplineSectionPanel({
  discipline,
  section,
  editable,
  saveStatus,
  onNotesChange,
  onGoalsChange,
}: {
  discipline: DisciplineType;
  section: DisciplineSection | undefined;
  editable: boolean;
  saveStatus: "idle" | "saving" | "saved" | "error";
  onNotesChange: (notes: string) => void;
  onGoalsChange: (goals: SmartGoal[]) => void;
}) {
  const goals = section?.goals ?? [];
  const notes = section?.notes ?? "";

  function addGoal() {
    onGoalsChange([...goals, blankGoal()]);
  }

  function updateGoal(idx: number, updated: SmartGoal) {
    const next = [...goals];
    next[idx] = updated;
    onGoalsChange(next);
  }

  function removeGoal(idx: number) {
    onGoalsChange(goals.filter((_, i) => i !== idx));
  }

  const DISCIPLINE_LABELS: Record<DisciplineType, string> = {
    RN: "Registered Nurse",
    SW: "Social Work",
    CHAPLAIN: "Chaplain",
    THERAPY: "Therapy",
    AIDE: "Hospice Aide",
    VOLUNTEER: "Volunteer",
    BEREAVEMENT: "Bereavement",
    PHYSICIAN: "Physician",
  };

  const saveIndicator = {
    idle: null,
    saving: <span className="text-xs text-gray-400 animate-pulse">Saving…</span>,
    saved: <span className="text-xs text-green-600">Saved</span>,
    error: <span className="text-xs text-red-500">Save failed</span>,
  }[saveStatus];

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* Section header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{DISCIPLINE_LABELS[discipline]}</h2>
          {!editable && (
            <p className="text-xs text-gray-400 mt-0.5">Read-only for your role</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {saveIndicator}
          {section?.lastUpdatedAt && (
            <span className="text-xs text-gray-400">
              Updated{" "}
              {new Date(section.lastUpdatedAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
      </div>

      {/* Assessment narrative */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="px-4 h-10 flex items-center border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-900">Assessment Narrative</span>
        </div>
        <div className="p-3">
          {editable ? (
            <textarea
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
              placeholder="Document clinical assessment, patient/family goals, care priorities…"
              className="w-full min-h-[120px] text-sm border border-gray-200 rounded px-3 py-2 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-100 resize-y placeholder-gray-300"
            />
          ) : (
            <p className="text-sm text-gray-700 min-h-[60px] whitespace-pre-wrap">
              {notes || <span className="text-gray-300">No assessment narrative on file.</span>}
            </p>
          )}
        </div>
      </div>

      {/* SMART Goals */}
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden flex-1 flex flex-col">
        <div className="flex items-center justify-between px-4 h-10 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">SMART Goals</span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-gray-100 text-gray-600">
              {goals.length}
            </span>
          </div>
          {editable && (
            <button
              type="button"
              onClick={addGoal}
              className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800 px-2 py-1 rounded hover:bg-blue-50"
            >
              + Add Goal
            </button>
          )}
        </div>
        <div className="p-3 flex flex-col gap-2 overflow-y-auto flex-1">
          {goals.length === 0 ? (
            <p className="text-sm text-gray-300 text-center py-6">
              {editable ? "No goals yet. Click \"+ Add Goal\" to create one." : "No goals documented."}
            </p>
          ) : (
            goals.map((goal, idx) => (
              <SmartGoalCard
                key={goal.id}
                goal={goal}
                editable={editable}
                onChange={(updated) => updateGoal(idx, updated)}
                onRemove={() => removeGoal(idx)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

function CarePlanPage() {
  const { patientId } = Route.useParams();
  const queryClient = useQueryClient();

  const { data: plan, isLoading } = useQuery<CarePlanResponse | null>({
    queryKey: ["care-plan", patientId],
    queryFn: () => getCarePlanFn({ data: { patientId } }),
  });

  const { data: session } = useQuery({
    queryKey: ["current-session"],
    queryFn: () => getCurrentSessionFn(),
  });

  const userRole = session?.role ?? "";
  const ownedDiscipline = disciplineForRole(userRole);

  // Default active tab to user's own discipline (or RN)
  const defaultTab: DisciplineType =
    ownedDiscipline && DISCIPLINE_TABS.some((t) => t.key === ownedDiscipline)
      ? ownedDiscipline
      : "RN";

  const [activeTab, setActiveTab] = useState<DisciplineType>(defaultTab);

  // Local edits for the active discipline (keyed by discipline)
  const [localNotes, setLocalNotes] = useState<Partial<Record<DisciplineType, string>>>({});
  const [localGoals, setLocalGoals] = useState<Partial<Record<DisciplineType, SmartGoal[]>>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // Sync local state when plan data arrives for a new tab
  useEffect(() => {
    if (!plan) return;
    const section = plan.disciplineSections[activeTab];
    setLocalNotes((prev) => {
      if (prev[activeTab] !== undefined) return prev;
      return { ...prev, [activeTab]: section?.notes ?? "" };
    });
    setLocalGoals((prev) => {
      if (prev[activeTab] !== undefined) return prev;
      return { ...prev, [activeTab]: section?.goals ?? [] };
    });
  }, [plan, activeTab]);

  // ── Create plan if null ──────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: () => createCarePlanFn({ data: { patientId, input: {} } }),
    onSuccess: (data) => {
      queryClient.setQueryData(["care-plan", patientId], data);
    },
  });

  // ── Autosave (debounced) ─────────────────────────────────────────────────────

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const patchMutation = useMutation({
    mutationFn: (vars: { discipline: DisciplineType; notes: string; goals: SmartGoal[] }) =>
      patchCarePlanFn({
        data: { patientId, discipline: vars.discipline, input: { notes: vars.notes, goals: vars.goals } },
      }),
    onMutate: () => setSaveStatus("saving"),
    onSuccess: (data) => {
      queryClient.setQueryData(["care-plan", patientId], data);
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 2000);
    },
    onError: () => setSaveStatus("error"),
  });

  const scheduleSave = useCallback(
    (discipline: DisciplineType, notes: string, goals: SmartGoal[]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        patchMutation.mutate({ discipline, notes, goals });
      }, 1200);
    },
    [patchMutation],
  );

  function handleNotesChange(notes: string) {
    setLocalNotes((prev) => ({ ...prev, [activeTab]: notes }));
    const goals = localGoals[activeTab] ?? plan?.disciplineSections[activeTab]?.goals ?? [];
    scheduleSave(activeTab, notes, goals);
  }

  function handleGoalsChange(goals: SmartGoal[]) {
    setLocalGoals((prev) => ({ ...prev, [activeTab]: goals }));
    const notes = localNotes[activeTab] ?? plan?.disciplineSections[activeTab]?.notes ?? "";
    scheduleSave(activeTab, notes, goals);
  }

  // ── Derived section state ────────────────────────────────────────────────────

  const isEditable = ownedDiscipline === activeTab;

  const activeSection: DisciplineSection | undefined = plan
    ? {
        notes: localNotes[activeTab] ?? plan.disciplineSections[activeTab]?.notes ?? "",
        goals: localGoals[activeTab] ?? plan.disciplineSections[activeTab]?.goals ?? [],
        lastUpdatedBy:
          plan.disciplineSections[activeTab]?.lastUpdatedBy ?? "",
        lastUpdatedAt:
          plan.disciplineSections[activeTab]?.lastUpdatedAt ?? "",
      }
    : undefined;

  // ── Render ───────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <span className="text-sm text-gray-400">Loading care plan…</span>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-sm text-gray-500">No care plan on file for this patient.</p>
        <button
          type="button"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-md disabled:opacity-50"
        >
          {createMutation.isPending ? "Creating…" : "Create Care Plan"}
        </button>
        {createMutation.isError && (
          <p className="text-xs text-red-600">{String(createMutation.error)}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Physician review compliance banner */}
      <PhysicianReviewBanner plan={plan} />

      {/* Body: left rail + content */}
      <div className="flex flex-1 min-h-0 gap-0">
        {/* Left discipline rail */}
        <nav className="w-44 shrink-0 border-r border-gray-200 bg-gray-50 py-4 flex flex-col gap-1 px-2">
          {DISCIPLINE_TABS.map((tab) => {
            const isActive = tab.key === activeTab;
            const isOwned = tab.key === ownedDiscipline;
            const section = plan.disciplineSections[tab.key];
            const hasContent =
              (section?.notes?.trim().length ?? 0) > 0 || (section?.goals?.length ?? 0) > 0;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center justify-between w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-white shadow-sm text-gray-900 font-semibold border border-gray-200"
                    : "text-gray-600 hover:bg-white hover:text-gray-900"
                }`}
              >
                <span>{tab.label}</span>
                <span className="flex items-center gap-1">
                  {isOwned && (
                    <span
                      className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"
                      title="Your discipline"
                    />
                  )}
                  {hasContent && !isOwned && (
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-300 shrink-0" />
                  )}
                </span>
              </button>
            );
          })}

          {/* Version footer */}
          <div className="mt-auto px-3 pt-4">
            <p className="text-[11px] text-gray-400">Version {plan.version}</p>
            <p className="text-[11px] text-gray-400">
              Updated{" "}
              {new Date(plan.updatedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </p>
          </div>
        </nav>

        {/* Discipline content */}
        <div className="flex-1 min-w-0 overflow-y-auto p-6">
          <DisciplineSectionPanel
            discipline={activeTab}
            section={activeSection}
            editable={isEditable}
            saveStatus={isEditable ? saveStatus : "idle"}
            onNotesChange={handleNotesChange}
            onGoalsChange={handleGoalsChange}
          />
        </div>
      </div>
    </div>
  );
}
