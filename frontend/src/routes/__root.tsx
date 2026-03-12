// routes/__root.tsx
// Root route - providers, head content, session initialization

import { createRootRouteWithContext, Outlet, HeadContent, Scripts } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";

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
	// Load session on every navigation
	beforeLoad: async () => {
		// In production, this would call getCurrentSessionFn()
		// For scaffolding, return null (unauthenticated)
		return { session: null };
	},
	component: RootComponent,
});

function RootComponent() {
	return (
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
	);
}
