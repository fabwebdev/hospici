// entry-client.tsx
// Client-side entry point

import { StartClient } from "@tanstack/react-start/client";
import { getRouter } from "./router";
import { hydrateRoot } from "react-dom/client";

hydrateRoot(document, <StartClient router={getRouter()} />);
