// routes/_authed/patients/$patientId/care-team.tsx
// Patient Care Team tab — IDT member assignments per 42 CFR §418.56

import { getCareTeamFn } from "@/functions/care-team.functions.js";
import type { CareTeamDiscipline, CareTeamListResponse, CareTeamMemberResponse } from "@hospici/shared-types";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/patients/$patientId/care-team")({
  component: PatientCareTeamPage,
});

// ── Constants ──────────────────────────────────────────────────────────────────

const DISCIPLINE_META: Record<CareTeamDiscipline, { label: string; abbr: string; color: string; avatarBg: string; avatarText: string }> = {
  PHYSICIAN: { label: "Physician / Medical Director", abbr: "MD", color: "bg-emerald-500", avatarBg: "bg-emerald-100", avatarText: "text-emerald-700" },
  RN:        { label: "Registered Nurse (RN)",        abbr: "RN", color: "bg-blue-500",    avatarBg: "bg-blue-100",    avatarText: "text-blue-700"    },
  SW:        { label: "Social Worker (MSW)",           abbr: "SW", color: "bg-violet-600",  avatarBg: "bg-violet-100",  avatarText: "text-violet-700"  },
  CHAPLAIN:  { label: "Chaplain / Spiritual Care",    abbr: "CH", color: "bg-amber-500",   avatarBg: "bg-amber-100",   avatarText: "text-amber-700"   },
  AIDE:      { label: "Home Health Aide",              abbr: "HA", color: "bg-pink-500",    avatarBg: "bg-pink-100",    avatarText: "text-pink-700"    },
  VOLUNTEER: { label: "Volunteer Services",            abbr: "VO", color: "bg-gray-400",    avatarBg: "bg-gray-100",    avatarText: "text-gray-600"    },
  BEREAVEMENT: { label: "Bereavement Coordinator",    abbr: "BC", color: "bg-rose-500",    avatarBg: "bg-rose-100",    avatarText: "text-rose-700"    },
  THERAPIST: { label: "Therapist",                    abbr: "TH", color: "bg-teal-500",    avatarBg: "bg-teal-100",    avatarText: "text-teal-700"    },
};

const DISCIPLINE_ORDER: CareTeamDiscipline[] = [
  "PHYSICIAN", "RN", "SW", "CHAPLAIN", "AIDE", "VOLUNTEER", "BEREAVEMENT", "THERAPIST",
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(-2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

function MemberCard({ member }: { member: CareTeamMemberResponse }) {
  const meta = DISCIPLINE_META[member.discipline];

  return (
    <div className="flex bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-sm transition-shadow">
      {/* Discipline color stripe */}
      <div className={`w-1 shrink-0 ${meta.color}`} />

      <div className="flex items-center gap-3 flex-1 min-w-0 px-3 py-3">
        {/* Avatar */}
        <div className={`h-10 w-10 rounded-full ${meta.avatarBg} flex items-center justify-center shrink-0`}>
          <span className={`text-sm font-bold ${meta.avatarText}`}>{initials(member.name)}</span>
        </div>

        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-gray-900">{member.name}</span>
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
              {meta.label}
            </span>
            {member.isPrimaryContact && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-700">
                Primary
              </span>
            )}
            {member.isOnCall && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
                On-Call
              </span>
            )}
          </div>
          {member.role && (
            <p className="text-xs text-gray-500 mt-0.5 truncate">{member.role}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            {member.phone && (
              <a href={`tel:${member.phone}`} className="text-xs text-gray-600 hover:text-blue-600">
                📞 {member.phone}
              </a>
            )}
            {member.email && (
              <a href={`mailto:${member.email}`} className="text-xs text-gray-500 hover:text-blue-600 truncate">
                {member.email}
              </a>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-1.5 shrink-0">
          {member.email && (
            <a
              href={`mailto:${member.email}`}
              className={`px-2.5 py-1 rounded text-[10px] font-medium border ${meta.avatarBg} border-current ${meta.avatarText} hover:opacity-80`}
            >
              Message
            </a>
          )}
          {member.phone && (
            <a
              href={`tel:${member.phone}`}
              className="px-2.5 py-1 rounded text-[10px] font-medium border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              Call
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function OnCallPanel({ members }: { members: CareTeamMemberResponse[] }) {
  const onCall = members.filter((m) => m.isOnCall);
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between h-11 px-4 border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-900">On Call Tonight</span>
        <span className="text-green-500 text-sm">●</span>
      </div>
      <div className="px-4 py-3">
        {onCall.length === 0 ? (
          <p className="text-xs text-gray-400">No one currently on call.</p>
        ) : (
          onCall.map((m) => {
            const meta = DISCIPLINE_META[m.discipline];
            return (
              <div key={m.id} className="flex items-center gap-2.5">
                <div className={`h-8 w-8 rounded-full ${meta.avatarBg} flex items-center justify-center`}>
                  <span className={`text-xs font-bold ${meta.avatarText}`}>{initials(m.name)}</span>
                </div>
                <div>
                  <p className="text-xs font-semibold text-gray-900">{m.name}</p>
                  <p className="text-xs text-gray-500">{m.role || meta.label}</p>
                </div>
                {m.phone && (
                  <a href={`tel:${m.phone}`} className="ml-auto text-xs text-blue-600 hover:underline shrink-0">
                    📞 call
                  </a>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function VisitSummaryPanel({ members }: { members: CareTeamMemberResponse[] }) {
  const disciplines: CareTeamDiscipline[] = ["RN", "AIDE", "SW", "CHAPLAIN"];
  const present = disciplines.filter((d) => members.some((m) => m.discipline === d));
  if (present.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <div className="h-11 px-4 flex items-center border-b border-gray-100">
        <span className="text-sm font-semibold text-gray-900">Team Disciplines</span>
      </div>
      <div className="px-4 py-3 space-y-2">
        {present.map((d) => {
          const meta = DISCIPLINE_META[d];
          return (
            <div key={d} className="flex items-center gap-2">
              <span className="text-xs text-gray-500 w-12 shrink-0">{meta.abbr}</span>
              <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div className={`h-full w-full ${meta.color} opacity-60 rounded-full`} />
              </div>
              <span className="text-xs font-medium text-gray-700 w-8 text-right">
                {members.filter((m) => m.discipline === d).length}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function UnassignedPanel({ members }: { members: CareTeamMemberResponse[] }) {
  const assigned = new Set(members.map((m) => m.discipline));
  const missing = DISCIPLINE_ORDER.filter((d) => !assigned.has(d));
  if (missing.length === 0) return null;

  return (
    <div className="rounded-lg border border-dashed border-amber-200 bg-amber-50 px-4 py-3">
      <p className="text-xs font-semibold text-amber-700 mb-2">⚠ Unassigned Disciplines</p>
      <div className="flex flex-wrap gap-1.5">
        {missing.map((d) => (
          <span key={d} className="px-2 py-0.5 rounded-full text-[11px] text-amber-700 bg-amber-100 border border-amber-200">
            {DISCIPLINE_META[d].label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

function PatientCareTeamPage() {
  const { patientId } = Route.useParams();

  const { data, isLoading } = useQuery<CareTeamListResponse>({
    queryKey: ["care-team", patientId],
    queryFn: () => getCareTeamFn({ data: { patientId } }),
  });

  const members = data?.members ?? [];
  const sorted = DISCIPLINE_ORDER.flatMap((d) => members.filter((m) => m.discipline === d));

  return (
    <div className="flex gap-5 flex-1 min-h-0 px-8 py-5 overflow-y-auto">
      {/* Left panel */}
      <div className="flex-1 min-w-0 flex flex-col gap-4">
        {/* Page header */}
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-gray-900">Care Team</h2>
          <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
            {members.length} member{members.length !== 1 ? "s" : ""}
          </span>
          <div className="flex-1" />
          <button
            type="button"
            className="px-3.5 py-1.5 rounded-md border border-blue-500 text-blue-600 text-sm font-semibold hover:bg-blue-50"
            disabled
            title="Member management coming soon"
          >
            Manage Team
          </button>
        </div>

        {/* Member cards */}
        {isLoading ? (
          <div className="text-center py-12 text-gray-400 text-sm">Loading care team…</div>
        ) : members.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">No care team members assigned yet.</div>
        ) : (
          <div className="flex flex-col gap-2">
            {sorted.map((m) => <MemberCard key={m.id} member={m} />)}
          </div>
        )}

        {!isLoading && <UnassignedPanel members={members} />}
      </div>

      {/* Right sidebar */}
      <div className="w-72 shrink-0 flex flex-col gap-4">
        <OnCallPanel members={members} />
        <VisitSummaryPanel members={members} />

        {/* IDG placeholder */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="h-11 px-4 flex items-center justify-between border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">Next IDG Meeting</span>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs text-gray-500">Schedule via the Orders tab.</p>
          </div>
        </div>

        {/* CMS compliance note */}
        <div className="rounded-lg border border-gray-100 bg-slate-50 px-4 py-3">
          <p className="text-[11px] font-semibold text-slate-600 mb-1">42 CFR §418.56</p>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Each patient must have a designated IDT including a physician, RN, social worker, and spiritual care provider. IDG meetings required every 15 days.
          </p>
        </div>
      </div>
    </div>
  );
}
