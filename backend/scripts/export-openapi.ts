/**
 * export-openapi.ts
 *
 * Builds the Fastify app (without listening), calls fastify.swagger() to
 * extract the fully-resolved OpenAPI spec, and writes it as pretty-printed
 * JSON to the monorepo root at ../../openapi.json.
 *
 * Usage:
 *   pnpm --filter @hospici/backend generate:openapi
 */

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "../src/server.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const fastify = await buildApp();

await fastify.ready();

const spec = fastify.swagger();

const outputPath = resolve(__dirname, "../../openapi.json");

writeFileSync(outputPath, JSON.stringify(spec, null, 2), "utf-8");

process.stdout.write(`OpenAPI spec written to ${outputPath}\n`);

await fastify.close();

process.exit(0);
