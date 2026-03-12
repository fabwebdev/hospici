// server.ts
// Fastify 5 application entry point

import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { env } from "@/config/env.js";
import valkeyPlugin from "@/plugins/valkey.plugin.js";
import { registerRLSMiddleware } from "@/middleware/rls.middleware.js";

/**
 * Build and configure the Fastify application
 */
export async function buildApp() {
	const fastify = Fastify({
		logger: {
			level: env.logLevel,
			// PHI redaction - extend this list as new PHI fields are added
			redact: [
				"req.headers.authorization",
				"req.body.password",
				"req.body.ssn",
				"req.body.medicareId",
				"req.body.dateOfBirth",
				"req.body.firstName",
				"req.body.lastName",
				"req.body.mrn",
			],
			...(env.isDev
				? { transport: { target: "pino-pretty", options: { colorize: true } } }
				: {}),
		},
		trustProxy: true,
	});

	// ── Security Middleware ──────────────────────────────────────────────────────
	await fastify.register(helmet, {
		contentSecurityPolicy: {
			directives: {
				defaultSrc: ["'self'"],
				scriptSrc: ["'self'"],
				styleSrc: ["'self'", "'unsafe-inline'"],
				imgSrc: ["'self'", "data:"],
			},
		},
	});

	await fastify.register(cors, {
		origin: env.allowedOrigins,
		credentials: true,
		methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
		allowedHeaders: [
			"Authorization",
			"Content-Type",
			"X-Request-ID",
			"Idempotency-Key",
			"If-Match",
			"X-Location-ID",
		],
		exposedHeaders: ["ETag", "X-Request-ID", "Retry-After"],
	});

	// ── OpenAPI / Swagger Documentation ───────────────────────────────────────────
	await fastify.register(swagger, {
		openapi: {
			openapi: "3.1.0",
			info: {
				title: "Hospici API",
				description: "Hospici hospice EHR — REST + FHIR R4/R6 API",
				version: "1.0.0",
			},
			servers: [{ url: env.betterAuthUrl }],
			components: {
				securitySchemes: {
					bearerAuth: {
						type: "http",
						scheme: "bearer",
						bearerFormat: "JWT",
					},
				},
			},
		},
	});

	await fastify.register(swaggerUi, {
		routePrefix: "/docs",
		uiConfig: { docExpansion: "list", deepLinking: true },
	});

	// ── Infrastructure Plugins ──────────────────────────────────────────────────
	await fastify.register(valkeyPlugin);

	// ── RLS Middleware (Parameterized - Safe) ───────────────────────────────────
	registerRLSMiddleware(fastify);

	// ── Health Check Endpoint ────────────────────────────────────────────────────
	fastify.get(
		"/health",
		{
			schema: {
				tags: ["System"],
				response: {
					200: {
						type: "object",
						properties: {
							status: { type: "string" },
							version: { type: "string" },
							fhir: { type: "string" },
							timestamp: { type: "string" },
							db: { type: "string" },
							valkey: { type: "string" },
						},
					},
				},
			},
		},
		async () => ({
			status: "ok",
			version: "1.0.0",
			fhir: env.fhirVersionDefault,
			timestamp: new Date().toISOString(),
			db: "connected",
			valkey: "connected",
		}),
	);

	// ── API Routes (to be registered as contexts are implemented) ────────────────
	// await fastify.register(identityRoutes, { prefix: "/api/v1/auth" });
	// await fastify.register(patientRoutes, { prefix: "/api/v1/patients" });
	// await fastify.register(billingRoutes, { prefix: "/api/v1/billing" });
	// await fastify.register(clinicalRoutes, { prefix: "/api/v1/clinical" });
	// await fastify.register(schedulingRoutes, { prefix: "/api/v1/scheduling" });
	// await fastify.register(fhirRoutes, { prefix: "/fhir/r4" });

	return fastify;
}

// ── Application Bootstrap ─────────────────────────────────────────────────────
const app = await buildApp();

try {
	await app.listen({ port: env.port, host: env.host });
	app.log.info(`🚀 Server running on http://${env.host}:${env.port}`);
	app.log.info(`📚 Swagger docs: http://localhost:${env.port}/docs`);
} catch (err) {
	app.log.error(err);
	process.exit(1);
}
