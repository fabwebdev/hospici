// routes/_authed/filings/notr/new.tsx
// NOTR Create — Notice of Termination/Revocation
// Mirrors the NOE form structure (DESIGN_PROMPT §5.13: "NOTR filing form mirrors NOE form structure")
// CMS 42 CFR §418.24 — 5-business-day filing requirement from revocation date

import { createNOTRFn } from "@/functions/noe.functions.js";
import type { CreateNOTRInput, RevocationReason } from "@hospici/shared-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";

// ── Route ─────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/_authed/filings/notr/new")({
  validateSearch: (search: Record<string, unknown>) => ({
    patientId: typeof search.patientId === "string" ? search.patientId : "",
    patientName: typeof search.patientName === "string" ? search.patientName : "",
    medicareId: typeof search.medicareId === "string" ? search.medicareId : "",
  }),
  component: NOTRCreatePage,
});

// ── Business-day logic (shared with NOE) ──────────────────────────────────────

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

function countBusinessDaysRemaining(deadlineDate: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const deadline = new Date(`${deadlineDate}T00:00:00`);
  if (deadline <= today) return 0;
  let count = 0;
  const cursor = new Date(today);
  while (cursor < deadline) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    const iso = cursor.toISOString().split("T")[0] ?? "";
    if (day !== 0 && day !== 6 && !US_FEDERAL_HOLIDAYS_2026.includes(iso)) {
      count++;
    }
  }
  return count;
}

function formatDate(iso: string): string {
  if (!iso) return "--";
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Revocation reason options ──────────────────────────────────────────────────

const REVOCATION_REASON_LABELS: Record<RevocationReason, string> = {
  patient_revoked: "Patient Revoked Election",
  patient_transferred: "Transfer to Another Hospice",
  patient_deceased: "Patient Deceased",
  patient_no_longer_eligible: "No Longer Eligible for Hospice",
  other: "Other",
};

// ── Status stepper ─────────────────────────────────────────────────────────────

function StatusStepper({ step }: { step: "draft" | "submitted" | "accepted" }) {
  const steps = [
    { key: "draft", label: "Draft" },
    { key: "submitted", label: "Submitted" },
    { key: "accepted", label: "Accepted" },
  ] as const;

  const stepIndex = steps.findIndex((s) => s.key === step);

  return (
    <div className="flex items-center justify-center gap-0">
      {steps.map((s, i) => {
        const done = i < stepIndex;
        const active = i === stepIndex;
        return (
          <div key={s.key} className="flex items-center">
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center"
                style={{
                  background: done || active ? "#2563EB" : "transparent",
                  border: done || active ? "none" : "2px solid #E2E8F0",
                }}
              >
                {done ? (
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth={3} aria-hidden="true">
                    <title>done</title>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span
                    className="text-xs font-semibold"
                    style={{ color: active ? "#FFFFFF" : "#CBD5E1" }}
                  >
                    {i + 1}
                  </span>
                )}
              </div>
              <span
                className="text-xs font-semibold"
                style={{ color: active ? "#2563EB" : done ? "#2563EB" : "#64748B" }}
              >
                {s.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className="mx-4"
                style={{ width: 80, height: 2, background: i < stepIndex ? "#2563EB" : "#E2E8F0" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function NOTRCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { patientId, patientName, medicareId } = Route.useSearch();

  const [revocationDate, setRevocationDate] = useState("");
  const [revocationReason, setRevocationReason] = useState<RevocationReason>("patient_revoked");
  const [receivingHospiceName, setReceivingHospiceName] = useState("");
  const [receivingHospiceId, setReceivingHospiceId] = useState("");
  const [transferDate, setTransferDate] = useState("");

  const isTransfer = revocationReason === "patient_transferred";

  const deadlineDate = useMemo(
    () => (revocationDate ? addBusinessDays(revocationDate, 5) : ""),
    [revocationDate],
  );

  const daysRemaining = useMemo(
    () => (deadlineDate ? countBusinessDaysRemaining(deadlineDate) : null),
    [deadlineDate],
  );

  const createMutation = useMutation({
    mutationFn: async (opts: { submit: boolean }) => {
      if (!patientId) throw new Error("Patient ID is required");
      if (!revocationDate) throw new Error("Revocation date is required");

      const body: CreateNOTRInput = {
        revocationDate,
        revocationReason,
        ...(isTransfer && receivingHospiceName ? { receivingHospiceName } : {}),
        ...(isTransfer && receivingHospiceId ? { receivingHospiceId } : {}),
        ...(isTransfer && transferDate ? { transferDate } : {}),
      };
      const notr = await createNOTRFn({ data: { patientId, body } });

      if (opts.submit && notr.id) {
        const { submitNOTRFn } = await import("@/functions/noe.functions.js");
        return submitNOTRFn({ data: { notrId: notr.id } });
      }
      return notr;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["filings", "queue"] });
      void navigate({ to: "/filings" });
    },
  });

  const canSubmit = Boolean(patientId && revocationDate);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white">
      {/* Page header */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{ padding: "16px 32px", borderBottom: "1px solid #E2E8F0" }}
      >
        <div className="flex items-center gap-3">
          <svg
            style={{ color: "#DC2626", width: 20, height: 20 }}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <title>file-minus</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"
            />
            <polyline points="14 2 14 8 20 8" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
          <span
            className="font-semibold"
            style={{ fontFamily: "Space Grotesk, Inter, sans-serif", fontSize: 18, color: "#0F172A" }}
          >
            File Notice of Termination/Revocation (NOTR)
          </span>
        </div>
        <div
          className="text-xs font-semibold px-3 py-1 rounded"
          style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #F59E0B" }}
        >
          Draft
        </div>
      </div>

      {/* Status stepper */}
      <div
        className="flex items-center justify-center shrink-0"
        style={{ padding: "16px 32px", borderBottom: "1px solid #E2E8F0" }}
      >
        <StatusStepper step="draft" />
      </div>

      {/* Main content */}
      <div
        className="flex flex-col gap-5 flex-1 overflow-auto"
        style={{ background: "#F1F5F9", padding: "24px 32px" }}
      >
        {/* Deadline alert banner */}
        {revocationDate && deadlineDate && daysRemaining !== null && (
          <div
            className="flex items-center gap-3"
            style={{
              background: "#FEF3C7",
              border: "1px solid #F59E0B",
              borderRadius: 8,
              padding: "12px 16px",
            }}
          >
            <svg
              style={{ color: "#92400E", width: 18, height: 18, flexShrink: 0 }}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <title>alarm-clock</title>
              <circle cx="12" cy="13" r="8" />
              <path d="M5 3 2 6M22 6l-3-3M12 9v4l2 2" />
              <path d="m6.38 18.7 1.96-1.96M17.64 18.7l-1.96-1.96" />
            </svg>
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <span style={{ fontSize: 13, fontWeight: 600, color: "#92400E" }}>
                Filing Deadline: {formatDate(deadlineDate)}
              </span>
              <span style={{ fontSize: 12, color: "#92400E" }}>
                5 business days from revocation date ({formatDate(revocationDate)}).{" "}
                {daysRemaining} business day{daysRemaining !== 1 ? "s" : ""} remaining.
              </span>
            </div>
            <div
              className="flex items-center shrink-0"
              style={{
                background: "#FFFFFF",
                border: "1px solid #F59E0B",
                borderRadius: 6,
                padding: "6px 14px",
              }}
            >
              <span
                style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 14, fontWeight: 700, color: "#92400E" }}
              >
                {daysRemaining}d left
              </span>
            </div>
          </div>
        )}

        {/* Two-column form layout */}
        <div className="flex gap-5 items-start">
          {/* Left: form card */}
          <div
            className="flex-1 min-w-0 flex flex-col gap-4"
            style={{ background: "#FFFFFF", borderRadius: 8, border: "1px solid #E2E8F0", padding: 24 }}
          >
            <span
              style={{ fontFamily: "Space Grotesk, Inter, sans-serif", fontSize: 15, fontWeight: 600, color: "#0F172A" }}
            >
              Patient &amp; Revocation Details
            </span>

            {/* Row 1: Patient | Medicare ID */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Patient">
                <div
                  className="flex items-center h-10 px-3 text-sm"
                  style={{ background: "#F8FAFC", borderRadius: 6, border: "1px solid #D1D5DB", color: "#0F172A" }}
                >
                  {patientName || patientId || "No patient selected"}
                </div>
              </Field>
              <Field label="Medicare ID">
                <div
                  className="flex items-center h-10 px-3"
                  style={{
                    fontFamily: "JetBrains Mono, monospace",
                    fontSize: 13,
                    background: "#F8FAFC",
                    borderRadius: 6,
                    border: "1px solid #D1D5DB",
                    color: "#0F172A",
                  }}
                >
                  {medicareId || "--"}
                </div>
              </Field>
            </div>

            {/* Row 2: Revocation Date | Revocation Reason */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="Revocation Date" required>
                <div className="flex flex-col gap-1">
                  <div className="relative">
                    <input
                      type="date"
                      value={revocationDate}
                      onChange={(e) => setRevocationDate(e.target.value)}
                      style={{
                        fontFamily: revocationDate ? "JetBrains Mono, monospace" : undefined,
                        fontWeight: revocationDate ? 500 : undefined,
                        fontSize: 13,
                        height: 40,
                        borderRadius: 6,
                        border: revocationDate ? "2px solid #2563EB" : "1px solid #D1D5DB",
                        padding: "0 36px 0 12px",
                        width: "100%",
                        outline: "none",
                      }}
                    />
                    <svg
                      className="absolute right-3 top-3 pointer-events-none"
                      style={{ color: "#2563EB", width: 16, height: 16 }}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <title>calendar</title>
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <span style={{ fontSize: 11, color: "#64748B" }}>
                    Deadline auto-calculates to 5 business days from this date
                  </span>
                </div>
              </Field>
              <Field label="Revocation Reason" required>
                <div className="relative">
                  <select
                    value={revocationReason}
                    onChange={(e) => setRevocationReason(e.target.value as RevocationReason)}
                    style={{
                      fontSize: 13,
                      height: 40,
                      borderRadius: 6,
                      border: "1px solid #D1D5DB",
                      padding: "0 36px 0 12px",
                      width: "100%",
                      outline: "none",
                      appearance: "none",
                      background: "#FFFFFF",
                      color: "#0F172A",
                    }}
                    className="focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {(Object.entries(REVOCATION_REASON_LABELS) as [RevocationReason, string][]).map(
                      ([val, label]) => (
                        <option key={val} value={val}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                  <svg
                    className="absolute right-3 top-3 pointer-events-none"
                    style={{ color: "#64748B", width: 16, height: 16 }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <title>chevron-down</title>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </div>
              </Field>
            </div>

            {/* Transfer fields — only shown when reason = patient_transferred */}
            {isTransfer && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Receiving Hospice Name">
                    <input
                      type="text"
                      value={receivingHospiceName}
                      onChange={(e) => setReceivingHospiceName(e.target.value)}
                      placeholder="Receiving agency name"
                      style={{
                        fontSize: 13,
                        height: 40,
                        borderRadius: 6,
                        border: "1px solid #D1D5DB",
                        padding: "0 12px",
                        width: "100%",
                        outline: "none",
                      }}
                      className="focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </Field>
                  <Field label="Receiving Hospice NPI">
                    <input
                      type="text"
                      value={receivingHospiceId}
                      onChange={(e) => setReceivingHospiceId(e.target.value)}
                      placeholder="1234567890"
                      style={{
                        fontFamily: "JetBrains Mono, monospace",
                        fontSize: 13,
                        height: 40,
                        borderRadius: 6,
                        border: "1px solid #D1D5DB",
                        padding: "0 12px",
                        width: "100%",
                        outline: "none",
                      }}
                      className="focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Transfer Date">
                    <input
                      type="date"
                      value={transferDate}
                      onChange={(e) => setTransferDate(e.target.value)}
                      style={{
                        fontFamily: transferDate ? "JetBrains Mono, monospace" : undefined,
                        fontSize: 13,
                        height: 40,
                        borderRadius: 6,
                        border: "1px solid #D1D5DB",
                        padding: "0 12px",
                        width: "100%",
                        outline: "none",
                      }}
                      className="focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </Field>
                </div>
              </>
            )}

            {createMutation.isError && (
              <div
                className="text-sm"
                style={{
                  background: "#FEF2F2",
                  border: "1px solid #FECACA",
                  borderRadius: 6,
                  padding: "10px 14px",
                  color: "#DC2626",
                }}
              >
                {createMutation.error instanceof Error
                  ? createMutation.error.message
                  : "Failed to save NOTR"}
              </div>
            )}
          </div>

          {/* Right: 360px column */}
          <div className="flex flex-col gap-4 shrink-0" style={{ width: 360 }}>
            {/* Filing Timeline card */}
            <div
              className="flex flex-col"
              style={{ background: "#FFFFFF", borderRadius: 8, border: "1px solid #E2E8F0", padding: 20, gap: 14 }}
            >
              <span
                style={{ fontFamily: "Space Grotesk, Inter, sans-serif", fontSize: 14, fontWeight: 600, color: "#0F172A" }}
              >
                Filing Timeline
              </span>

              <TimelineRow
                label="Revocation Date"
                value={revocationDate ? formatDate(revocationDate) : "--"}
                mono
                valueColor="#0F172A"
              />
              <Divider />
              <TimelineRow
                label="Filing Deadline"
                value={deadlineDate ? formatDate(deadlineDate) : "--"}
                mono
                valueColor="#EA580C"
                bold
              />
              <Divider />
              <TimelineRow
                label="Days Remaining"
                value={
                  daysRemaining !== null
                    ? `${daysRemaining} business day${daysRemaining !== 1 ? "s" : ""}`
                    : "--"
                }
                mono
                valueColor="#EA580C"
                bold
              />
              <Divider />
              <TimelineRow
                label="Reason"
                value={REVOCATION_REASON_LABELS[revocationReason]}
              />
              {isTransfer && (
                <>
                  <Divider />
                  <TimelineRow
                    label="Receiving Hospice"
                    value={receivingHospiceName || "--"}
                  />
                  {transferDate && (
                    <>
                      <Divider />
                      <TimelineRow
                        label="Transfer Date"
                        value={formatDate(transferDate)}
                        mono
                      />
                    </>
                  )}
                </>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                disabled={!canSubmit || createMutation.isPending}
                onClick={() => createMutation.mutate({ submit: true })}
                style={{
                  background: "#DC2626",
                  color: "#FFFFFF",
                  fontSize: 14,
                  fontWeight: 600,
                  borderRadius: 6,
                  padding: "10px 0",
                  border: "none",
                  cursor: canSubmit && !createMutation.isPending ? "pointer" : "not-allowed",
                  opacity: canSubmit && !createMutation.isPending ? 1 : 0.5,
                  width: "100%",
                }}
              >
                {createMutation.isPending ? "Submitting…" : "Submit NOTR"}
              </button>

              <button
                type="button"
                disabled={!canSubmit || createMutation.isPending}
                onClick={() => createMutation.mutate({ submit: false })}
                style={{
                  background: "#FFFFFF",
                  color: "#374151",
                  fontSize: 14,
                  fontWeight: 500,
                  borderRadius: 6,
                  padding: "10px 0",
                  border: "1px solid #D1D5DB",
                  cursor: canSubmit && !createMutation.isPending ? "pointer" : "not-allowed",
                  opacity: canSubmit && !createMutation.isPending ? 1 : 0.5,
                  width: "100%",
                }}
              >
                {createMutation.isPending ? "Saving…" : "Save as Draft"}
              </button>

              <button
                type="button"
                onClick={() => navigate({ to: "/filings" })}
                className="text-sm text-gray-500 hover:text-gray-700 py-2 flex items-center justify-center gap-1"
              >
                <svg
                  className="w-4 h-4 rotate-180"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden="true"
                >
                  <title>back</title>
                  <polyline points="9 18 15 12 9 6" />
                </svg>
                Back to Filing Workbench
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium" style={{ color: "#374151" }}>
        {label}
        {required && <span style={{ color: "#EF4444", marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  );
}

function TimelineRow({
  label,
  value,
  mono,
  valueColor = "#0F172A",
  bold,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueColor?: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span style={{ fontSize: 12, color: "#64748B" }}>{label}</span>
      <span
        style={{
          fontFamily: mono ? "JetBrains Mono, monospace" : "Inter, sans-serif",
          fontSize: 12,
          fontWeight: bold ? 700 : 500,
          color: valueColor,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "#F1F5F9" }} />;
}
