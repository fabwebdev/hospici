// server.ts
// Fastify 5 application entry point

import { env } from "@/config/env.js";
import { createLoggingConfig } from "@/config/logging.config.js";
import hopeRoutes from "@/contexts/analytics/routes/hope.routes.js";
import billingRoutes from "@/contexts/billing/routes/billing.routes.js";
import patientRoutes from "@/contexts/clinical/routes/patient.routes.js";
import authRoutes from "@/contexts/identity/routes/auth.routes.js";
import schedulingRoutes from "@/contexts/scheduling/routes/scheduling.routes.js";
import { closeQueues, scheduleDailyJobs } from "@/jobs/queue.js";
import { createAideSupervisionWorker } from "@/jobs/workers/aide-supervision.worker.js";
import { createCapRecalculationWorker } from "@/jobs/workers/cap-recalculation.worker.js";
import { createHopeDeadlineCheckWorker } from "@/jobs/workers/hope-deadline-check.worker.js";
import { createHopeSubmissionWorker } from "@/jobs/workers/hope-submission.worker.js";
import { createHqrpPeriodCloseWorker } from "@/jobs/workers/hqrp-period-close.worker.js";
import { createNoeDeadlineWorker } from "@/jobs/workers/noe-deadline.worker.js";
import { registerRLSMiddleware } from "@/middleware/rls.middleware.js";
import socketPlugin from "@/plugins/socket.plugin.js";
import valkeyPlugin from "@/plugins/valkey.plugin.js";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";

/**
 * Build and configure the Fastify application
 */
export async function buildApp() {
  const fastify = Fastify({
    logger: createLoggingConfig({ logLevel: env.logLevel, isDev: env.isDev }),
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

  // ── Rate Limiting ─────────────────────────────────────────────────────────────
  await fastify.register(rateLimit, { max: 100, timeWindow: "1 minute" });

  // ── Infrastructure Plugins ──────────────────────────────────────────────────
  await fastify.register(valkeyPlugin);
  await fastify.register(socketPlugin);

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

  // ── API Routes ────────────────────────────────────────────────────────────────
  // Better Auth handler — delegates all /api/v1/auth/* to auth.handler()
  await fastify.register(authRoutes, {
    prefix: "/api/v1/auth",
    config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
  });
  await fastify.register(patientRoutes, { prefix: "/api/v1/patients" });
  await fastify.register(billingRoutes, { prefix: "/api/v1/billing" });
  await fastify.register(schedulingRoutes, { prefix: "/api/v1/scheduling" });
  await fastify.register(hopeRoutes, { prefix: "/api/v1/hope" });

  // ── BullMQ Workers ────────────────────────────────────────────────────────────
  // Workers are created after Fastify is fully configured so the logger is ready.
  const noeWorker = createNoeDeadlineWorker();
  const aideWorker = createAideSupervisionWorker();
  const hopeSubmissionWorker = createHopeSubmissionWorker();
  const hopeDeadlineWorker = createHopeDeadlineCheckWorker();
  const hqrpPeriodCloseWorker = createHqrpPeriodCloseWorker();
  const capRecalculationWorker = createCapRecalculationWorker();

  fastify.addHook("onClose", async () => {
    await noeWorker.close();
    await aideWorker.close();
    await hopeSubmissionWorker.close();
    await hopeDeadlineWorker.close();
    await hqrpPeriodCloseWorker.close();
    await capRecalculationWorker.close();
    await closeQueues();
    fastify.log.info("BullMQ workers and queues closed");
  });

  // Register repeatable daily jobs (deduplicates on restart)
  await scheduleDailyJobs();

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
