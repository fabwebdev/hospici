// routes/_authed/settings/baa/new.tsx
// T3-8: Create Vendor form

import { createVendorFn } from "@/functions/vendor.functions.js";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_authed/settings/baa/new")({
  component: NewVendorPage,
});

const SERVICE_CATEGORIES = [
  "INFRASTRUCTURE",
  "CLINICAL",
  "BILLING",
  "COMMUNICATION",
  "AI_ML",
  "IDENTITY",
  "STORAGE",
  "MONITORING",
  "OTHER",
] as const;

const PHI_LEVELS = ["NONE", "INDIRECT", "DIRECT", "STORES_PHI"] as const;
const BAA_STATUSES = ["SIGNED", "PENDING", "NOT_REQUIRED", "EXPIRED", "SUSPENDED"] as const;

type FormState = {
  vendorName: string;
  serviceCategory: string;
  description: string;
  phiExposureLevel: string;
  transmitsPhi: boolean;
  storesPhi: boolean;
  subprocessor: boolean;
  baaRequired: boolean;
  baaStatus: string;
  baaRenewalDate: string;
  incidentContact: string;
  dataResidency: string;
  notes: string;
};

function NewVendorPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>({
    vendorName: "",
    serviceCategory: "OTHER",
    description: "",
    phiExposureLevel: "NONE",
    transmitsPhi: false,
    storesPhi: false,
    subprocessor: false,
    baaRequired: false,
    baaStatus: "PENDING",
    baaRenewalDate: "",
    incidentContact: "",
    dataResidency: "",
    notes: "",
  });

  const { mutate, isPending, error } = useMutation({
    mutationFn: () =>
      createVendorFn({
        data: {
          vendorName: form.vendorName,
          serviceCategory: form.serviceCategory as (typeof SERVICE_CATEGORIES)[number],
          description: form.description || undefined,
          phiExposureLevel: form.phiExposureLevel as (typeof PHI_LEVELS)[number],
          transmitsPhi: form.transmitsPhi,
          storesPhi: form.storesPhi,
          subprocessor: form.subprocessor,
          baaRequired: form.baaRequired,
          baaStatus: form.baaStatus as (typeof BAA_STATUSES)[number],
          baaRenewalDate: form.baaRenewalDate || undefined,
          incidentContact: form.incidentContact || undefined,
          dataResidency: form.dataResidency || undefined,
          notes: form.notes || undefined,
        },
      }),
    onSuccess: () => {
      navigate({ to: "/settings/baa" });
    },
  });

  function set<K extends keyof FormState>(field: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Add Vendor</h1>
      <div className="bg-white border rounded-lg p-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Vendor Name *
          </label>
          <input
            type="text"
            value={form.vendorName}
            onChange={(e) => set("vendorName", e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
            required
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Service Category *
            </label>
            <select
              value={form.serviceCategory}
              onChange={(e) => set("serviceCategory", e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              {SERVICE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              PHI Exposure *
            </label>
            <select
              value={form.phiExposureLevel}
              onChange={(e) => set("phiExposureLevel", e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              {PHI_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={form.description}
            onChange={(e) => set("description", e.target.value)}
            rows={2}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              BAA Status *
            </label>
            <select
              value={form.baaStatus}
              onChange={(e) => set("baaStatus", e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              {BAA_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              BAA Renewal Date
            </label>
            <input
              type="date"
              value={form.baaRenewalDate}
              onChange={(e) => set("baaRenewalDate", e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="flex gap-6 flex-wrap">
          {(
            [
              ["baaRequired", "BAA Required"],
              ["transmitsPhi", "Transmits PHI"],
              ["storesPhi", "Stores PHI"],
              ["subprocessor", "Subprocessor"],
            ] as const
          ).map(([field, label]) => (
            <label key={field} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form[field]}
                onChange={(e) => set(field, e.target.checked)}
              />
              {label}
            </label>
          ))}
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Incident Contact
          </label>
          <input
            type="text"
            value={form.incidentContact}
            onChange={(e) => set("incidentContact", e.target.value)}
            placeholder="email or phone"
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Data Residency</label>
          <input
            type="text"
            value={form.dataResidency}
            onChange={(e) => set("dataResidency", e.target.value)}
            placeholder="e.g. US-East-1"
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            rows={2}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>
        {error && <p className="text-red-600 text-sm">{String(error)}</p>}
        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={() => mutate()}
            disabled={isPending || !form.vendorName}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {isPending ? "Saving..." : "Add Vendor"}
          </button>
          <button
            type="button"
            onClick={() => navigate({ to: "/settings/baa" })}
            className="px-4 py-2 border rounded text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
