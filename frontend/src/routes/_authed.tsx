// routes/_authed.tsx
// Protected layout route — all children require authentication

import { getComplianceAlertsFn } from "@/functions/alerts.functions.js";
import { logoutFn } from "@/functions/auth.functions.js";
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

  return (
    <Link to="/alerts" className="flex items-center gap-2">
      {/* Bell — critical */}
      <div className="relative">
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke={criticalCount > 0 ? "#DC2626" : "#94A3B8"}
          strokeWidth={2}
          aria-hidden="true"
        >
          <title>Critical alerts</title>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.73 21a2 2 0 01-3.46 0" />
        </svg>
        {criticalCount > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 rounded-full text-white animate-pulse"
            style={{ background: "#DC2626", fontSize: 9, fontWeight: 600 }}
          >
            {criticalCount}
          </span>
        )}
      </div>
      {/* Triangle — warnings */}
      {warningCount > 0 && (
        <div className="relative">
          <svg
            className="w-[18px] h-[18px]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="#D97706"
            strokeWidth={2}
            aria-hidden="true"
          >
            <title>Warning alerts</title>
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"
            />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <span
            className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-4 h-4 rounded-full text-white"
            style={{ background: "#D97706", fontSize: 9, fontWeight: 600 }}
          >
            {warningCount}
          </span>
        </div>
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
        <div
          className={`flex items-center gap-2 mb-3 ${isUrgent ? "text-red-600" : "text-amber-600"}`}
        >
          <span className="text-xl" aria-hidden="true">
            ⏱
          </span>
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
    <div className="h-screen flex flex-col overflow-hidden bg-[#F8FAFC]">
      {expiresInSeconds !== null && (
        <SessionExpiryModal
          secondsRemaining={expiresInSeconds}
          onContinue={handleContinueSession}
          onLogout={handleLogoutNow}
        />
      )}

      {/* Top bar */}
      <header className="shrink-0 flex items-center gap-3 h-14 px-6 bg-white border-b border-[#E2E8F0]">
        <div className="w-6 h-6 bg-[#2563EB] rounded shrink-0" />
        <span
          className="text-base font-semibold text-[#0F172A]"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          Hospici
        </span>
        <div className="w-px h-5 bg-[#E2E8F0]" />
        <button
          type="button"
          className="flex items-center gap-1.5 h-8 px-2.5 bg-[#F8FAFC] border border-[#E2E8F0] text-[13px] text-[#374151]"
        >
          Palm Valley Hospice
          <svg
            className="w-3.5 h-3.5 text-[#64748B]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <title>Select location</title>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        <div className="flex-1" />
        <AlertBanner />
        <div className="flex items-center justify-center w-8 h-8 bg-[#2563EB] text-white text-xs font-semibold rounded-full">
          SL
        </div>
        <span className="inline-flex items-center h-[22px] px-2 bg-[#EFF6FF] border border-[#BFDBFE] text-[11px] font-medium text-[#1D4ED8]">
          RN
        </span>
      </header>

      {/* Body: sidebar + content */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <nav className="w-64 shrink-0 bg-[#0F172A] flex flex-col overflow-y-auto">
          <div className="py-3 flex-1 flex flex-col">
            <SidebarLink to="/dashboard" icon="layout-dashboard" label="Dashboard" />

            <SidebarSection label="PATIENTS" />
            <SidebarLink to="/patients" icon="users" label="Patients" />

            <SidebarSection label="CLINICAL" />
            <SidebarLink to="/patients" icon="file-text" label="Encounters" />
            <SidebarLink to="/patients" icon="sparkles" label="VantageChart™" />

            <SidebarSection label="COMPLIANCE" />
            <AlertsSidebarLink />
            <SidebarLink to="/alerts" icon="calendar-check" label="IDG Meetings" />

            <div className="flex-1" />

            {/* Session timer */}
            <div className="flex items-center gap-2 h-12 px-4 bg-[#0D1526] border-t border-[#1E293B]">
              <svg
                className="w-3.5 h-3.5 text-[#64748B]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <title>Session timer</title>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 6v6l4 2M12 2a10 10 0 100 20 10 10 0 000-20z"
                />
              </svg>
              <span className="text-xs text-[#64748B]">
                Session: {expiresInSeconds !== null ? formatTimer(expiresInSeconds) : "28:42"}
              </span>
            </div>
          </div>
        </nav>

        {/* Main content */}
        <main className="flex-1 min-h-0 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// ── Sidebar components ───────────────────────────────────────────────────────

function AlertsSidebarLink() {
  const { data } = useQuery<AlertListResponse>({
    queryKey: ["alerts", "compliance"],
    queryFn: () => getComplianceAlertsFn(),
    staleTime: 30_000,
  });
  const totalActive = data?.data.filter((a) => a.status !== "resolved").length ?? 0;
  return (
    <Link
      to="/alerts"
      activeProps={{
        className:
          "flex items-center gap-2.5 h-10 px-4 text-[14px] font-medium text-white bg-[#7F1D1D]",
      }}
      inactiveProps={{
        className:
          "flex items-center gap-2.5 h-10 px-4 text-[14px] text-[#94A3B8] hover:text-white hover:bg-[#1E293B]",
      }}
    >
      <SidebarIcon name="bell" />
      <span className="flex-1">Alerts</span>
      {totalActive > 0 && (
        <span
          className="flex items-center justify-center w-5 h-5 rounded text-white"
          style={{ background: "#DC2626", fontSize: 10, fontWeight: 600 }}
        >
          {totalActive}
        </span>
      )}
    </Link>
  );
}

function SidebarSection({ label }: { label: string }) {
  return (
    <div className="px-4 pt-3.5 pb-1">
      <span className="text-[10px] font-semibold text-[#475569] tracking-wide">{label}</span>
    </div>
  );
}

function SidebarLink({
  to,
  icon,
  label,
}: {
  to: string;
  icon: string;
  label: string;
}) {
  return (
    <Link
      to={to}
      activeProps={{
        className:
          "flex items-center gap-2.5 h-9 px-4 text-[13px] bg-[#1E3A5F] text-white font-medium",
      }}
      inactiveProps={{
        className:
          "flex items-center gap-2.5 h-9 px-4 text-[13px] text-[#94A3B8] hover:text-white hover:bg-[#1E293B]",
      }}
    >
      <SidebarIcon name={icon} />
      {label}
    </Link>
  );
}

function SidebarIcon({ name }: { name: string }) {
  const iconPaths: Record<string, string> = {
    "layout-dashboard": "M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z",
    bell: "M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0",
    users:
      "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v-2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75",
    "file-text":
      "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
    sparkles: "M5 3v4M3 5h4M6 17v4M4 19h4M13 3l2 2-2 2M21 3l-2 2 2 2M13 15l2 2-2 2M21 15l-2 2 2 2",
    "calendar-check": "M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11",
  };

  return (
    <svg
      className="w-3.5 h-3.5 shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <title>{name}</title>
      <path d={iconPaths[name] ?? "M12 2a10 10 0 100 20 10 10 0 000-20z"} />
    </svg>
  );
}

function formatTimer(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
