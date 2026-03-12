// entry-server.tsx
// Server-side entry point

import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import { getRouter } from "./router";

export default createStartHandler(getRouter)(defaultStreamHandler);
