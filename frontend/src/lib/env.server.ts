/**
 * Server-only environment variables.
 * This file is .server.ts — Vite will never bundle it into the client.
 * Never prefix these with VITE_.
 */

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing server env var: ${key}`);
  return value;
}

export const env = {
  apiUrl: process.env.HOSPICI_API_URL ?? "http://localhost:3000",
  betterAuthSecret: required("BETTER_AUTH_SECRET"),
} as const;
