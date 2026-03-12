// api.ts
// Vinxi API router entry point — referenced by app.config.ts routers.api.entry
// All application API calls go to the separate Fastify backend.
// Server functions (createServerFn) are handled via the SSR router, not here.

import { defineEventHandler } from "vinxi/http";

export default defineEventHandler(() => new Response("Not Found", { status: 404 }));
