// components/BenefitPeriodRiskWidget.tsx
// At-risk / past-due counts with Socket.IO live updates — T3-4

import { getBenefitPeriodsFn } from "@/functions/benefit-period.functions.js";
import type { BenefitPeriodListResponse } from "@hospici/shared-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";

// ── Widget ────────────────────────────────────────────────────────────────────

interface BenefitPeriodRiskWidgetProps {
  /** Whether to show the full detail link */
  showLink?: boolean;
}

export function BenefitPeriodRiskWidget({ showLink = true }: BenefitPeriodRiskWidgetProps) {
  const queryClient = useQueryClient();

  const { data: atRisk } = useQuery({
    queryKey: ["benefit-periods", "at_risk"],
    queryFn: () =>
      getBenefitPeriodsFn({
        data: { query: { status: "at_risk", limit: 100 } },
      }) as Promise<BenefitPeriodListResponse>,
    staleTime: 60_000,
  });

  const { data: pastDue } = useQuery({
    queryKey: ["benefit-periods", "past_due"],
    queryFn: () =>
      getBenefitPeriodsFn({
        data: { query: { status: "past_due", limit: 100 } },
      }) as Promise<BenefitPeriodListResponse>,
    staleTime: 60_000,
  });

  const { data: recertDue } = useQuery({
    queryKey: ["benefit-periods", "recert_due"],
    queryFn: () =>
      getBenefitPeriodsFn({
        data: { query: { status: "recert_due", limit: 100 } },
      }) as Promise<BenefitPeriodListResponse>,
    staleTime: 60_000,
  });

  const { data: billingRisk } = useQuery({
    queryKey: ["benefit-periods", "billing_risk"],
    queryFn: () =>
      getBenefitPeriodsFn({
        data: { query: { billingRisk: true, limit: 100 } },
      }) as Promise<BenefitPeriodListResponse>,
    staleTime: 60_000,
  });

  // Live updates via Socket.IO DOM events
  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: ["benefit-periods"] });
    };
    window.addEventListener("benefit:period:status:changed", refresh);
    window.addEventListener("benefit:period:recert_task", refresh);
    return () => {
      window.removeEventListener("benefit:period:status:changed", refresh);
      window.removeEventListener("benefit:period:recert_task", refresh);
    };
  }, [queryClient]);

  const atRiskCount = atRisk?.total ?? 0;
  const pastDueCount = pastDue?.total ?? 0;
  const recertDueCount = recertDue?.total ?? 0;
  const billingRiskCount = billingRisk?.total ?? 0;

  return (
    <div className="bg-white border rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 text-sm">Benefit Period Status</h3>
        {showLink && (
          <Link to="/benefit-periods" className="text-xs text-blue-600 hover:underline">
            View all →
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Recert Due */}
        <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded p-3">
          <div className="text-2xl font-bold text-amber-700">{recertDueCount}</div>
          <div className="text-xs text-amber-700">
            <div className="font-medium">Recert Due</div>
            <div className="text-amber-500">14-day window</div>
          </div>
        </div>

        {/* At Risk */}
        <div className="flex items-center gap-3 bg-orange-50 border border-orange-200 rounded p-3">
          <div className="text-2xl font-bold text-orange-700">{atRiskCount}</div>
          <div className="text-xs text-orange-700">
            <div className="font-medium">At Risk</div>
            <div className="text-orange-500">7-day window</div>
          </div>
        </div>

        {/* Past Due */}
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded p-3">
          <div className="text-2xl font-bold text-red-700">{pastDueCount}</div>
          <div className="text-xs text-red-700">
            <div className="font-medium">Past Due</div>
            <div className="text-red-500">Claims may be blocked</div>
          </div>
        </div>

        {/* Billing Risk */}
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded p-3">
          <div className="text-2xl font-bold text-red-700">{billingRiskCount}</div>
          <div className="text-xs text-red-700">
            <div className="font-medium">Billing Risk</div>
            <div className="text-red-500">Action required</div>
          </div>
        </div>
      </div>

      {(pastDueCount > 0 || billingRiskCount > 0) && (
        <div className="mt-3 bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
          {pastDueCount > 0 && (
            <div>
              {pastDueCount} period{pastDueCount !== 1 ? "s" : ""} past due — CMS billing may be
              suspended. Immediate action required.
            </div>
          )}
          {billingRiskCount > 0 && (
            <div className="mt-0.5">
              {billingRiskCount} period{billingRiskCount !== 1 ? "s" : ""} with billing risk
              conditions.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
