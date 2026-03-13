// functions/auth.functions.ts
// Authentication server functions — wired to Better Auth backend

import { authClient, parseHospiciSession } from "@/lib/auth.server.js";
import { env } from "@/lib/env.server.js";
import { BreakGlassInputValidator, LoginInputValidator } from "@/lib/validators/auth.validators.js";
import { redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { appendResponseHeader, getRequestHeader } from "@tanstack/react-start/server";

// ── Login ─────────────────────────────────────────────────────────────────────

export const loginFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => LoginInputValidator.Decode(data))
  .handler(async ({ data }) => {
    const { error } = await authClient.signIn.email({
      email: data.email,
      password: data.password,
      fetchOptions: {
        onResponse(ctx) {
          // Forward Set-Cookie from backend to browser.
          // Session cookie is httpOnly — JS on the client cannot read it.
          for (const cookie of ctx.response.headers.getSetCookie()) {
            appendResponseHeader("set-cookie", cookie);
          }
        },
      },
    });

    if (error) {
      return { success: false as const, error: error.message ?? "Invalid credentials" };
    }

    return { success: true as const };
  });

// ── Logout ────────────────────────────────────────────────────────────────────

export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  const cookieHeader = getRequestHeader("cookie") ?? "";

  await authClient.signOut({
    fetchOptions: {
      headers: { cookie: cookieHeader },
      onResponse(ctx) {
        // Forward cleared cookie to browser
        for (const cookie of ctx.response.headers.getSetCookie()) {
          appendResponseHeader("set-cookie", cookie);
        }
      },
    },
  });

  throw redirect({ to: "/login" });
});

// ── Get current session ───────────────────────────────────────────────────────

export const getCurrentSessionFn = createServerFn({ method: "GET" }).handler(async () => {
  const cookieHeader = getRequestHeader("cookie") ?? "";

  const { data: session, error } = await authClient.getSession({
    fetchOptions: { headers: { cookie: cookieHeader } },
  });

  if (error || !session) {
    return null;
  }

  return parseHospiciSession(session);
});

// ── Break-glass ───────────────────────────────────────────────────────────────
// Forwards to the backend break-glass endpoint (implemented in T3).
// Reason must be ≥ 20 characters per HIPAA §164.312(a)(2)(ii) audit requirements.

export const breakGlassFn = createServerFn({ method: "POST" })
  .validator((data: unknown) => BreakGlassInputValidator.Decode(data))
  .handler(async ({ data }) => {
    const cookieHeader = getRequestHeader("cookie") ?? "";

    const response = await fetch(`${env.apiUrl}/api/v1/break-glass`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: cookieHeader,
      },
      body: JSON.stringify({ patientId: data.patientId, reason: data.reason }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      throw new Error(body.error?.message ?? "Break-glass request failed");
    }

    return (await response.json()) as { success: true; accessExpiresAt: string };
  });
