/**
 * Vitest global setup — runs before any test file is collected.
 * Sets dummy values for required server-side env vars so that
 * env.server.ts does not throw at module load time during tests.
 */

process.env.BETTER_AUTH_SECRET = "test-secret-for-vitest-do-not-use-in-production";
