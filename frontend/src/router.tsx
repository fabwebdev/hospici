// router.tsx
// TanStack Router configuration

import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

/** API error shape returned by backend */
interface ApiError {
  error?: {
    code?: string;
  };
}

/** Type guard to check if error is an API error with code */
function isApiError(error: unknown): error is ApiError {
  if (typeof error !== "object" || error === null) return false;
  const err = error as ApiError;
  if (typeof err.error !== "object" || err.error === null) return false;
  return "code" in err.error;
}

// Create query client
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000,
      retry: (count, error: unknown) => {
        if (isApiError(error)) return false; // API errors - don't retry
        return count < 2;
      },
    },
    mutations: {
      retry: false, // Never auto-retry - risk of duplicate clinical submissions
    },
  },
});

// Create router
export function getRouter() {
  return createRouter({
    routeTree,
    context: { queryClient, session: null },
    scrollRestoration: true,
    defaultPreload: "intent",
  });
}

// Register router types
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
