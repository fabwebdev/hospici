/**
 * socket.plugin unit tests
 *
 * Key coverage:
 * - msUntilExpiry / sessionExpiryWarningDelay: pure time math
 * - verifySocketSession: auth guard logic (mocked Better Auth)
 * - Compliance event bridge: complianceEvents → Socket.IO emit
 */

import { afterEach, describe, expect, it, vi } from "vitest";

// ── Mock Better Auth ──────────────────────────────────────────────────────────

const mockGetSession = vi.fn();
vi.mock("@/config/auth.config.js", () => ({
  auth: { api: { getSession: mockGetSession } },
}));

vi.mock("@/config/env.js", () => ({
  env: {
    allowedOrigins: ["http://localhost:5173"],
    valkeyHost: "localhost",
    valkeyPort: 6379,
    valkeyPassword: "",
    logLevel: "silent",
    isDev: true,
    isProd: false,
  },
}));

vi.mock("@/config/logging.config.js", () => ({
  createLoggingConfig: () => ({ level: "silent" }),
}));

// ── Tests: msUntilExpiry ──────────────────────────────────────────────────────

describe("msUntilExpiry()", () => {
  it("returns positive ms for a future expiry", async () => {
    const { msUntilExpiry } = await import("./socket.plugin.js");
    const future = new Date(Date.now() + 60_000);
    expect(msUntilExpiry(future)).toBeGreaterThan(0);
    expect(msUntilExpiry(future)).toBeLessThanOrEqual(60_000);
  });

  it("returns negative ms for an already-expired session", async () => {
    const { msUntilExpiry } = await import("./socket.plugin.js");
    const past = new Date(Date.now() - 60_000);
    expect(msUntilExpiry(past)).toBeLessThan(0);
  });
});

// ── Tests: sessionExpiryWarningDelay ─────────────────────────────────────────

describe("sessionExpiryWarningDelay()", () => {
  it("returns ms for a fresh 30-min session (warning fires at 25 min)", async () => {
    const { sessionExpiryWarningDelay } = await import("./socket.plugin.js");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min from now
    const delay = sessionExpiryWarningDelay(expiresAt);
    // Should fire after ~25 min (±1s tolerance)
    expect(delay).toBeGreaterThan(24 * 60 * 1000);
    expect(delay).toBeLessThanOrEqual(25 * 60 * 1000 + 1000);
  });

  it("returns 0 when session expires in less than 5 minutes (warning window already passed)", async () => {
    const { sessionExpiryWarningDelay } = await import("./socket.plugin.js");
    const expiresAt = new Date(Date.now() + 4 * 60 * 1000); // 4 min from now
    expect(sessionExpiryWarningDelay(expiresAt)).toBe(0);
  });

  it("returns 0 for an already-expired session", async () => {
    const { sessionExpiryWarningDelay } = await import("./socket.plugin.js");
    const expired = new Date(Date.now() - 60_000);
    expect(sessionExpiryWarningDelay(expired)).toBe(0);
  });
});

// ── Tests: verifySocketSession ────────────────────────────────────────────────

describe("verifySocketSession()", () => {
  afterEach(() => mockGetSession.mockReset());

  it("returns null when Better Auth returns no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const { verifySocketSession } = await import("./socket.plugin.js");
    const result = await verifySocketSession({ cookie: "session=invalid" });
    expect(result).toBeNull();
  });

  it("returns null when user has not enrolled TOTP", async () => {
    mockGetSession.mockResolvedValue({
      user: {
        id: "u-1",
        twoFactorEnabled: false,
        abacAttributes: JSON.stringify({ locationIds: ["loc-1"], role: "clinician" }),
      },
      session: { expiresAt: new Date(Date.now() + 30 * 60_000).toISOString() },
    });
    const { verifySocketSession } = await import("./socket.plugin.js");
    const result = await verifySocketSession({ cookie: "session=stub" });
    expect(result).toBeNull();
  });

  it("returns verified user when session and TOTP are valid", async () => {
    const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
    mockGetSession.mockResolvedValue({
      user: {
        id: "u-2",
        twoFactorEnabled: true,
        abacAttributes: JSON.stringify({ locationIds: ["loc-99"], role: "physician" }),
      },
      session: { expiresAt },
    });
    const { verifySocketSession } = await import("./socket.plugin.js");
    const result = await verifySocketSession({ cookie: "session=valid" });

    expect(result).not.toBeNull();
    expect(result?.id).toBe("u-2");
    expect(result?.role).toBe("physician");
    expect(result?.locationId).toBe("loc-99");
    expect(result?.locationIds).toEqual(["loc-99"]);
    expect(result?.sessionExpiresAt).toBeInstanceOf(Date);
  });
});

// ── Tests: compliance event bridge ───────────────────────────────────────────

describe("compliance event bridge", () => {
  it("complianceEvents emits typed noe:deadline:warning events", async () => {
    const { complianceEvents } = await import("@/events/compliance-events.js");

    const received: unknown[] = [];
    complianceEvents.on("noe:deadline:warning", (data) => received.push(data));

    complianceEvents.emit("noe:deadline:warning", {
      noeId: "noe-1",
      patientId: "p-1",
      patientName: "Test Patient",
      deadline: "2026-03-15",
      businessDaysRemaining: 2,
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ noeId: "noe-1", businessDaysRemaining: 2 });

    complianceEvents.removeAllListeners("noe:deadline:warning");
  });

  it("complianceEvents emits typed cap:threshold:alert events", async () => {
    const { complianceEvents } = await import("@/events/compliance-events.js");

    const received: unknown[] = [];
    complianceEvents.on("cap:threshold:alert", (data) => received.push(data));

    complianceEvents.emit("cap:threshold:alert", {
      locationId: "loc-1",
      capYear: 2026,
      utilizationPercent: 0.82,
      projectedYearEndPercent: 1.05,
      threshold: "CAP_THRESHOLD_80",
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({ utilizationPercent: 0.82 });

    complianceEvents.removeAllListeners("cap:threshold:alert");
  });
});
