import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import Valkey from "iovalkey";
import { env } from "@/config/env.ts";

declare module "fastify" {
  interface FastifyInstance {
    valkey: Valkey;
  }
}

async function valkeyPlugin(fastify: FastifyInstance) {
  const client = new Valkey({
    host: env.valkeyHost,
    port: env.valkeyPort,
    password: env.valkeyPassword || undefined,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  client.on("error", (err) => {
    fastify.log.error({ err }, "Valkey connection error");
  });

  client.on("connect", () => {
    fastify.log.info("Valkey connected");
  });

  await client.ping();

  fastify.decorate("valkey", client);

  fastify.addHook("onClose", async () => {
    await client.quit();
    fastify.log.info("Valkey disconnected");
  });
}

export default fp(valkeyPlugin, { name: "valkey" });
