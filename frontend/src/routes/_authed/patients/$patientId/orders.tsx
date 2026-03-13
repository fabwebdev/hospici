// routes/_authed/patients/$patientId/orders.tsx
// T3-9: Patient Orders Tab — list all orders for a patient, create new orders

import { createOrderFn, getPatientOrdersFn } from "@/functions/orders.functions.js";
import { computeOrderUrgency } from "@/lib/order-urgency.js";
import type { CreateOrderInput, OrderDeliveryMethod, OrderListResponse, OrderResponse, OrderType } from "@hospici/shared-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_authed/patients/$patientId/orders")({
  component: PatientOrdersPage,
});

const ORDER_TYPE_OPTIONS: { value: OrderType; label: string }[] = [
  { value: "VERBAL", label: "Verbal Order" },
  { value: "DME", label: "DME Order" },
  { value: "FREQUENCY_CHANGE", label: "Frequency Change" },
  { value: "MEDICATION", label: "Medication Order" },
  { value: "F2F_DOCUMENTATION", label: "F2F Documentation" },
];

const DELIVERY_METHOD_OPTIONS: { value: OrderDeliveryMethod; label: string }[] = [
  { value: "PORTAL", label: "Portal" },
  { value: "FAX", label: "Fax" },
  { value: "MAIL", label: "Mail" },
  { value: "COURIER", label: "Courier" },
];

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-gray-100 text-gray-600",
  PENDING_SIGNATURE: "bg-yellow-100 text-yellow-800",
  VIEWED: "bg-blue-100 text-blue-800",
  SIGNED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  EXPIRED: "bg-gray-100 text-gray-700",
  VOIDED: "bg-gray-100 text-gray-500",
  NO_SIGNATURE_REQUIRED: "bg-purple-100 text-purple-800",
  COMPLETED_RETURNED: "bg-teal-100 text-teal-800",
};

const ORDER_TYPE_BADGE: Record<string, string> = {
  VERBAL: "bg-orange-100 text-orange-800",
  DME: "bg-blue-100 text-blue-800",
  FREQUENCY_CHANGE: "bg-purple-100 text-purple-800",
  MEDICATION: "bg-green-100 text-green-800",
  F2F_DOCUMENTATION: "bg-red-100 text-red-800",
};

interface CreateOrderFormState {
  type: OrderType;
  content: string;
  dueAt: string;
  physicianId: string;
  verbalReadBackFlag: boolean;
  deliveryMethod: OrderDeliveryMethod | "";
}

const DEFAULT_FORM: CreateOrderFormState = {
  type: "VERBAL",
  content: "",
  dueAt: "",
  physicianId: "",
  verbalReadBackFlag: false,
  deliveryMethod: "",
};

function OrderRow({ order }: { order: OrderResponse }) {
  const urgency = computeOrderUrgency(order.dueAt, order.status);

  return (
    <tr className="border-b border-gray-100 hover:bg-gray-50">
      <td className="py-3 px-4">
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${ORDER_TYPE_BADGE[order.type] ?? "bg-gray-100"}`}
        >
          {order.type.replace(/_/g, " ")}
        </span>
      </td>
      <td className="py-3 px-4">
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[order.status] ?? "bg-gray-100"}`}
        >
          {order.status.replace(/_/g, " ")}
        </span>
      </td>
      <td className="py-3 px-4 text-sm text-gray-700 max-w-xs truncate">
        {order.content}
      </td>
      <td className="py-3 px-4 text-sm text-gray-500">
        {new Date(order.dueAt).toLocaleDateString("en-US", { dateStyle: "medium" })}
      </td>
      <td className="py-3 px-4">
        {urgency.label && (
          <span className={`text-xs font-semibold ${urgency.color}`}>
            {urgency.label}
          </span>
        )}
      </td>
      <td className="py-3 px-4">
        {order.blockedDownstream && (
          <span className="text-xs text-amber-600 font-medium">
            {order.blockedDownstream}
          </span>
        )}
      </td>
    </tr>
  );
}

function CreateOrderModal({
  patientId,
  onClose,
}: {
  patientId: string;
  onClose: () => void;
}) {
  const [form, setForm] = useState<CreateOrderFormState>(DEFAULT_FORM);
  const queryClient = useQueryClient();

  const { mutate, isPending, error } = useMutation({
    mutationFn: (input: CreateOrderInput) => createOrderFn({ data: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["patient-orders", patientId] });
      onClose();
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const input: CreateOrderInput = {
      type: form.type,
      patientId,
      content: form.content,
      dueAt: new Date(form.dueAt).toISOString(),
      verbalReadBackFlag: form.verbalReadBackFlag,
      ...(form.physicianId ? { physicianId: form.physicianId } : {}),
      ...(form.deliveryMethod ? { deliveryMethod: form.deliveryMethod } : {}),
    };
    mutate(input);
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Create Order</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Order Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Order Type <span className="text-red-500">*</span>
            </label>
            <select
              required
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as OrderType }))}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ORDER_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Order Content <span className="text-red-500">*</span>
            </label>
            <textarea
              required
              rows={3}
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              placeholder="Describe the order..."
            />
          </div>

          {/* Due At */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Due Date <span className="text-red-500">*</span>
            </label>
            <input
              type="datetime-local"
              required
              value={form.dueAt}
              onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Physician ID */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Physician ID (UUID)
            </label>
            <input
              type="text"
              value={form.physicianId}
              onChange={(e) => setForm((f) => ({ ...f, physicianId: e.target.value }))}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </div>

          {/* Delivery Method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Delivery Method
            </label>
            <select
              value={form.deliveryMethod}
              onChange={(e) =>
                setForm((f) => ({ ...f, deliveryMethod: e.target.value as OrderDeliveryMethod | "" }))
              }
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">-- Select --</option>
              {DELIVERY_METHOD_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Verbal Read-Back */}
          {form.type === "VERBAL" && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="verbalReadBack"
                checked={form.verbalReadBackFlag}
                onChange={(e) =>
                  setForm((f) => ({ ...f, verbalReadBackFlag: e.target.checked }))
                }
                className="w-4 h-4 text-blue-600 border-gray-300 rounded"
              />
              <label htmlFor="verbalReadBack" className="text-sm text-gray-700">
                Verbal read-back completed (CMS 72h verbal order requirement)
              </label>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600">
              {error instanceof Error ? error.message : "Failed to create order"}
            </p>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isPending ? "Creating..." : "Create Order"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PatientOrdersPage() {
  const { patientId } = Route.useParams();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data, isLoading } = useQuery<OrderListResponse>({
    queryKey: ["patient-orders", patientId],
    queryFn: () => getPatientOrdersFn({ data: { patientId } }),
  });

  const orders = data?.items ?? [];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Orders</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {data?.total ?? 0} total order{(data?.total ?? 0) !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 font-medium"
        >
          + Create Order
        </button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading orders...</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-8 text-gray-400">
          No orders yet. Create the first order for this patient.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Content
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Due Date
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Urgency
                </th>
                <th className="py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Downstream
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <OrderRow key={order.id} order={order} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <CreateOrderModal
          patientId={patientId}
          onClose={() => setShowCreateModal(false)}
        />
      )}
    </div>
  );
}
