// routes/login.tsx
// Public login route

import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/login")({
	// Redirect to dashboard if already authenticated
	beforeLoad: ({ context }) => {
		if (context.session) {
			throw redirect({ to: "/dashboard" });
		}
	},
	component: LoginPage,
});

function LoginPage() {
	return (
		<div className="min-h-screen flex items-center justify-center bg-gray-50">
			<div className="max-w-md w-full p-8 bg-white rounded-lg shadow-md">
				<h1 className="text-2xl font-bold mb-6 text-center">Hospici Login</h1>
				<form className="space-y-4">
					<div>
						<label htmlFor="email" className="block text-sm font-medium text-gray-700">
							Email
						</label>
						<input
							type="email"
							id="email"
							className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
							placeholder="you@hospici.com"
						/>
					</div>
					<div>
						<label htmlFor="password" className="block text-sm font-medium text-gray-700">
							Password
						</label>
						<input
							type="password"
							id="password"
							className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
						/>
					</div>
					<button
						type="submit"
						className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
					>
						Sign In
					</button>
				</form>
			</div>
		</div>
	);
}
