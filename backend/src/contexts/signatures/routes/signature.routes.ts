import type { FastifyInstance, FastifyReply } from "fastify";
import { Validators } from "../../../config/typebox-compiler.js";
import { db } from "../../../db/client.js";
import type {
  CountersignBody,
  CreateSignatureRequestBody,
  MarkExceptionBody,
  RejectSignatureBody,
  SignDocumentBody,
  SignatureListQuery,
  VoidSignatureBody,
} from "../schemas/signature.schema.js";
import { SignatureError, SignatureService } from "../services/signature.service.js";

// ── Shared helpers ────────────────────────────────────────────────────────────

function handleSignatureError(reply: FastifyReply, error: unknown): void {
  if (error instanceof SignatureError) {
    void reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
    });
    return;
  }
  throw error;
}

function makeService(): SignatureService {
  return new SignatureService({ db });
}

// ── Public routes (mounted at /api/v1/signatures) ─────────────────────────────

export async function signatureRoutes(fastify: FastifyInstance): Promise<void> {
  const signatureService = makeService();

  // ── Create Signature Request ──────────────────────────────────────────────

  fastify.post("/", {
    preValidation: [
      async (req, reply) => {
        if (!Validators.CreateSignatureRequestBody.Check(req.body)) {
          return reply.code(400).send({
            error: "VALIDATION_ERROR",
            errors: [...Validators.CreateSignatureRequestBody.Errors(req.body)].map((e) => ({
              path: e.path,
              message: e.message,
            })),
          });
        }
      },
    ],
    handler: async (request, reply) => {
      try {
        const body = request.body as CreateSignatureRequestBody;
        if (!request.user) return reply.code(401).send({ message: "Unauthorized" });
        const result = await signatureService.createSignatureRequest(
          body,
          request.user.id,
          request.user.locationId,
        );
        return reply.status(201).send(result);
      } catch (error) {
        handleSignatureError(reply, error);
      }
    },
  });

  // ── List Signature Requests ───────────────────────────────────────────────

  fastify.get("/", {
    handler: async (request, reply) => {
      try {
        const query = request.query as SignatureListQuery;
        if (!request.user) return reply.code(401).send({ message: "Unauthorized" });
        const result = await signatureService.listSignatures(query, request.user.locationId);
        return reply.send(result);
      } catch (error) {
        handleSignatureError(reply, error);
      }
    },
  });

  // ── Get Outstanding Signatures (Workbench) ────────────────────────────────

  fastify.get("/outstanding", {
    handler: async (request, reply) => {
      try {
        if (!request.user) return reply.code(401).send({ message: "Unauthorized" });
        const result = await signatureService.getOutstandingSignatures(request.user.locationId);
        return reply.send(result);
      } catch (error) {
        handleSignatureError(reply, error);
      }
    },
  });

  // ── Get Single Signature Request ──────────────────────────────────────────

  fastify.get("/:id", {
    handler: async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        if (!request.user) return reply.code(401).send({ message: "Unauthorized" });
        const result = await signatureService.getSignatureRequest(id, request.user.locationId);
        return reply.send(result);
      } catch (error) {
        handleSignatureError(reply, error);
      }
    },
  });

  // ── Send for Signature ────────────────────────────────────────────────────

  fastify.post("/:id/send", {
    handler: async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        if (!request.user) return reply.code(401).send({ message: "Unauthorized" });
        const result = await signatureService.sendForSignature(
          id,
          request.user.id,
          request.user.locationId,
        );
        return reply.send(result);
      } catch (error) {
        handleSignatureError(reply, error);
      }
    },
  });

  // ── Mark as Viewed ────────────────────────────────────────────────────────

  fastify.post("/:id/viewed", {
    handler: async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        if (!request.user) return reply.code(401).send({ message: "Unauthorized" });
        const result = await signatureService.markViewed(
          id,
          request.user.id,
          request.user.locationId,
        );
        return reply.send(result);
      } catch (error) {
        handleSignatureError(reply, error);
      }
    },
  });

  // ── Sign Document ─────────────────────────────────────────────────────────

  fastify.post("/:id/sign", {
    preValidation: [
      async (req, reply) => {
        if (!Validators.SignDocumentBody.Check(req.body)) {
          return reply.code(400).send({
            error: "VALIDATION_ERROR",
            errors: [...Validators.SignDocumentBody.Errors(req.body)].map((e) => ({
              path: e.path,
              message: e.message,
            })),
          });
        }
      },
    ],
    handler: async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const body = request.body as SignDocumentBody;
        if (!request.user) return reply.code(401).send({ message: "Unauthorized" });
        const ipAddress = request.ip;
        const userAgent = request.headers["user-agent"];
        const result = await signatureService.signDocument(
          id,
          body,
          request.user.id ?? null,
          request.user.locationId,
          ipAddress,
          userAgent,
        );
        return reply.send(result);
      } catch (error) {
        handleSignatureError(reply, error);
      }
    },
  });

  // ── Countersign Document ──────────────────────────────────────────────────

  fastify.post("/:id/countersign", {
    preValidation: [
      async (req, reply) => {
        if (!Validators.CountersignBody.Check(req.body)) {
          return reply.code(400).send({
            error: "VALIDATION_ERROR",
            errors: [...Validators.CountersignBody.Errors(req.body)].map((e) => ({
              path: e.path,
              message: e.message,
            })),
          });
        }
      },
    ],
    handler: async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const body = request.body as CountersignBody;
        if (!request.user) return reply.code(401).send({ message: "Unauthorized" });
        const ipAddress = request.ip;
        const userAgent = request.headers["user-agent"];
        const result = await signatureService.countersignDocument(
          id,
          body,
          request.user.id,
          request.user.locationId,
          ipAddress,
          userAgent,
        );
        return reply.send(result);
      } catch (error) {
        handleSignatureError(reply, error);
      }
    },
  });

  // ── Reject Signature ──────────────────────────────────────────────────────

  fastify.post("/:id/reject", {
    preValidation: [
      async (req, reply) => {
        if (!Validators.RejectSignatureBody.Check(req.body)) {
          return reply.code(400).send({
            error: "VALIDATION_ERROR",
            errors: [...Validators.RejectSignatureBody.Errors(req.body)].map((e) => ({
              path: e.path,
              message: e.message,
            })),
          });
        }
      },
    ],
    handler: async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const body = request.body as RejectSignatureBody;
        if (!request.user) return reply.code(401).send({ message: "Unauthorized" });
        const result = await signatureService.rejectSignature(
          id,
          body,
          request.user.id,
          request.user.locationId,
        );
        return reply.send(result);
      } catch (error) {
        handleSignatureError(reply, error);
      }
    },
  });

  // ── Void Signature ────────────────────────────────────────────────────────

  fastify.post("/:id/void", {
    preValidation: [
      async (req, reply) => {
        if (!Validators.VoidSignatureBody.Check(req.body)) {
          return reply.code(400).send({
            error: "VALIDATION_ERROR",
            errors: [...Validators.VoidSignatureBody.Errors(req.body)].map((e) => ({
              path: e.path,
              message: e.message,
            })),
          });
        }
      },
    ],
    handler: async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const body = request.body as VoidSignatureBody;
        if (!request.user) return reply.code(401).send({ message: "Unauthorized" });
        const result = await signatureService.voidSignature(
          id,
          body,
          request.user.id,
          request.user.locationId,
        );
        return reply.send(result);
      } catch (error) {
        handleSignatureError(reply, error);
      }
    },
  });

  // ── Mark No Signature Required ────────────────────────────────────────────

  fastify.post("/:id/exception", {
    preValidation: [
      async (req, reply) => {
        if (!Validators.MarkExceptionBody.Check(req.body)) {
          return reply.code(400).send({
            error: "VALIDATION_ERROR",
            errors: [...Validators.MarkExceptionBody.Errors(req.body)].map((e) => ({
              path: e.path,
              message: e.message,
            })),
          });
        }
      },
    ],
    handler: async (request, reply) => {
      try {
        const { id } = request.params as { id: string };
        const body = request.body as MarkExceptionBody;
        if (!request.user) return reply.code(401).send({ message: "Unauthorized" });
        const result = await signatureService.markNoSignatureRequired(
          id,
          body,
          request.user.id,
          request.user.locationId,
        );
        return reply.send(result);
      } catch (error) {
        handleSignatureError(reply, error);
      }
    },
  });

  // ── Verify Signature ──────────────────────────────────────────────────────

  fastify.get("/verify/:signatureId", {
    handler: async (request, reply) => {
      try {
        const { signatureId } = request.params as { signatureId: string };
        if (!request.user) return reply.code(401).send({ message: "Unauthorized" });
        const result = await signatureService.verifySignature(signatureId, request.user.locationId);
        return reply.send(result);
      } catch (error) {
        handleSignatureError(reply, error);
      }
    },
  });
}

// ── Patient-scoped routes ─────────────────────────────────────────────────────

export async function patientSignatureRoutes(fastify: FastifyInstance): Promise<void> {
  const signatureService = makeService();

  // Get signatures for a specific patient
  fastify.get("/", {
    handler: async (request, reply) => {
      try {
        const { patientId } = request.params as { patientId: string };
        const query = request.query as SignatureListQuery;
        if (!request.user) return reply.code(401).send({ message: "Unauthorized" });
        const result = await signatureService.listSignatures(
          { ...query, patientId },
          request.user.locationId,
        );
        return reply.send(result);
      } catch (error) {
        handleSignatureError(reply, error);
      }
    },
  });
}
