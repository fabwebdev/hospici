// routes/__root.tsx
// Root route — providers, head content, session initialization

import {
  createRootRouteWithContext,
  Outlet,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { getCurrentSessionFn } from "@/functions/auth.functions.js";

// Router context type
export interface RouterContext {
  queryClient: QueryClient;
  session: {
    userId: string;
    email: string;
    role: string;
    locationId: string;
    locationIds: string[];
    permissions: string[];
    breakGlass: boolean;
  } | null;
}

// Root route definition
export const Route = createRootRouteWithContext<RouterContext>()({
  beforeLoad: async () => {
    const session = await getCurrentSessionFn();
    return { session };
  },
  component: RootComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <html lang="en">
        <head>
          <meta charSet="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Hospici — Hospice EHR</title>
          <HeadContent />
        </head>
        <body>
          <Outlet />
          <Scripts />
        </body>
      </html>
    </QueryClientProvider>
  );
}
