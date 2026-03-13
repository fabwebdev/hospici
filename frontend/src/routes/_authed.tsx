// routes/_authed.tsx
// Protected layout route — all children require authentication

import { logoutFn } from "@/functions/auth.functions.js";
import { getComplianceAlertsFn } from "@/functions/alerts.functions.js";
import { useSessionExpiry } from "@/hooks/realtime/useSessionExpiry.js";
import type { RouterContext } from "@/routes/__root.js";
import type { AlertListResponse } from "@hospici/shared-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ context }: { context: RouterContext }) => {
    if (!context.session) {
      throw redirect({
        to: "/login",
        search: { redirect: typeof window !== "undefined" ? window.location.href : "" },
      });
    }
  },
  component: AuthedLayout,
});

// ── AlertBanner — critical count badge in nav ─────────────────────────────────

function AlertBanner() {
  const queryClient = useQueryClient();

  const { data } = useQuery<AlertListResponse>({
    queryKey: ["alerts", "compliance"],
    queryFn: () => getComplianceAlertsFn(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // Socket.IO: invalidate on compliance:alert event
  // Socket setup is handled at app level (T1-8); here we just listen for custom DOM events
  // that the socket hook dispatches after receiving a server event.
  useEffect(() => {
    const handler = () => {
      void queryClient.invalidateQueries({ queryKey: ["alerts", "compliance"] });
    };
    window.addEventListener("compliance:alert", handler);
    return () => window.removeEventListener("compliance:alert", handler);
  }, [queryClient]);

  const criticalCount =
    data?.data.filter((a) => a.severity === "critical" && a.status !== "resolved").length ?? 0;
  const warningCount =
    data?.data.filter((a) => a.severity === "warning" && a.status !== "resolved").length ?? 0;

  if (criticalCount === 0 && warningCount === 0) return null;

  return (
    <Link
      to="/alerts"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm font-medium hover:bg-red-100"
    >
      ⚠️
      {criticalCount > 0 && (
        <span className="bg-red-600 text-white text-xs font-bold px-1.5 py-0.5 rounded-full animate-pulse">
          {criticalCount}
        </span>
      )}
      {warningCount > 0 && (
        <span className="bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
          {warningCount}
        </span>
      )}
    </Link>
  );
}

// ── SessionExpiryModal ───────────────────────────────────────────────────────

function SessionExpiryModal({
  secondsRemaining,
  onContinue,
  onLogout,
}: {
  secondsRemaining: number;
  onContinue: () => void;
  onLogout: () => void;
}) {
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  const isUrgent = secondsRemaining <= 60;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
        <div className={`flex items-center gap-2 mb-3 ${isUrgent ? "text-red-600" : "text-amber-600"}`}>
          <span className="text-xl" aria-hidden="true">⏱</span>
          <h2 className="text-lg font-semibold">Session Expiring Soon</h2>
        </div>
        <p className="text-gray-600 text-sm mb-4">
          Your session will expire in{" "}
          <span className={`font-mono font-bold ${isUrgent ? "text-red-600" : "text-amber-600"}`}>
            {minutes > 0 ? `${minutes}:${String(seconds).padStart(2, "0")}` : `${seconds}s`}
          </span>{" "}
          due to inactivity. Click <strong>Continue Session</strong> to stay logged in.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onContinue}
            className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Continue Session
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="flex-1 py-2 px-4 border border-gray-300 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-400"
          >
            Logout Now
          </button>
        </div>
      </div>
    </div>
  );
}

// ── AuthedLayout ─────────────────────────────────────────────────────────────

function AuthedLayout() {
  const router = useRouter();
  const { expiresInSeconds, dismiss, setOnExpired } = useSessionExpiry();

  // Auto-logout when countdown hits zero — navigate to login
  useEffect(() => {
    setOnExpired(() => {
      void logoutFn().catch(() => {
        void router.navigate({ to: "/login" });
      });
    });
  }, [setOnExpired, router]);

  const handleContinueSession = () => {
    // Any authenticated API call resets the idle timer on the backend.
    // Dismissing the modal is sufficient — the next query will keep the session alive.
    dismiss();
  };

  const handleLogoutNow = () => {
    dismiss();
    void logoutFn();
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {expiresInSeconds !== null && (
        <SessionExpiryModal
          secondsRemaining={expiresInSeconds}
          onContinue={handleContinueSession}
          onLogout={handleLogoutNow}
        />
      )}
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <span className="text-xl font-bold text-blue-600">Hospici</span>
              <div className="ml-10 flex space-x-4">
                <Link to="/dashboard" className="px-3 py-2 text-gray-700 hover:text-blue-600">
                  Dashboard
                </Link>
                <Link to="/patients" className="px-3 py-2 text-gray-700 hover:text-blue-600">
                  Patients
                </Link>
                <Link to="/alerts" className="px-3 py-2 text-gray-700 hover:text-blue-600">
                  Alerts
                </Link>
                <Link to="/hope/dashboard" className="px-3 py-2 text-gray-700 hover:text-blue-600">
                  HOPE
                </Link>
                {/* TODO T2-4: replace with <Link> once route is implemented */}
                <a href="/scheduling/idg" className="px-3 py-2 text-gray-700 hover:text-blue-600">
                  IDG
                </a>
                <Link to="/filings" className="px-3 py-2 text-gray-700 hover:text-blue-600">
                  Filings
                </Link>
                <Link to="/signatures" className="px-3 py-2 text-gray-700 hover:text-blue-600">
                  Signatures
                </Link>
                <Link to="/cap" className="px-3 py-2 text-gray-700 hover:text-blue-600">
                  Cap
                </Link>
                <Link to="/billing/audit" className="px-3 py-2 text-gray-700 hover:text-blue-600">
                  Billing Audit
                </Link>
                <Link to="/chart-audit" className="px-3 py-2 text-gray-700 hover:text-blue-600">
                  Chart Audit
                </Link>
                <Link to="/qapi" className="px-3 py-2 text-gray-700 hover:text-blue-600">
                  QAPI
                </Link>
                <Link to="/analytics/scorecards" className="px-3 py-2 text-gray-700 hover:text-blue-600">
                  Scorecards
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <AlertBanner />
              <span className="text-sm text-gray-500">Dr. Smith</span>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
