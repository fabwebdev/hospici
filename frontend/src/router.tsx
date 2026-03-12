// router.tsx
// TanStack Router configuration

import { createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

// Create query client
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 30 * 1000,
			retry: (count, error: any) => {
				if (error?.error?.code) return false; // API errors - don't retry
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
