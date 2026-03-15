/**
 * Server-only environment variables.
 * This file is .server.ts — Vite will never bundle it into the client.
 * Never prefix these with VITE_.
 */

function required(key: string): string {
  if (typeof process === "undefined" || !process.env) return "";
  const value = process.env[key];
  if (!value && typeof window === "undefined") {
    throw new Error(`Missing server env var: ${key}`);
  }
  return value ?? "";
}

export const env = {
  apiUrl: (typeof process !== "undefined" ? process.env.HOSPICI_API_URL : undefined) ?? "http://localhost:3000",
  betterAuthSecret: required("BETTER_AUTH_SECRET"),
} as const;
