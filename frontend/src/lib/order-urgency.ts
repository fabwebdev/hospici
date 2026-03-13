// lib/order-urgency.ts
// T3-9: Client-side urgency computation for physician order inbox.

export type UrgencyLevel = "due_soon" | "urgent" | "critical" | "overdue" | null;

export interface UrgencyInfo {
  label: string;
  level: UrgencyLevel;
  color: string; // tailwind class
}

export function computeOrderUrgency(dueAt: string, status: string): UrgencyInfo {
  const terminalStatuses = [
    "SIGNED",
    "REJECTED",
    "VOIDED",
    "NO_SIGNATURE_REQUIRED",
    "COMPLETED_RETURNED",
  ];

  if (terminalStatuses.includes(status)) {
    return { label: "", level: null, color: "" };
  }

  if (
    status === "EXPIRED" ||
    (new Date(dueAt) < new Date() && ["PENDING_SIGNATURE", "VIEWED"].includes(status))
  ) {
    return { label: "Overdue", level: "overdue", color: "text-red-600" };
  }

  const hoursRemaining = (new Date(dueAt).getTime() - Date.now()) / (1000 * 60 * 60);

  if (hoursRemaining > 48) {
    return { label: "Due soon", level: "due_soon", color: "text-green-600" };
  }
  if (hoursRemaining > 12) {
    return { label: "Urgent", level: "urgent", color: "text-amber-600" };
  }
  return { label: "Critical", level: "critical", color: "text-red-600" };
}
