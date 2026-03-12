/**
 * Socket.IO plugin for Fastify
 *
 * HIPAA §164.312(a)(2)(iii): Session auto-logoff at 30 min idle.
 *   - `session:expiring` fires 5 minutes before the session expires (at 25 min).
 *   - Clients should prompt the user and refresh or log out.
 *
 * Auth guard: Every connection must present a valid Better Auth session cookie.
 * TOTP enrollment is required (same rule as HTTP endpoints).
 *
 * Rooms: Authenticated users join `location:{locationId}` so compliance alerts
 * can be scoped per hospice location.
 *
 * Compliance event bridge: BullMQ workers emit on `complianceEvents`; this
 * plugin subscribes and re-emits to the appropriate Socket.IO rooms.
 */

import { auth } from "@/config/auth.config.js";
import { env } from "@/config/env.js";
import { complianceEvents } from "@/events/compliance-events.js";
import type { ClientToServerEvents, ServerToClientEvents } from "@hospici/shared-types";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import { Server, type Socket } from "socket.io";

// ── Session expiry utilities (exported for testing) ───────────────────────────

/**
 * Returns milliseconds until the given session expires.
 * Negative if already expired.
 */
export function msUntilExpiry(expiresAt: Date): number {
  return expiresAt.getTime() - Date.now();
}

/**
 * Returns the delay (ms) after which `session:expiring` should fire.
 * Fires 5 minutes (300 s) before session expiry — giving the user a warning
 * at 25 min into a 30-min idle session (HIPAA §164.312(a)(2)(iii)).
 * Returns 0 if the warning window has already passed.
 */
export function sessionExpiryWarningDelay(expiresAt: Date): number {
  return Math.max(0, msUntilExpiry(expiresAt) - 5 * 60 * 1000);
}

// ── Auth helper ───────────────────────────────────────────────────────────────

type VerifiedSocketUser = {
  id: string;
  role: string;
  locationId: string;
  locationIds: string[];
  sessionExpiresAt: Date;
};

/**
 * Verifies the Better Auth session from Socket.IO handshake headers.
 * Returns the user context or null if session is missing/invalid.
 */
export async function verifySocketSession(
  rawHeaders: Record<string, string | string[] | undefined>,
): Promise<VerifiedSocketUser | null> {
  const headers = new Headers();
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (!value) continue;
    if (Array.isArray(value)) {
      for (const v of value) headers.append(key, v);
    } else {
      headers.set(key, value);
    }
  }

  const sessionData = await auth.api.getSession({ headers });
  if (!sessionData) return null;

  const { user, session } = sessionData;
  if (!user.twoFactorEnabled) return null; // HIPAA §164.312(d): TOTP required

  const abac = (() => {
    try {
      return JSON.parse(user.abacAttributes as string) as {
        locationIds: string[];
        role: string;
      };
    } catch {
      return { locationIds: [], role: "clinician" };
    }
  })();

  return {
    id: user.id,
    role: abac.role,
    locationId: abac.locationIds[0] ?? "",
    locationIds: abac.locationIds,
    sessionExpiresAt: new Date(session.expiresAt),
  };
}

// ── Declare `io` on the Fastify instance ──────────────────────────────────────

declare module "fastify" {
  interface FastifyInstance {
    io: Server<ClientToServerEvents, ServerToClientEvents>;
  }
}

// ── Plugin ────────────────────────────────────────────────────────────────────

async function socketPlugin(fastify: FastifyInstance) {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(fastify.server, {
    cors: {
      origin: env.allowedOrigins,
      credentials: true,
      methods: ["GET", "POST"],
    },
    // Use cookie transport so Better Auth session cookie is forwarded
    transports: ["websocket", "polling"],
  });

  // ── Auth middleware ─────────────────────────────────────────────────────────
  io.use(async (socket, next) => {
    const user = await verifySocketSession(
      socket.handshake.headers as Record<string, string | string[] | undefined>,
    );

    if (!user) {
      next(new Error("UNAUTHORIZED"));
      return;
    }

    // Attach verified user to socket data for use in event handlers
    socket.data.user = user;
    next();
  });

  // ── Connection handler ──────────────────────────────────────────────────────
  io.on("connection", (socket: Socket<ClientToServerEvents, ServerToClientEvents>) => {
    const user = socket.data.user as VerifiedSocketUser;

    fastify.log.info(
      { socketId: socket.id, userId: user.id, locationId: user.locationId },
      "Socket.IO: client connected",
    );

    // Join the location room for scoped compliance alerts
    for (const locId of user.locationIds) {
      void socket.join(`location:${locId}`);
    }

    // ── HIPAA session expiry warning ─────────────────────────────────────────
    // Emit `session:expiring` 5 minutes before the session expires.
    // This covers the "25-min idle" scenario for a fresh 30-min session.
    const warningDelay = sessionExpiryWarningDelay(user.sessionExpiresAt);
    const expiryTimer = setTimeout(() => {
      socket.emit("session:expiring", { expiresInSeconds: 300 });
      fastify.log.info({ userId: user.id }, "Socket.IO: session:expiring emitted");
    }, warningDelay);

    // ── Client event handlers ────────────────────────────────────────────────
    socket.on("presence:join", ({ locationId }) => {
      void socket.join(`location:${locationId}`);
    });

    socket.on("presence:leave", () => {
      for (const locId of user.locationIds) {
        void socket.leave(`location:${locId}`);
      }
    });

    // Heartbeat: no-op — connection keepalive handled by Socket.IO engine
    socket.on("presence:heartbeat", () => {});

    socket.on("notification:acknowledge", ({ notificationId }) => {
      fastify.log.debug({ userId: user.id, notificationId }, "notification acknowledged");
    });

    socket.on("disconnect", (reason) => {
      clearTimeout(expiryTimer);
      fastify.log.info(
        { socketId: socket.id, userId: user.id, reason },
        "Socket.IO: client disconnected",
      );
    });
  });

  // ── Compliance event bridge ─────────────────────────────────────────────────
  // Subscribe to the in-process compliance event bus and fan out over Socket.IO.

  complianceEvents.on("noe:deadline:warning", (data) => {
    const room = data.patientId ? `location:${data.patientId}` : undefined;
    // NOE events carry patientId but not locationId directly — broadcast until
    // T3-1 wires location context. Workers will pass locationId once available.
    if (room) {
      io.emit("noe:deadline:warning", data);
    } else {
      io.emit("noe:deadline:warning", data);
    }
  });

  complianceEvents.on("aide:supervision:overdue", (data) => {
    io.emit("aide:supervision:overdue", data);
  });

  complianceEvents.on("cap:threshold:alert", (data) => {
    // Cap alerts are scoped to a location
    io.to(`location:${data.locationId}`).emit("cap:threshold:alert", data);
  });

  complianceEvents.on("idg:due:warning", (data) => {
    io.emit("idg:due:warning", data);
  });

  complianceEvents.on("break:glass:access", (data) => {
    // Notify all admins (super_admin room, wired in T3-8)
    io.emit("break:glass:access", data);
  });

  // ── Graceful shutdown ───────────────────────────────────────────────────────
  fastify.addHook("onClose", async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
    fastify.log.info("Socket.IO server closed");
  });

  fastify.decorate("io", io);
}

export default fp(socketPlugin, {
  name: "socket",
  dependencies: ["valkey"], // Ensure Valkey is up before Socket.IO
});
