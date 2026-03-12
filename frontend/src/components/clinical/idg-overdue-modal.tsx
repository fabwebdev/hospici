// src/components/clinical/idg-overdue-modal.tsx
// CMS hard-block modal — 42 CFR §418.56 IDG 15-day requirement
//
// Rules (DESIGN §8.1):
//   - No close X button
//   - No click-outside dismiss
//   - No Escape key dismiss
//   - Single CTA: "Schedule IDG Meeting" only

import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";

interface IDGOverdueModalProps {
  open: boolean;
  patientId: string;
  daysSinceLastIDG: number | null;
  daysOverdue: number;
}

export function IDGOverdueModal({
  open,
  patientId,
  daysSinceLastIDG,
  daysOverdue,
}: IDGOverdueModalProps) {
  const navigate = useNavigate();

  if (!open) return null;

  const overdueMessage =
    daysSinceLastIDG === null
      ? "No IDG meeting has been documented for this patient."
      : `The last IDG meeting was ${daysSinceLastIDG} day${daysSinceLastIDG !== 1 ? "s" : ""} ago — ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue.`;

  return (
    // Overlay — pointer-events blocked, no click-through
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      // Prevent click-outside dismiss
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        // Prevent Escape key dismiss
        if (e.key === "Escape") e.preventDefault();
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="idg-overdue-title"
        aria-describedby="idg-overdue-description"
        className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-6"
      >
        {/* Header — no close X per DESIGN §8.1 */}
        <div className="flex items-start gap-3 mb-4">
          <div className="flex-shrink-0 rounded-full bg-red-50 p-2 mt-0.5">
            <AlertTriangle className="h-5 w-5 text-red-600" aria-hidden="true" />
          </div>
          <div>
            <h2 id="idg-overdue-title" className="text-lg font-semibold text-red-600">
              IDG Meeting Overdue
            </h2>
            <p id="idg-overdue-description" className="mt-1 text-sm text-gray-600 leading-relaxed">
              {overdueMessage}
            </p>
            <p className="mt-2 text-sm text-gray-600 leading-relaxed">
              Per <span className="font-medium">42 CFR §418.56</span>, the Interdisciplinary Group
              (IDG) must review each patient's plan of care at least every{" "}
              <span className="font-medium">15 days</span>. Care plan updates are blocked until a
              meeting is scheduled and documented.
            </p>
          </div>
        </div>

        {/* Single CTA — no dismiss option */}
        <button
          type="button"
          className="w-full rounded-md bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
          onClick={() =>
            navigate({ to: "/patients/$patientId/idg/schedule", params: { patientId } })
          }
        >
          Schedule IDG Meeting
        </button>
      </div>
    </div>
  );
}
