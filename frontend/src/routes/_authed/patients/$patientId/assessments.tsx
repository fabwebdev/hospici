// routes/_authed/patients/$patientId/assessments.tsx
// Pain Assessments tab — NRS / FLACC / PAINAD / FACES / ESAS scales with form + history

import { createFileRoute } from "@tanstack/react-router";
import { Activity, Plus } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authed/patients/$patientId/assessments")({
  component: PainAssessmentsPage,
});

// ── Types ─────────────────────────────────────────────────────────────────────

type ScaleTab = "NRS" | "FLACC" | "PAINAD" | "FACES" | "ESAS";

interface AssessmentHistoryEntry {
  id: string;
  date: string;
  scale: ScaleTab;
  score: number;
  maxScore: number;
  clinician: string;
  summary: string;
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const MOCK_HISTORY: AssessmentHistoryEntry[] = [
  {
    id: "a1",
    date: "2026-03-14 09:15",
    scale: "NRS",
    score: 6,
    maxScore: 10,
    clinician: "Dr. Sarah Chen",
    summary: "Moderate pain in lower back, aggravated by movement. Morphine PRN administered.",
  },
  {
    id: "a2",
    date: "2026-03-13 14:30",
    scale: "FLACC",
    score: 4,
    maxScore: 10,
    clinician: "RN Maria Lopez",
    summary: "Occasional grimacing, restless legs. Repositioned with pillow support.",
  },
  {
    id: "a3",
    date: "2026-03-12 08:00",
    scale: "PAINAD",
    score: 7,
    maxScore: 10,
    clinician: "RN James Wright",
    summary: "Loud vocalizations, rigid body language. Fentanyl patch increased per MD order.",
  },
  {
    id: "a4",
    date: "2026-03-11 16:45",
    scale: "NRS",
    score: 3,
    maxScore: 10,
    clinician: "Dr. Sarah Chen",
    summary: "Mild discomfort at rest. Current regimen adequate. Continue monitoring.",
  },
];

const SCALE_TABS: ScaleTab[] = ["NRS", "FLACC", "PAINAD", "FACES", "ESAS"];

const SCALE_BADGE_CLASSES: Record<string, string> = {
  NRS: "bg-blue-100 text-blue-700",
  FLACC: "bg-green-100 text-green-700",
  PAINAD: "bg-orange-100 text-orange-700",
  FACES: "bg-purple-100 text-purple-700",
  ESAS: "bg-teal-100 text-teal-700",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function scoreColorClass(score: number): string {
  if (score <= 3) return "text-green-600";
  if (score <= 6) return "text-amber-500";
  return "text-red-600";
}

function scoreBgClass(score: number): string {
  if (score <= 3) return "bg-green-50";
  if (score <= 6) return "bg-amber-50";
  return "bg-red-50";
}

// ── NRS Form ──────────────────────────────────────────────────────────────────

function NrsForm() {
  const [score, setScore] = useState(6);
  const [painLocation, setPainLocation] = useState("");
  const [painCharacter, setPainCharacter] = useState("");
  const [aggravatingFactors, setAggravatingFactors] = useState("");
  const [relievingFactors, setRelievingFactors] = useState("");

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">Numeric Rating Scale (NRS)</h3>
      </div>

      <div className="px-5 py-5 space-y-6">
        {/* Score display */}
        <div className="flex items-center gap-6">
          <div
            className={`flex items-center justify-center w-20 h-20 rounded-xl ${scoreBgClass(score)}`}
          >
            <span className={`text-4xl font-mono font-bold ${scoreColorClass(score)}`}>
              {score}
            </span>
          </div>
          <div className="text-sm text-gray-500">
            <p className="font-medium text-gray-700">Score: {score} / 10</p>
            <p className="mt-0.5">
              {score <= 3 ? "Mild pain" : score <= 6 ? "Moderate pain" : "Severe pain"}
            </p>
          </div>
        </div>

        {/* Visual analog slider */}
        <div className="space-y-2">
          <div className="relative h-3 rounded-full overflow-hidden">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: "linear-gradient(to right, #22c55e, #eab308, #f97316, #ef4444)",
              }}
            />
          </div>
          <input
            type="range"
            min="0"
            max="10"
            value={score}
            onChange={(e) => setScore(Number(e.target.value))}
            className="w-full accent-blue-600"
            aria-label="Pain score from 0 to 10"
          />
          <div className="flex justify-between text-xs text-gray-400">
            <span>No pain</span>
            <span>Worst possible</span>
          </div>
        </div>

        {/* Pain Location + Character */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="pain-location" className="block text-xs font-medium text-gray-600 mb-1">
              Pain Location
            </label>
            <input
              id="pain-location"
              type="text"
              placeholder="e.g. Lower back, right hip"
              value={painLocation}
              onChange={(e) => setPainLocation(e.target.value)}
              className="w-full h-9 px-3 border border-gray-200 rounded-md text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div>
            <label
              htmlFor="pain-character"
              className="block text-xs font-medium text-gray-600 mb-1"
            >
              Pain Character
            </label>
            <input
              id="pain-character"
              type="text"
              placeholder="e.g. Sharp, dull, burning"
              value={painCharacter}
              onChange={(e) => setPainCharacter(e.target.value)}
              className="w-full h-9 px-3 border border-gray-200 rounded-md text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            />
          </div>
        </div>

        {/* Aggravating + Relieving Factors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="aggravating-factors"
              className="block text-xs font-medium text-gray-600 mb-1"
            >
              Aggravating Factors
            </label>
            <input
              id="aggravating-factors"
              type="text"
              placeholder="e.g. Movement, coughing"
              value={aggravatingFactors}
              onChange={(e) => setAggravatingFactors(e.target.value)}
              className="w-full h-9 px-3 border border-gray-200 rounded-md text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            />
          </div>
          <div>
            <label
              htmlFor="relieving-factors"
              className="block text-xs font-medium text-gray-600 mb-1"
            >
              Relieving Factors
            </label>
            <input
              id="relieving-factors"
              type="text"
              placeholder="e.g. Rest, ice, medication"
              value={relievingFactors}
              onChange={(e) => setRelievingFactors(e.target.value)}
              className="w-full h-9 px-3 border border-gray-200 rounded-md text-sm text-gray-700 placeholder-gray-400 outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"
            />
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="button"
            className="h-9 px-4 border border-gray-200 rounded-md text-sm text-gray-600 bg-white hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            className="h-9 px-4 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-semibold text-white"
          >
            Save Assessment
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Assessment History Table ──────────────────────────────────────────────────

function AssessmentHistoryTable({ entries }: { entries: AssessmentHistoryEntry[] }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between h-11 px-5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">Assessment History</span>
          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-700">
            {entries.length}
          </span>
        </div>
      </div>

      {/* Table header */}
      <div className="flex items-center px-5 h-9 bg-gray-50 border-b border-gray-200 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
        <div className="w-[140px] shrink-0">Date</div>
        <div className="w-[80px] shrink-0">Scale</div>
        <div className="w-[70px] shrink-0">Score</div>
        <div className="w-[140px] shrink-0">Clinician</div>
        <div className="flex-1 min-w-0">Summary</div>
      </div>

      {/* Rows */}
      {entries.map((entry) => (
        <div
          key={entry.id}
          className="flex items-center px-5 py-3 border-b border-gray-100 text-sm hover:bg-gray-50"
        >
          <div className="w-[140px] shrink-0 font-mono text-xs text-gray-600">{entry.date}</div>
          <div className="w-[80px] shrink-0">
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${SCALE_BADGE_CLASSES[entry.scale] ?? "bg-gray-100 text-gray-600"}`}
            >
              {entry.scale}
            </span>
          </div>
          <div className="w-[70px] shrink-0">
            <span className={`font-mono font-semibold ${scoreColorClass(entry.score)}`}>
              {entry.score}/{entry.maxScore}
            </span>
          </div>
          <div className="w-[140px] shrink-0 text-gray-600 text-xs truncate">{entry.clinician}</div>
          <div className="flex-1 min-w-0 text-gray-500 text-xs truncate">{entry.summary}</div>
        </div>
      ))}

      {entries.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-8">No assessments recorded yet.</p>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

function PainAssessmentsPage() {
  const { patientId: _patientId } = Route.useParams();
  const [activeScale, setActiveScale] = useState<ScaleTab>("NRS");

  return (
    <div className="px-8 py-5 space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Activity className="h-5 w-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Pain Assessments</h2>
        </div>
        <button
          type="button"
          className="flex items-center gap-1.5 h-9 px-3.5 bg-blue-600 hover:bg-blue-700 rounded-md text-sm font-semibold text-white"
        >
          <Plus className="h-4 w-4" />
          New Assessment
        </button>
      </div>

      {/* Scale tab bar */}
      <div className="flex items-center gap-1 border-b border-gray-200">
        {SCALE_TABS.map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveScale(tab)}
            className={
              activeScale === tab
                ? "px-4 h-10 text-sm font-semibold text-blue-600 border-b-2 border-blue-600 bg-white"
                : "px-4 h-10 text-sm text-gray-500 hover:text-gray-800"
            }
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Active scale form */}
      {activeScale === "NRS" && <NrsForm />}

      {activeScale !== "NRS" && (
        <div className="rounded-lg border border-gray-200 bg-white px-5 py-12 text-center">
          <p className="text-sm text-gray-400">{activeScale} assessment form coming soon.</p>
        </div>
      )}

      {/* Assessment history */}
      <AssessmentHistoryTable entries={MOCK_HISTORY} />
    </div>
  );
}
