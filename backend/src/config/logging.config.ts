/**
 * Pino logging configuration — PHI redaction paths and logger factory.
 * All 10 PHI fields are redacted from logs per HIPAA requirements.
 */

export const phiRedactPaths = [
	"req.headers.authorization",
	"req.body.password",
	"req.body.firstName",
	"req.body.lastName",
	"req.body.dob",
	"req.body.ssn",
	"req.body.medicareId",
	"req.body.address",
	"req.body.phone",
	"req.body.email",
	"req.body.emergencyContact",
	"req.body.insuranceId",
];

export function createLoggingConfig(opts: { logLevel: string; isDev: boolean }) {
	return {
		level: opts.logLevel,
		redact: phiRedactPaths,
		...(opts.isDev
			? { transport: { target: "pino-pretty", options: { colorize: true } } }
			: {}),
	};
}
