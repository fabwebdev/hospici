// routes/_authed/settings/baa/index.tsx
// T3-8: BAA Vendor Registry — main table view

import {
  getExpiringBaasFn,
  getMissingBaasFn,
  listVendorsFn,
} from "@/functions/vendor.functions.js";
import type { Vendor, VendorListResponse } from "@hospici/shared-types";
import { useQuery } from "@tanstack/react-query";
import { Link, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/settings/baa/")({
  component: BaaRegistryPage,
});

const BAA_STATUS_BADGE: Record<string, string> = {
  SIGNED: "bg-green-100 text-green-800",
  PENDING: "bg-yellow-100 text-yellow-800",
  NOT_REQUIRED: "bg-gray-100 text-gray-600",
  EXPIRED: "bg-red-100 text-red-800",
  SUSPENDED: "bg-orange-100 text-orange-800",
};

const PHI_EXPOSURE_BADGE: Record<string, string> = {
  NONE: "bg-gray-100 text-gray-600",
  INDIRECT: "bg-blue-100 text-blue-800",
  DIRECT: "bg-orange-100 text-orange-800",
  STORES_PHI: "bg-red-100 text-red-800",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${BAA_STATUS_BADGE[status] ?? "bg-gray-100"}`}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

function ExposureBadge({ level }: { level: string }) {
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${PHI_EXPOSURE_BADGE[level] ?? "bg-gray-100"}`}
    >
      {level.replace(/_/g, " ")}
    </span>
  );
}

function BaaRegistryPage() {
  const { data, isLoading } = useQuery<VendorListResponse>({
    queryKey: ["vendors"],
    queryFn: () => listVendorsFn({ data: {} }),
  });

  const { data: _expiring } = useQuery({
    queryKey: ["vendors", "expiring"],
    queryFn: () => getExpiringBaasFn({ data: {} }),
  });

  const { data: _missing } = useQuery({
    queryKey: ["vendors", "missing-baas"],
    queryFn: () => getMissingBaasFn(),
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">BAA & Vendor Registry</h1>
          <p className="text-sm text-gray-500 mt-1">
            HIPAA Business Associate Agreements and vendor security governance
          </p>
        </div>
        <Link
          to="/settings/baa/new"
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
        >
          Add Vendor
        </Link>
      </div>

      {/* Summary tiles */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border rounded-lg p-4">
          <div className="text-3xl font-bold text-gray-900">{data?.total ?? "—"}</div>
          <div className="text-sm text-gray-500 mt-1">Total Active Vendors</div>
        </div>
        <div className="bg-white border border-yellow-200 rounded-lg p-4">
          <div className="text-3xl font-bold text-yellow-700">
            {data?.expiringCount ?? "—"}
          </div>
          <div className="text-sm text-gray-500 mt-1">BAAs Expiring in 90 Days</div>
        </div>
        <div className="bg-white border border-red-200 rounded-lg p-4">
          <div className="text-3xl font-bold text-red-700">{data?.missingCount ?? "—"}</div>
          <div className="text-sm text-gray-500 mt-1">Missing Required BAAs</div>
        </div>
      </div>

      {/* Main table */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading vendors...</div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Vendor</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Category</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">PHI Exposure</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">BAA Status</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Renewal Date</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data?.vendors.map((v: Vendor) => (
                <tr key={v.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{v.vendorName}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {v.serviceCategory.replace(/_/g, " ")}
                  </td>
                  <td className="px-4 py-3">
                    <ExposureBadge level={v.phiExposureLevel} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={v.baaStatus} />
                  </td>
                  <td className="px-4 py-3 text-gray-600">{v.baaRenewalDate ?? "—"}</td>
                  <td className="px-4 py-3">
                    <Link
                      to="/settings/baa/$id"
                      params={{ id: v.id }}
                      className="text-blue-600 hover:underline text-xs"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.vendors.length && (
            <div className="text-center py-10 text-gray-400">No vendors found.</div>
          )}
        </div>
      )}
    </div>
  );
}
