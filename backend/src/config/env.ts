/**
 * Environment configuration — validated at startup.
 * Throws immediately if required variables are missing so the server
 * never starts in a misconfigured state.
 */

function required(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  nodeEnv: optional("NODE_ENV", "development"),
  port: Number(optional("PORT", "3000")),
  host: optional("HOST", "0.0.0.0"),
  logLevel: optional("LOG_LEVEL", "info"),

  databaseUrl: required("DATABASE_URL"),
  directDatabaseUrl: optional("DIRECT_DATABASE_URL", required("DATABASE_URL")),

  valkeyHost: optional("VALKEY_HOST", "localhost"),
  valkeyPort: Number(optional("VALKEY_PORT", "6379")),
  valkeyPassword: optional("VALKEY_PASSWORD", ""),

  betterAuthSecret: required("BETTER_AUTH_SECRET"),
  betterAuthUrl: optional("BETTER_AUTH_URL", "http://localhost:3000"),

  phiEncryptionKey: required("PHI_ENCRYPTION_KEY"),
  phiEncryptionIv: required("PHI_ENCRYPTION_IV"),

  allowedOrigins: optional(
    "ALLOWED_ORIGINS",
    "http://localhost:5173"
  ).split(","),

  fhirBaseUrl: optional("FHIR_BASE_URL", "http://localhost:3000/fhir/r4"),
  fhirVersionDefault: optional("FHIR_VERSION_DEFAULT", "4.0"),

  smartJwksUrl: optional("SMART_JWKS_URL", "http://localhost:3000/.well-known/jwks.json"),
  smartClientId: optional("SMART_CLIENT_ID", "hospici-local-dev"),

  smtpHost: optional("SMTP_HOST", "localhost"),
  smtpPort: Number(optional("SMTP_PORT", "1025")),
  smtpUser: optional("SMTP_USER", ""),
  smtpPass: optional("SMTP_PASS", ""),
  smtpFrom: optional("SMTP_FROM", "noreply@hospici.local"),

  features: {
    fhirR6: optional("FEATURE_FHIR_R6_ENABLED", "false") === "true",
    bulkExport: optional("FEATURE_BULK_EXPORT_ENABLED", "false") === "true",
    aiClinicalNotes: optional("FEATURE_AI_CLINICAL_NOTES", "false") === "true",
  },

  isDev: optional("NODE_ENV", "development") === "development",
  isTest: optional("NODE_ENV", "development") === "test",
  isProd: optional("NODE_ENV", "development") === "production",
} as const;
