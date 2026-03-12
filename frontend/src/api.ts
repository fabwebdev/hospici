// api.ts
// API router entry point for TanStack Start
// Referenced by app.config.ts routers.api.entry

import {
	createStartAPIHandler,
	defaultAPIFileRouteHandler,
} from "@tanstack/react-start/api";

export default createStartAPIHandler(defaultAPIFileRouteHandler);
