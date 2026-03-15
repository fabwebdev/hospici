// routes/__root.tsx
// Root route — providers, head content, session initialization

import appCss from "@/styles.css?url";
import { getCurrentSessionFn } from "@/functions/auth.functions.js";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HeadContent, Outlet, Scripts, createRootRouteWithContext } from "@tanstack/react-router";

// Router context type
export interface RouterContext {
  queryClient: QueryClient;
  session: {
    userId: string;
    role: string;
    locationId: string;
    locationIds: string[];
    permissions: string[];
    breakGlass: boolean;
    twoFactorEnabled: boolean;
    expiresAt: number;
  } | null;
}

// Root route definition
export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    links: [{ rel: "stylesheet", href: appCss }],
  }),
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
          {import.meta.env.DEV && (
            <>
              <script type="module" src="/_build/@vite/client" />
              <script
                type="module"
                dangerouslySetInnerHTML={{
                  __html: `
                    import RefreshRuntime from "/_build/@react-refresh";
                    RefreshRuntime.injectIntoGlobalHook(window);
                    window.$RefreshReg$ = () => {};
                    window.$RefreshSig$ = () => (type) => type;
                    window.__vite_plugin_react_preamble_installed__ = true;
                  `,
                }}
              />
              <script type="module" src="/_build/src/entry-client.tsx" />
            </>
          )}
        </body>
      </html>
    </QueryClientProvider>
  );
}
