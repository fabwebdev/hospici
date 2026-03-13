// tests/contract/alerts.functions.test.ts
// Contract tests for compliance alert server function handlers

import type { Alert, AlertListResponse } from "@hospici/shared-types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.server.js", () => ({
  env: { apiUrl: "http://localhost:3000", betterAuthSecret: "test" },
}));
vi.mock("vinxi/http", () => ({ getEvent: vi.fn(() => ({})) }));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: vi.fn(() => ({
    headers: { get: (key: string) => (key === "cookie" ? "session=test" : null) },
  })),
}));

const { fetchComplianceAlerts, fetchBillingAlerts, patchAlertStatus } = await import(
  "@/functions/alerts.functions.js"
);

const COOKIE = "session=test";
const ALERT_ID = "aaaaaaaa-0000-0000-0000-000000000001";
const PATIENT_ID = "bbbbbbbb-0000-0000-0000-000000000001";
const LOCATION_ID = "cccccccc-0000-0000-0000-000000000001";

const sampleAlert: Alert = {
  id: ALERT_ID,
  type: "NOE_DEADLINE",
  severity: "critical",
  patientId: PATIENT_ID,
  patientName: "John Doe",
  locationId: LOCATION_ID,
  dueDate: "2026-03-15",
  daysRemaining: 3,
  description: "NOE filing deadline approaches in 3 day(s). 42 CFR §418.22",
  rootCause: "NOE not submitted",
  nextAction: "Submit Notice of Election by 2026-03-15",
  status: "new",
  assignedTo: null,
  snoozedUntil: null,
  resolvedAt: null,
  createdAt: "2026-03-12T10:00:00.000Z",
  updatedAt: "2026-03-12T10:00:00.000Z",
};

const sampleList: AlertListResponse = {
  data: [sampleAlert],
  total: 1,
};

// ── fetchComplianceAlerts ─────────────────────────────────────────────────────

describe("fetchComplianceAlerts", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls GET /api/v1/alerts/compliance with cookie header", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(sampleList), { status: 200 }),
    );

    const result = await fetchComplianceAlerts(COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/alerts/compliance",
      { headers: { cookie: COOKIE } },
    );
    expect(result.total).toBe(1);
    expect(result.data[0]?.id).toBe(ALERT_ID);
  });

  it("passes filter params as query string", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [], total: 0 }), { status: 200 }),
    );

    await fetchComplianceAlerts(COOKIE, { status: "new", severity: "critical" });

    const call = vi.mocked(global.fetch).mock.calls[0];
    const url = call?.[0] as string;
    expect(url).toContain("status=new");
    expect(url).toContain("severity=critical");
  });

  it("throws on non-ok response", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Unauthorized" } }), { status: 401 }),
    );

    await expect(fetchComplianceAlerts(COOKIE)).rejects.toThrow("Unauthorized");
  });

  it("throws with fallback message on malformed error body", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("not json", { status: 500 }));

    await expect(fetchComplianceAlerts(COOKIE)).rejects.toThrow(
      "Failed to fetch compliance alerts",
    );
  });
});

// ── fetchBillingAlerts ────────────────────────────────────────────────────────

describe("fetchBillingAlerts", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls GET /api/v1/alerts/billing and returns empty list", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [], total: 0 }), { status: 200 }),
    );

    const result = await fetchBillingAlerts(COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/alerts/billing",
      { headers: { cookie: COOKIE } },
    );
    expect(result.total).toBe(0);
    expect(result.data).toHaveLength(0);
  });

  it("throws on non-ok response", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(new Response("", { status: 503 }));

    await expect(fetchBillingAlerts(COOKIE)).rejects.toThrow("Failed to fetch billing alerts");
  });
});

// ── patchAlertStatus ──────────────────────────────────────────────────────────

describe("patchAlertStatus", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("calls PATCH /api/v1/alerts/:id/status with acknowledge body", async () => {
    const updated = { ...sampleAlert, status: "acknowledged" as const };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(updated), { status: 200 }),
    );

    const result = await patchAlertStatus(ALERT_ID, { status: "acknowledged" }, COOKIE);

    expect(vi.mocked(global.fetch)).toHaveBeenCalledWith(
      `http://localhost:3000/api/v1/alerts/${ALERT_ID}/status`,
      expect.objectContaining({
        method: "PATCH",
        headers: expect.objectContaining({ cookie: COOKIE, "Content-Type": "application/json" }),
      }),
    );
    expect(result.status).toBe("acknowledged");
  });

  it("calls PATCH with resolve body and returns resolved alert", async () => {
    const resolved = {
      ...sampleAlert,
      status: "resolved" as const,
      resolvedAt: "2026-03-12T12:00:00.000Z",
    };
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify(resolved), { status: 200 }),
    );

    const result = await patchAlertStatus(ALERT_ID, { status: "resolved" }, COOKIE);
    expect(result.status).toBe("resolved");
    expect(result.resolvedAt).toBeTruthy();
  });

  it("throws on hard-block snooze attempt (422 HARD_BLOCK_NO_SNOOZE)", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message: "Alert type NOE_DEADLINE is a hard-block and cannot be snoozed",
            code: "HARD_BLOCK_NO_SNOOZE",
          },
        }),
        { status: 422 },
      ),
    );

    const err = await patchAlertStatus(
      ALERT_ID,
      { status: "acknowledged", snoozedUntil: "2026-03-20" },
      COOKIE,
    ).catch((e: unknown) => e as Error & { code?: string });
    expect(err).toBeInstanceOf(Error);
    expect((err as Error & { code?: string }).code).toBe("HARD_BLOCK_NO_SNOOZE");
  });

  it("throws with 404 when alert not found", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "Alert not found" } }), { status: 404 }),
    );

    await expect(patchAlertStatus(ALERT_ID, { status: "resolved" }, COOKIE)).rejects.toThrow(
      "Alert not found",
    );
  });
});
