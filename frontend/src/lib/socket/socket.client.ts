/**
 * Socket.IO client — access token stored in memory only (never localStorage).
 *
 * Usage:
 *   1. After login: setSocketToken(accessToken); initSocket();
 *   2. On logout:   destroySocket(); clearSocketToken();
 */

import { clientEnv } from "@/lib/env.client";
import { type Socket, io } from "socket.io-client";

// ── Memory-only token store ──────────────────────────────────────────────────
// NEVER write this to localStorage or sessionStorage — PHI risk.
let _token: string | null = null;

export function setSocketToken(token: string): void {
  _token = token;
}

export function clearSocketToken(): void {
  _token = null;
}

// ── Socket instance ───────────────────────────────────────────────────────────
let _socket: Socket | null = null;

export function initSocket(): Socket {
  if (_socket?.connected) return _socket;

  if (!_token) {
    throw new Error("initSocket: call setSocketToken() before initSocket()");
  }

  _socket = io(clientEnv.socketUrl, {
    auth: { token: _token },
    transports: ["websocket"],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 2000,
  });

  _socket.on("connect_error", (err) => {
    // Use structured logging in production — console is acceptable here
    // since this is a client-side event handler with no PHI
    if (err.message.includes("Unauthorized")) {
      destroySocket();
      clearSocketToken();
      // Redirect to login — caller should handle this via error boundary
    }
  });

  return _socket;
}

export function getSocket(): Socket | null {
  return _socket;
}

export function destroySocket(): void {
  if (_socket) {
    _socket.disconnect();
    _socket = null;
  }
}
