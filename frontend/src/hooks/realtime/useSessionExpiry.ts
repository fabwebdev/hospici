/**
 * useSessionExpiry — listens for `session:expiring` Socket.IO events and
 * manages the countdown / auto-logout state.
 *
 * The backend emits `session:expiring` with `expiresInSeconds` at the 25-min
 * idle mark (5 min warning before the 30-min hard timeout).
 *
 * Returns:
 *   expiresInSeconds — null when no pending expiry; positive number when
 *                      the warning dialog should be shown.
 *   dismiss          — call to dismiss (extends session implicitly via any
 *                      subsequent API call from the user).
 */

import { getSocket } from "@/lib/socket/socket.client";
import { useCallback, useEffect, useRef, useState } from "react";

export function useSessionExpiry() {
  const [expiresInSeconds, setExpiresInSeconds] = useState<number | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoLogoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onExpiredRef = useRef<(() => void) | null>(null);

  const clearTimers = useCallback(() => {
    if (countdownRef.current !== null) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
    if (autoLogoutRef.current !== null) {
      clearTimeout(autoLogoutRef.current);
      autoLogoutRef.current = null;
    }
  }, []);

  const dismiss = useCallback(() => {
    clearTimers();
    setExpiresInSeconds(null);
  }, [clearTimers]);

  // Allow the layout to register an onExpired callback without a dep-loop.
  const setOnExpired = useCallback((fn: () => void) => {
    onExpiredRef.current = fn;
  }, []);

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const handler = ({ expiresInSeconds: seconds }: { expiresInSeconds: number }) => {
      clearTimers();

      setExpiresInSeconds(seconds);

      // Tick countdown every second
      countdownRef.current = setInterval(() => {
        setExpiresInSeconds((prev) => {
          if (prev === null || prev <= 1) return null;
          return prev - 1;
        });
      }, 1_000);

      // Auto-logout when countdown hits zero
      autoLogoutRef.current = setTimeout(() => {
        clearTimers();
        setExpiresInSeconds(null);
        onExpiredRef.current?.();
      }, seconds * 1_000);
    };

    socket.on("session:expiring", handler);
    return () => {
      socket.off("session:expiring", handler);
      clearTimers();
    };
  }, [clearTimers]);

  return { expiresInSeconds, dismiss, setOnExpired };
}
