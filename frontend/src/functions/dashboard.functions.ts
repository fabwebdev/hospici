// functions/dashboard.functions.ts
// Dashboard server functions — wired to backend /api/v1/my/dashboard

import { env } from "@/lib/env.server.js";
import type { MyDashboardResponse } from "@hospici/shared-types";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";

export async function fetchMyDashboard(cookieHeader: string): Promise<MyDashboardResponse> {
  const response = await fetch(`${env.apiUrl}/api/v1/my/dashboard`, {
    headers: { cookie: cookieHeader },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? "Failed to fetch dashboard data");
  }
  return (await response.json()) as MyDashboardResponse;
}

export const getMyDashboardFn = createServerFn({ method: "GET" }).handler(async () => {
  return fetchMyDashboard(getRequestHeader("cookie") ?? "");
});
