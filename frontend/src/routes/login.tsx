// routes/login.tsx
// Public login route — design from hospici-screens.pen "01 Login"

import { loginFn } from "@/functions/auth.functions.js";
import type { RouterContext } from "@/routes/__root.js";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, redirect, useRouter } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/login")({
  // Redirect to dashboard if already authenticated
  beforeLoad: ({ context }: { context: RouterContext }) => {
    if (context.session) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loginMutation = useMutation({
    mutationFn: () => {
      setStatusMsg("Signing in...");
      return loginFn({ data: { email, password } });
    },
    onSuccess: (result) => {
      if (result.success) {
        setStatusMsg("Authenticated. Loading session...");
        void router.navigate({ to: "/dashboard" });
      } else {
        setStatusMsg(null);
      }
    },
    onError: (err) => {
      setStatusMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loginMutation.mutate();
  };

  const errorMessage = loginMutation.isError
    ? loginMutation.error instanceof Error
      ? loginMutation.error.message
      : "Login failed"
    : loginMutation.data && !loginMutation.data.success
      ? loginMutation.data.error
      : null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F1F5F9]">
      <div className="w-[420px] bg-white border border-[#E2E8F0] py-11 px-10 flex flex-col gap-[22px]">
        {/* Logo */}
        <div className="flex items-center gap-2.5 w-full">
          <div className="w-7 h-7 bg-blue-600 rounded" />
          <span
            className="text-lg font-semibold text-[#0F172A]"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Hospici
          </span>
        </div>

        {/* Heading */}
        <div className="flex flex-col gap-1.5 w-full">
          <h1
            className="text-[22px] font-semibold text-[#0F172A]"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            Sign in to your account
          </h1>
          <p className="text-[13px] text-[#64748B] leading-[1.5]">
            HIPAA-compliant access. Multi-factor authentication required.
          </p>
        </div>

        {/* Error message */}
        {errorMessage && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
            {errorMessage}
          </div>
        )}
        {statusMsg && !errorMessage && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
            {statusMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-[22px] w-full">
          {/* Email field */}
          <div className="flex flex-col gap-1.5 w-full">
            <label htmlFor="login-email" className="text-xs font-medium text-[#374151]">
              Email address
            </label>
            <div className="flex items-center h-11 w-full bg-[#F9FAFB] border border-[#D1D5DB] px-3.5">
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@hospice.org"
                required
                className="w-full bg-transparent text-sm text-[#0F172A] placeholder-[#9CA3AF] outline-none"
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password field */}
          <div className="flex flex-col gap-1.5 w-full">
            <label htmlFor="login-password" className="text-xs font-medium text-[#374151]">
              Password
            </label>
            <div className="flex items-center justify-between h-11 w-full bg-[#F9FAFB] border border-[#D1D5DB] px-3.5">
              <input
                id="login-password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="flex-1 bg-transparent text-sm text-[#0F172A] placeholder-[#9CA3AF] outline-none"
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="ml-2 text-[#9CA3AF] hover:text-[#64748B]"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <title>Hide password</title>
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                ) : (
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <title>Show password</title>
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Sign in button */}
          <button
            type="submit"
            disabled={loginMutation.isPending}
            className="flex items-center justify-center h-[46px] w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-60 transition-colors"
            style={{ fontFamily: "'Space Grotesk', sans-serif" }}
          >
            <span className="text-sm font-medium text-white">
              {loginMutation.isPending ? "Signing in..." : "Sign in"}
            </span>
          </button>
        </form>

        {/* Divider */}
        <div className="w-full h-px bg-[#F1F5F9]" />

        {/* Security note */}
        <p className="text-[11px] text-[#94A3B8] leading-[1.6] text-center w-full">
          Sessions expire after 30 min of inactivity per HIPAA &sect;164.312(a)(2)(iii). No session
          persistence. All access is logged.
        </p>
      </div>
    </div>
  );
}
