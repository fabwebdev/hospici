/**
 * Client-safe environment variables.
 * All values here come from VITE_* prefixed vars — safe to use in browser code.
 */

export const clientEnv = {
  socketUrl: import.meta.env.VITE_SOCKET_URL ?? "ws://localhost:3000",
  appVersion: import.meta.env.VITE_APP_VERSION ?? "dev",
} as const;
