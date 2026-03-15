// server.ts
// Fastify 5 application entry point

import { env } from "@/config/env.js";
import { createLoggingConfig } from "@/config/logging.config.js";
import hopeRoutes, { analyticsRoutes } from "@/contexts/analytics/routes/hope.routes.js";
import qualityAnalyticsRoutes from "@/contexts/analytics/routes/qualityAnalytics.routes.js";
import billingRoutes from "@/contexts/billing/routes/billing.routes.js";
import capRoutes from "@/contexts/billing/routes/cap.routes.js";
import { claimRoutes } from "@/contexts/billing/routes/claim.routes.js";
import { claimAuditRoutes } from "@/contexts/billing/routes/claimAudit.routes.js";
import noePatientRoutes, { noeStandaloneRoutes } from "@/contexts/billing/routes/noe.routes.js";
import { setClaimEventEmitter } from "@/contexts/billing/services/claim.service.js";
import { setClaimAuditEventEmitter } from "@/contexts/billing/services/claimAudit.service.js";
import assessmentRoutes from "@/contexts/clinical/routes/assessment.routes.js";
import carePlanRoutes from "@/contexts/clinical/routes/carePlan.routes.js";
import careTeamRoutes from "@/contexts/clinical/routes/careTeam.routes.js";
import medicationRoutes from "@/contexts/clinical/routes/medication.routes.js";
import myDashboardRoutes from "@/contexts/clinical/routes/my-dashboard.routes.js";
import noteReviewRoutes from "@/contexts/clinical/routes/noteReview.routes.js";
import patientConditionsRoutes from "@/contexts/clinical/routes/patient-conditions.routes.js";
import patientInsuranceRoutes from "@/contexts/clinical/routes/patient-insurance.routes.js";
import patientRoutes from "@/contexts/clinical/routes/patient.routes.js";
import vantageChartRoutes from "@/contexts/clinical/routes/vantageChart.routes.js";
import teamCommRoutes from "@/contexts/communication/routes/teamComm.routes.js";
import alertRoutes from "@/contexts/compliance/routes/alert.routes.js";
import auditExportRoutes from "@/contexts/compliance/routes/auditExport.routes.js";
import chartAuditRoutes from "@/contexts/compliance/routes/chartAudit.routes.js";
import documentRoutes from "@/contexts/documentation/routes/document.routes.js";
import { f2fPatientRoutes, f2fStandaloneRoutes } from "@/contexts/f2f/routes/f2f.routes.js";
import fhirRoutes from "@/contexts/fhir/routes/fhir.routes.js";
import authRoutes from "@/contexts/identity/routes/auth.routes.js";
import { orderPatientRoutes, orderRoutes } from "@/contexts/orders/routes/order.routes.js";
import { setOrderEventEmitter } from "@/contexts/orders/services/order.service.js";
import qapiRoutes from "@/contexts/qapi/routes/qapi.routes.js";
import { idgMeetingsRoutes, patientIdgRoutes } from "@/contexts/scheduling/routes/idg.routes.js";
import schedulingRoutes from "@/contexts/scheduling/routes/scheduling.routes.js";
import visitSchedulePatientRoutes, {
  visitScheduleStandaloneRoutes,
} from "@/contexts/scheduling/routes/visitSchedule.routes.js";
import {
  patientSignatureRoutes,
  signatureRoutes,
} from "@/contexts/signatures/routes/signature.routes.js";
import { vendorRoutes } from "@/contexts/vendors/routes/vendor.routes.js";
import { db } from "@/db/client.js";
import { complianceEvents } from "@/events/compliance-events.js";
import { closeQueues, scheduleDailyJobs } from "@/jobs/queue.js";
import { createAideSupervisionWorker } from "@/jobs/workers/aide-supervision.worker.js";
import { createAuditExportWorker } from "@/jobs/workers/audit-export.worker.js";
import { createCapRecalculationWorker } from "@/jobs/workers/cap-recalculation.worker.js";
import { createClaimSubmissionWorker } from "@/jobs/workers/claim-submission.worker.js";
import { createF2FDeadlineWorker } from "@/jobs/workers/f2f-deadline-check.worker.js";
import { createHopeDeadlineCheckWorker } from "@/jobs/workers/hope-deadline-check.worker.js";
import { createHopeSubmissionWorker } from "@/jobs/workers/hope-submission.worker.js";
import { createHqrpPeriodCloseWorker } from "@/jobs/workers/hqrp-period-close.worker.js";
import { createMissedVisitCheckWorker } from "@/jobs/workers/missed-visit-check.worker.js";
import { createNoeDeadlineWorker } from "@/jobs/workers/noe-deadline.worker.js";
import { createNoteReviewDeadlineWorker } from "@/jobs/workers/note-review-deadline.worker.js";
import { createOrderExpiryWorker } from "@/jobs/workers/order-expiry-check.worker.js";
import { createOrderReminderWorker } from "@/jobs/workers/order-reminder.worker.js";
import { createQAPIOverdueCheckWorker } from "@/jobs/workers/qapi-overdue-check.worker.js";
import { createVendorComplianceWorker } from "@/jobs/workers/vendor-compliance-check.worker.js";
import { registerRLSMiddleware } from "@/middleware/rls.middleware.js";
import socketPlugin from "@/plugins/socket.plugin.js";
import valkeyPlugin from "@/plugins/valkey.plugin.js";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { sql } from "drizzle-orm";
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

  // ── Global Error Handler ───────────────────────────────────────────────────
  // Ensures all error responses match ErrorResponseSchema ({ success, error })
  // and prevents Fastify's FST_ERR_FAILED_ERROR_SERIALIZATION crashes.
  fastify.setErrorHandler((error, _request, reply) => {
    const statusCode = error.statusCode ?? 500;
    fastify.log.error(error, "Request error");
    // Use reply.header + reply.serializer to bypass route-level response schema
    // serialization which fails on Type.Literal(false) with fast-json-stringify.
    reply
      .code(statusCode)
      .header("content-type", "application/json; charset=utf-8")
      .serializer((payload: unknown) => JSON.stringify(payload))
      .send({
        success: false,
        error: {
          code: error.code ?? "INTERNAL_ERROR",
          message: error.message,
        },
      });
  });

  // ── Infrastructure Plugins ──────────────────────────────────────────────────
  await fastify.register(valkeyPlugin);
  await fastify.register(socketPlugin);

  // ── Socket.IO event emitter wiring ──────────────────────────────────────────
  // Wire service-level emitters to the shared compliance event bus so that
  // Socket.IO clients receive real-time billing events (T3-7a, T3-12).
  setClaimEventEmitter(complianceEvents);
  setClaimAuditEventEmitter(complianceEvents);
  // Wire order events to the compliance event bus (T3-9)
  setOrderEventEmitter(complianceEvents);

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
  await fastify.register(assessmentRoutes, { prefix: "/api/v1/patients" });
  await fastify.register(carePlanRoutes, { prefix: "/api/v1/patients" });
  await fastify.register(medicationRoutes, { prefix: "/api/v1/patients" });
  await fastify.register(careTeamRoutes, { prefix: "/api/v1/patients" });
  await fastify.register(patientConditionsRoutes, { prefix: "/api/v1/patients" });
  await fastify.register(patientInsuranceRoutes, { prefix: "/api/v1/patients" });
  await fastify.register(documentRoutes, { prefix: "/api/v1/patients" });
  await fastify.register(teamCommRoutes, { prefix: "/api/v1/patients" });
  await fastify.register(vantageChartRoutes, { prefix: "/api/v1/patients" });
  await fastify.register(billingRoutes, { prefix: "/api/v1/billing" });
  await fastify.register(noePatientRoutes, { prefix: "/api/v1/patients" });
  await fastify.register(noeStandaloneRoutes, { prefix: "/api/v1" });
  await fastify.register(schedulingRoutes, { prefix: "/api/v1/scheduling" });
  await fastify.register(idgMeetingsRoutes, { prefix: "/api/v1/idg-meetings" });
  await fastify.register(patientIdgRoutes, { prefix: "/api/v1/patients" });
  await fastify.register(hopeRoutes, { prefix: "/api/v1/hope" });
  await fastify.register(analyticsRoutes, { prefix: "/api/v1/analytics" });
  await fastify.register(alertRoutes, { prefix: "/api/v1/alerts" });
  await fastify.register(myDashboardRoutes, { prefix: "/api/v1/my" });
  await fastify.register(noteReviewRoutes, { prefix: "/api/v1" });
  await fastify.register(visitSchedulePatientRoutes, { prefix: "/api/v1/patients" });
  await fastify.register(visitScheduleStandaloneRoutes, { prefix: "/api/v1/scheduled-visits" });
  await fastify.register(f2fPatientRoutes, { prefix: "/api/v1/patients" });
  await fastify.register(f2fStandaloneRoutes, { prefix: "/api/v1" });
  await fastify.register(capRoutes, { prefix: "/api/v1/cap" });
  await fastify.register(signatureRoutes, { prefix: "/api/v1/signatures" });
  await fastify.register(patientSignatureRoutes, {
    prefix: "/api/v1/patients/:patientId/signatures",
  });
  await fastify.register(fhirRoutes, { prefix: "/fhir/r4" });
  await fastify.register(claimRoutes, { prefix: "/api/v1" });
  await fastify.register(claimAuditRoutes, { prefix: "/api/v1" });
  await fastify.register(vendorRoutes, { prefix: "/api/v1/vendors" });
  await fastify.register(orderRoutes, { prefix: "/api/v1" });
  await fastify.register(orderPatientRoutes, { prefix: "/api/v1/patients" });
  await fastify.register(auditExportRoutes, { prefix: "/api/v1/patients" });
  await fastify.register(qapiRoutes, { prefix: "/api/v1/qapi" });
  await fastify.register(chartAuditRoutes, { prefix: "/api/v1" });
  await fastify.register(qualityAnalyticsRoutes, { prefix: "/api/v1/analytics" });

  // ── Internal PHI Encryption Health Check ─────────────────────────────────
  // 127.0.0.1 only — not exposed through reverse proxy or auth middleware.
  fastify.get(
    "/api/v1/health/phi-encryption",
    {
      schema: {
        tags: ["System"],
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
              message: { type: "string" },
            },
          },
          403: {
            type: "object",
            properties: { error: { type: "string" } },
          },
        },
      },
    },
    async (req, reply) => {
      const addr = req.socket.remoteAddress;
      if (addr !== "127.0.0.1" && addr !== "::1") {
        return reply.code(403).send({ error: "Forbidden" });
      }
      try {
        const testValue = "phi-encryption-health-check";
        const encResult = await db.execute(
          sql`SELECT pgp_sym_encrypt(${testValue}, ${env.phiEncryptionKey}) AS encrypted`,
        );
        const encVal = (encResult.rows[0] as Record<string, string>).encrypted;
        const decResult = await db.execute(
          sql`SELECT pgp_sym_decrypt(${encVal}::bytea, ${env.phiEncryptionKey}) AS decrypted`,
        );
        const decVal = (decResult.rows[0] as Record<string, string>).decrypted;
        const pass = decVal === testValue;
        return reply.send({
          status: pass ? "pass" : "fail",
          message: pass ? "PHI encryption operational" : "Decryption mismatch",
        });
      } catch (err) {
        fastify.log.error(err, "PHI encryption health check failed");
        return reply.send({ status: "fail", message: "PHI encryption error" });
      }
    },
  );

  // ── BullMQ Workers ────────────────────────────────────────────────────────────
  // Workers are created after Fastify is fully configured so the logger is ready.
  const noeWorker = createNoeDeadlineWorker(fastify.valkey);
  const aideWorker = createAideSupervisionWorker(fastify.valkey);
  const hopeSubmissionWorker = createHopeSubmissionWorker();
  const hopeDeadlineWorker = createHopeDeadlineCheckWorker();
  const hqrpPeriodCloseWorker = createHqrpPeriodCloseWorker();
  const capRecalculationWorker = createCapRecalculationWorker(fastify.valkey);
  const noteReviewDeadlineWorker = createNoteReviewDeadlineWorker(fastify.valkey);
  const missedVisitCheckWorker = createMissedVisitCheckWorker(fastify.valkey);
  const f2fDeadlineWorker = createF2FDeadlineWorker(fastify.valkey);
  const claimSubmissionWorker = createClaimSubmissionWorker(fastify.valkey);
  const vendorComplianceWorker = createVendorComplianceWorker(fastify.valkey);
  const orderExpiryWorker = createOrderExpiryWorker(fastify.valkey);
  const orderReminderWorker = createOrderReminderWorker(fastify.valkey);
  const auditExportWorker = createAuditExportWorker(fastify.valkey);
  const qapiOverdueWorker = createQAPIOverdueCheckWorker(fastify.valkey);

  fastify.addHook("onClose", async () => {
    await noeWorker.close();
    await aideWorker.close();
    await hopeSubmissionWorker.close();
    await hopeDeadlineWorker.close();
    await hqrpPeriodCloseWorker.close();
    await capRecalculationWorker.close();
    await noteReviewDeadlineWorker.close();
    await missedVisitCheckWorker.close();
    await f2fDeadlineWorker.close();
    await claimSubmissionWorker.close();
    await vendorComplianceWorker.close();
    await orderExpiryWorker.close();
    await orderReminderWorker.close();
    await auditExportWorker.close();
    await qapiOverdueWorker.close();
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
