/**
 * Pino logging configuration — PHI redaction paths and logger factory.
 * All 18 HIPAA Safe Harbor identifiers are redacted from logs per HIPAA requirements.
 * Must remain a superset of PHI_FIELDS in phi-encryption.service.ts.
 */

export const phiRedactPaths = [
  "req.headers.authorization",
  "req.body.password",
  // Names
  "req.body.firstName",
  "req.body.lastName",
  // Dates
  "req.body.dob",
  // Phone & fax
  "req.body.phone",
  "req.body.faxNumber",
  // Email
  "req.body.email",
  // SSN (both field name variants)
  "req.body.ssn",
  "req.body.socialSecurityNumber",
  // Medical record & health plan IDs
  "req.body.mrn",
  "req.body.medicareId",
  "req.body.insuranceId",
  // Account & certificate numbers
  "req.body.accountNumber",
  "req.body.certificateLicenseNumber",
  // Device & vehicle identifiers
  "req.body.vehicleId",
  "req.body.deviceId",
  // URLs and IP addresses
  "req.body.url",
  "req.body.ipAddress",
  // Address
  "req.body.address",
  // Emergency contact
  "req.body.emergencyContact",
];

export function createLoggingConfig(opts: { logLevel: string; isDev: boolean }) {
  return {
    level: opts.logLevel,
    redact: phiRedactPaths,
    ...(opts.isDev ? { transport: { target: "pino-pretty", options: { colorize: true } } } : {}),
  };
}
