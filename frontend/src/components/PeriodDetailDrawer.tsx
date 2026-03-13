// components/PeriodDetailDrawer.tsx
// Full period detail panel with action buttons — T3-4

import {
  correctPeriodFn,
  recertifyFn,
  setReportingPeriodFn,
} from "@/functions/benefit-period.functions.js";
import type { BenefitPeriodDetail } from "@hospici/shared-types";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

// ── Detail row ────────────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-100 last:border-0 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900 font-medium text-right">{value ?? "—"}</span>
    </div>
  );
}

// ── Section heading ───────────────────────────────────────────────────────────

function SectionHeading({ title }: { title: string }) {
  return (
    <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-400 mt-4 mb-1">
      {title}
    </h3>
  );
}

// ── Action: Set Reporting ─────────────────────────────────────────────────────

function SetReportingButton({
  period,
  onSuccess,
}: {
  period: BenefitPeriodDetail;
  onSuccess: () => void;
}) {
  const mutation = useMutation({
    mutationFn: () => setReportingPeriodFn({ data: { id: period.id } }),
    onSuccess,
  });

  if (period.isReportingPeriod) {
    return <span className="text-xs text-green-700 font-medium px-2 py-1">Reporting Period</span>;
  }

  return (
    <button
      type="button"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      className="text-xs px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 text-gray-700 disabled:opacity-50"
    >
      {mutation.isPending ? "Setting..." : "Set as Reporting Period"}
    </button>
  );
}

// ── Action: Recertify ─────────────────────────────────────────────────────────

function RecertifyForm({
  period,
  onSuccess,
}: {
  period: BenefitPeriodDetail;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [physicianId, setPhysicianId] = useState("");
  const [completedAt, setCompletedAt] = useState(new Date().toISOString().slice(0, 10));

  const mutation = useMutation({
    mutationFn: () => recertifyFn({ data: { id: period.id, physicianId, completedAt } }),
    onSuccess: () => {
      setOpen(false);
      onSuccess();
    },
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700"
      >
        Record Recertification
      </button>
    );
  }

  return (
    <div className="border rounded p-3 space-y-2 bg-blue-50">
      <div className="text-xs font-medium text-blue-900">Record Recertification</div>
      <div>
        <label className="block text-xs text-gray-600 mb-0.5" htmlFor="drawer-physician-id">
          Physician ID
        </label>
        <input
          id="drawer-physician-id"
          type="text"
          value={physicianId}
          onChange={(e) => setPhysicianId(e.target.value)}
          className="w-full border rounded px-2 py-1.5 text-xs"
          placeholder="UUID"
        />
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-0.5" htmlFor="drawer-completed-at">
          Completion Date
        </label>
        <input
          id="drawer-completed-at"
          type="date"
          value={completedAt}
          onChange={(e) => setCompletedAt(e.target.value)}
          className="w-full border rounded px-2 py-1.5 text-xs"
        />
      </div>
      {mutation.isError && (
        <div className="text-xs text-red-600">
          {mutation.error instanceof Error ? mutation.error.message : "Failed"}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !physicianId}
          className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {mutation.isPending ? "Saving..." : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Action: Correct Period ────────────────────────────────────────────────────

function CorrectPeriodForm({
  period,
  onSuccess,
}: {
  period: BenefitPeriodDetail;
  onSuccess: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [field, setField] = useState("startDate");
  const [newValue, setNewValue] = useState("");
  const [reason, setReason] = useState("");

  const CORRECTABLE_FIELDS = ["startDate", "endDate", "recertDueDate", "noeId"];

  const mutation = useMutation({
    mutationFn: () => correctPeriodFn({ data: { id: period.id, field, newValue, reason } }),
    onSuccess: () => {
      setOpen(false);
      onSuccess();
    },
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs px-3 py-1.5 border border-amber-300 text-amber-700 rounded hover:bg-amber-50"
      >
        Correct Period
      </button>
    );
  }

  return (
    <div className="border border-amber-200 rounded p-3 space-y-2 bg-amber-50">
      <div className="text-xs font-medium text-amber-900">Correct Field</div>
      <div>
        <label className="block text-xs text-gray-600 mb-0.5" htmlFor="correct-field">
          Field
        </label>
        <select
          id="correct-field"
          value={field}
          onChange={(e) => setField(e.target.value)}
          className="w-full border rounded px-2 py-1.5 text-xs"
        >
          {CORRECTABLE_FIELDS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-0.5" htmlFor="correct-value">
          New Value
        </label>
        <input
          id="correct-value"
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          className="w-full border rounded px-2 py-1.5 text-xs"
          placeholder={field.includes("Date") ? "YYYY-MM-DD" : "value"}
        />
      </div>
      <div>
        <label className="block text-xs text-gray-600 mb-0.5" htmlFor="correct-reason">
          Reason
        </label>
        <input
          id="correct-reason"
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full border rounded px-2 py-1.5 text-xs"
          placeholder="Reason for correction"
        />
      </div>
      {mutation.isError && (
        <div className="text-xs text-red-600">
          {mutation.error instanceof Error ? mutation.error.message : "Failed"}
        </div>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !newValue || !reason}
          className="text-xs px-3 py-1.5 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
        >
          {mutation.isPending ? "Saving..." : "Apply Correction"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs px-3 py-1.5 border rounded hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface PeriodDetailDrawerProps {
  period: BenefitPeriodDetail;
  onClose: () => void;
  onMutationSuccess?: () => void;
}

// ── Main component ────────────────────────────────────────────────────────────

export function PeriodDetailDrawer({
  period,
  onClose,
  onMutationSuccess,
}: PeriodDetailDrawerProps) {
  const handleSuccess = () => {
    onMutationSuccess?.();
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] bg-white border-l border-gray-200 shadow-xl z-40 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
        <div>
          <h2 className="font-semibold text-gray-900">
            Period #{period.periodNumber} — {period.patient.name}
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {period.startDate} → {period.endDate} ({period.periodLengthDays}d)
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 text-xl px-2"
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {/* Status chips */}
        <div className="flex flex-wrap gap-2 mb-3">
          <span
            className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
              period.status === "current"
                ? "bg-green-100 text-green-800"
                : period.status === "at_risk" || period.status === "past_due"
                  ? "bg-red-100 text-red-800"
                  : period.status === "recert_due"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-gray-100 text-gray-600"
            }`}
          >
            {period.status.replace(/_/g, " ")}
          </span>
          {period.billingRisk && (
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
              Billing Risk
            </span>
          )}
          {period.isReportingPeriod && (
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
              Reporting Period
            </span>
          )}
          {period.isTransferDerived && (
            <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
              H→H Transfer
            </span>
          )}
        </div>

        {/* Period Details */}
        <SectionHeading title="Period Details" />
        <DetailRow label="Period #" value={period.periodNumber} />
        <DetailRow label="Start Date" value={period.startDate} />
        <DetailRow label="End Date" value={period.endDate} />
        <DetailRow label="Length (days)" value={period.periodLengthDays} />
        <DetailRow label="Admission Type" value={period.admissionType.replace(/_/g, " ")} />
        {period.noe && (
          <DetailRow label="NOE Status" value={period.noe.status.replace(/_/g, " ")} />
        )}

        {/* Recertification */}
        <SectionHeading title="Recertification" />
        <DetailRow label="Recert Due" value={period.recertDueDate} />
        <DetailRow label="Recert Status" value={period.recertStatus.replace(/_/g, " ")} />
        {period.recertCompletedAt && (
          <DetailRow
            label="Completed"
            value={new Date(period.recertCompletedAt).toLocaleDateString()}
          />
        )}

        {/* F2F */}
        {period.f2fRequired && (
          <>
            <SectionHeading title="Face-to-Face" />
            <DetailRow label="F2F Status" value={period.f2fStatus.replace(/_/g, " ")} />
            <DetailRow label="F2F Window Start" value={period.f2fWindowStart} />
            <DetailRow label="F2F Window End" value={period.f2fWindowEnd} />
            {period.f2fDocumentedAt && (
              <DetailRow label="F2F Documented" value={period.f2fDocumentedAt} />
            )}
          </>
        )}

        {/* Billing Risk */}
        {period.billingRisk && (
          <>
            <SectionHeading title="Billing Risk" />
            <DetailRow label="Risk Reason" value={period.billingRiskReason} />
          </>
        )}

        {/* Correction History */}
        {period.correctionHistory.length > 0 && (
          <>
            <SectionHeading title="Correction History" />
            <div className="space-y-2">
              {(
                period.correctionHistory as Array<{
                  correctedAt: string;
                  field: string;
                  oldValue: unknown;
                  newValue: unknown;
                  reason: string;
                }>
              ).map((entry, idx) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: correction history is append-only
                <div key={idx} className="text-xs bg-gray-50 rounded p-2">
                  <div className="font-medium text-gray-700">
                    {entry.field}: {String(entry.oldValue)} → {String(entry.newValue)}
                  </div>
                  <div className="text-gray-500 mt-0.5">{entry.reason}</div>
                  <div className="text-gray-400 mt-0.5">
                    {new Date(entry.correctedAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Actions */}
        <SectionHeading title="Actions" />
        <div className="flex flex-col gap-2 mt-2">
          <SetReportingButton period={period} onSuccess={handleSuccess} />
          {["recert_due", "at_risk", "current"].includes(period.status) &&
            period.recertStatus !== "completed" && (
              <RecertifyForm period={period} onSuccess={handleSuccess} />
            )}
          <CorrectPeriodForm period={period} onSuccess={handleSuccess} />
        </div>
      </div>
    </div>
  );
}
