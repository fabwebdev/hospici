// routes/_authed/dashboard.tsx
// Main dashboard view

import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_authed/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Active Patients</h3>
          <p className="mt-2 text-3xl font-bold text-blue-600">127</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Pending NOEs</h3>
          <p className="mt-2 text-3xl font-bold text-yellow-600">3</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">IDG Due</h3>
          <p className="mt-2 text-3xl font-bold text-red-600">2</p>
        </div>
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-sm font-medium text-gray-500">Cap Utilization</h3>
          <p className="mt-2 text-3xl font-bold text-green-600">72%</p>
        </div>
      </div>

      {/* Alerts Section */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-medium text-gray-900">Compliance Alerts</h2>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            <div className="flex items-center p-4 bg-red-50 border border-red-200 rounded-md">
              <div className="flex-shrink-0">
                <span className="text-red-400">⚠️</span>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">IDG Overdue</h3>
                <p className="text-sm text-red-700">
                  Patient John Doe - IDG meeting is 2 days overdue
                </p>
              </div>
            </div>
            <div className="flex items-center p-4 bg-yellow-50 border border-yellow-200 rounded-md">
              <div className="flex-shrink-0">
                <span className="text-yellow-400">⏰</span>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-yellow-800">NOE Deadline</h3>
                <p className="text-sm text-yellow-700">
                  Patient Jane Smith - NOE must be filed by tomorrow
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
