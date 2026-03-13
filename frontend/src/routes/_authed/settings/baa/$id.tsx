// routes/_authed/settings/baa/$id.tsx
// T3-8: Vendor Detail — fields + review history timeline + "Add Review" modal

import { addVendorReviewFn, getVendorFn } from "@/functions/vendor.functions.js";
import type { VendorDetail, VendorReview } from "@hospici/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_authed/settings/baa/$id")({
  component: VendorDetailPage,
});

const BAA_STATUS_BADGE: Record<string, string> = {
  SIGNED: "bg-green-100 text-green-800",
  PENDING: "bg-yellow-100 text-yellow-800",
  NOT_REQUIRED: "bg-gray-100 text-gray-600",
  EXPIRED: "bg-red-100 text-red-800",
  SUSPENDED: "bg-orange-100 text-orange-800",
};

const OUTCOME_BADGE: Record<string, string> = {
  APPROVED: "bg-green-100 text-green-800",
  APPROVED_WITH_CONDITIONS: "bg-yellow-100 text-yellow-800",
  SUSPENDED: "bg-orange-100 text-orange-800",
  TERMINATED: "bg-red-100 text-red-800",
};

type ReviewFormState = {
  reviewDate: string;
  outcome: string;
  baaStatusAtReview: string;
  notes: string;
};

function VendorDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const [showAddReview, setShowAddReview] = useState(false);
  const [reviewForm, setReviewForm] = useState<ReviewFormState>({
    reviewDate: new Date().toISOString().split("T")[0] as string,
    outcome: "APPROVED",
    baaStatusAtReview: "SIGNED",
    notes: "",
  });

  const { data, isLoading } = useQuery<VendorDetail>({
    queryKey: ["vendor", id],
    queryFn: () => getVendorFn({ data: { id } }),
  });

  const { mutate: addReview, isPending: addingReview } = useMutation({
    mutationFn: () =>
      addVendorReviewFn({
        data: {
          vendorId: id,
          review: {
            reviewDate: reviewForm.reviewDate,
            outcome: reviewForm.outcome as
              | "APPROVED"
              | "APPROVED_WITH_CONDITIONS"
              | "SUSPENDED"
              | "TERMINATED",
            baaStatusAtReview: reviewForm.baaStatusAtReview as
              | "SIGNED"
              | "PENDING"
              | "NOT_REQUIRED"
              | "EXPIRED"
              | "SUSPENDED",
            notes: reviewForm.notes || undefined,
          },
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["vendor", id] });
      setShowAddReview(false);
    },
  });

  if (isLoading) return <div className="p-6 text-gray-400">Loading...</div>;
  if (!data) return <div className="p-6 text-red-600">Vendor not found.</div>;

  const v = data.vendor;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{v.vendorName}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {v.serviceCategory.replace(/_/g, " ")} &middot; {v.dataResidency ?? "—"}
          </p>
        </div>
        <span
          className={`px-3 py-1 rounded-full text-sm font-medium ${BAA_STATUS_BADGE[v.baaStatus] ?? "bg-gray-100"}`}
        >
          BAA: {v.baaStatus.replace(/_/g, " ")}
        </span>
      </div>

      {/* Fields grid */}
      <div className="bg-white border rounded-lg p-6 grid grid-cols-2 gap-6 mb-6">
        <Field label="PHI Exposure" value={v.phiExposureLevel.replace(/_/g, " ")} />
        <Field label="Transmits PHI" value={v.transmitsPhi ? "Yes" : "No"} />
        <Field label="Stores PHI" value={v.storesPhi ? "Yes" : "No"} />
        <Field label="Subprocessor" value={v.subprocessor ? "Yes" : "No"} />
        <Field label="BAA Required" value={v.baaRequired ? "Yes" : "No"} />
        <Field label="BAA Effective" value={v.baaEffectiveDate ?? "—"} />
        <Field label="BAA Renewal" value={v.baaRenewalDate ?? "—"} />
        <Field label="Security Review Due" value={v.securityReviewDueDate ?? "—"} />
        <Field label="Incident Contact" value={v.incidentContact ?? "—"} />
        <Field label="Description" value={v.description || "—"} />
        {v.notes ? <Field label="Notes" value={v.notes} /> : null}
        {v.exitPlan ? <Field label="Exit Plan" value={v.exitPlan} /> : null}
      </div>

      {/* Review History */}
      <div className="bg-white border rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Review History</h2>
          <button
            type="button"
            onClick={() => setShowAddReview(true)}
            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
          >
            Add Review
          </button>
        </div>
        {data.reviews.length === 0 ? (
          <p className="text-sm text-gray-400">No reviews yet.</p>
        ) : (
          <ol className="relative border-l border-gray-200 space-y-4 pl-4">
            {data.reviews.map((r: VendorReview) => (
              <li key={r.id} className="ml-4">
                <div className="absolute -left-1.5 w-3 h-3 bg-gray-300 rounded-full" />
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-900">{r.reviewDate}</span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${OUTCOME_BADGE[r.outcome] ?? "bg-gray-100"}`}
                  >
                    {r.outcome.replace(/_/g, " ")}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-xs ${BAA_STATUS_BADGE[r.baaStatusAtReview] ?? "bg-gray-100"}`}
                  >
                    BAA: {r.baaStatusAtReview.replace(/_/g, " ")}
                  </span>
                </div>
                {r.notes ? (
                  <p className="text-sm text-gray-500 mt-1">{r.notes}</p>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>

      {/* Add Review Modal */}
      {showAddReview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Review</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Review Date
                </label>
                <input
                  type="date"
                  value={reviewForm.reviewDate}
                  onChange={(e) =>
                    setReviewForm((f) => ({ ...f, reviewDate: e.target.value }))
                  }
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Outcome</label>
                <select
                  value={reviewForm.outcome}
                  onChange={(e) =>
                    setReviewForm((f) => ({ ...f, outcome: e.target.value }))
                  }
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  {[
                    "APPROVED",
                    "APPROVED_WITH_CONDITIONS",
                    "SUSPENDED",
                    "TERMINATED",
                  ].map((o) => (
                    <option key={o} value={o}>
                      {o.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  BAA Status at Review
                </label>
                <select
                  value={reviewForm.baaStatusAtReview}
                  onChange={(e) =>
                    setReviewForm((f) => ({ ...f, baaStatusAtReview: e.target.value }))
                  }
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  {["SIGNED", "PENDING", "NOT_REQUIRED", "EXPIRED", "SUSPENDED"].map((s) => (
                    <option key={s} value={s}>
                      {s.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={reviewForm.notes}
                  onChange={(e) =>
                    setReviewForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  rows={3}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={() => addReview()}
                disabled={addingReview}
                className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {addingReview ? "Saving..." : "Save Review"}
              </button>
              <button
                type="button"
                onClick={() => setShowAddReview(false)}
                className="px-4 py-2 border rounded text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">{value}</dd>
    </div>
  );
}
