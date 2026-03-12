// routes/_authed.tsx
// Protected layout route — all children require authentication

import { Link, Outlet, createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed")({
  beforeLoad: ({ context }) => {
    if (!context.session) {
      throw redirect({
        to: "/login",
        search: { redirect: typeof window !== "undefined" ? window.location.href : "" },
      });
    }
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <span className="text-xl font-bold text-blue-600">Hospici</span>
              <div className="ml-10 flex space-x-4">
                <Link to="/dashboard" className="px-3 py-2 text-gray-700 hover:text-blue-600">
                  Dashboard
                </Link>
                <Link to="/patients" className="px-3 py-2 text-gray-700 hover:text-blue-600">
                  Patients
                </Link>
                {/* TODO T2-4: replace with <Link> once route is implemented */}
                <a href="/scheduling/idg" className="px-3 py-2 text-gray-700 hover:text-blue-600">
                  IDG
                </a>
                {/* TODO T3-7: replace with <Link> once route is implemented */}
                <a href="/billing" className="px-3 py-2 text-gray-700 hover:text-blue-600">
                  Billing
                </a>
              </div>
            </div>
            <div className="flex items-center">
              <span className="text-sm text-gray-500">Dr. Smith</span>
            </div>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
