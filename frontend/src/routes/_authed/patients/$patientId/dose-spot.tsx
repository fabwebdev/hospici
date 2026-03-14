// routes/_authed/patients/$patientId/dose-spot.tsx
// Patient Dose Spot tab — DoseSpot e-prescribing integration via SSO iframe

import { getDoseSpotSsoUrlFn } from "@/functions/medications.functions.js";
import type { DoseSpotSsoResponse } from "@hospici/shared-types";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/patients/$patientId/dose-spot")({
  component: PatientDoseSpotPage,
});

function PatientDoseSpotPage() {
  const { patientId } = Route.useParams();

  const {
    data: sso,
    isLoading,
    error,
    refetch,
  } = useQuery<DoseSpotSsoResponse>({
    queryKey: ["dose-spot-sso", patientId],
    queryFn: () => getDoseSpotSsoUrlFn({ data: { patientId } }),
    // Don't auto-fetch on mount — user must explicitly launch to avoid generating
    // unnecessary SSO sessions
    enabled: false,
    retry: false,
  });

  return (
    <div className="p-6 space-y-6">
      {/* Status bar */}
      <div className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className={`h-2.5 w-2.5 rounded-full ${sso ? "bg-green-400" : error ? "bg-red-400" : "bg-amber-400"}`}
          />
          <span className="text-sm font-medium text-gray-700">DoseSpot e-Prescribing</span>
        </div>
        <span className="text-xs text-gray-400">|</span>
        <span className="text-xs text-gray-500">
          Controlled substance monitoring · DEA compliance · PDMP reporting
        </span>
        {sso && (
          <div className="ml-auto text-xs text-gray-400">
            Session expires {new Date(sso.expiresAt).toLocaleTimeString()}
          </div>
        )}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-4">
          <p className="text-sm font-semibold text-red-800">DoseSpot unavailable</p>
          <p className="text-xs text-red-600 mt-1">
            {error instanceof Error ? error.message : "Failed to get SSO URL"}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-3 text-xs text-red-700 underline"
          >
            Retry
          </button>
        </div>
      ) : sso ? (
        <iframe
          src={sso.ssoUrl}
          title="DoseSpot e-Prescribing"
          className="w-full rounded-lg border border-gray-200"
          style={{ height: "720px" }}
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
        />
      ) : (
        <div className="rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 flex flex-col items-center justify-center py-20 gap-4">
          <div className="text-5xl text-gray-300">💊</div>
          <div className="text-center">
            <h3 className="text-base font-semibold text-gray-700">DoseSpot e-Prescribing</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-sm">
              Launch the DoseSpot portal to manage prescriptions, review PDMP data, and send
              electronic prescriptions including controlled substances.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isLoading}
            className="mt-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? "Connecting…" : "Launch DoseSpot"}
          </button>
          <p className="text-xs text-gray-400">Single sign-on via secure backend session</p>
        </div>
      )}

      <p className="text-xs text-gray-400">
        DoseSpot requires a valid DEA registration. All e-prescriptions are subject to state PDMP
        reporting. Session links expire after 1 hour.
      </p>
    </div>
  );
}
