// routes/_authed/patients/$patientId/idg/schedule.tsx
// IDG Meeting Scheduling — navigated to from the IDG hard-block modal

import { createIDGMeetingFn } from "@/functions/idg.functions.js";
import type { IDGMeetingResponse } from "@hospici/shared-types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/_authed/patients/$patientId/idg/schedule")({
  component: IDGSchedulePage,
});

// Minimal required attendee row for the form
interface AttendeeRow {
  userId: string;
  name: string;
  role: string;
  status: "present" | "remote";
}

function IDGSchedulePage() {
  const { patientId } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [scheduledAt, setScheduledAt] = useState(() => {
    // Default to tomorrow at 10:00
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    return d.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:mm"
  });

  const [attendees, setAttendees] = useState<AttendeeRow[]>([
    { userId: "", name: "", role: "RN", status: "present" },
    { userId: "", name: "", role: "MD", status: "present" },
    { userId: "", name: "", role: "SW", status: "present" },
    { userId: "", name: "", role: "Chaplain", status: "present" },
  ]);

  const [formError, setFormError] = useState<string | null>(null);

  const { mutate: scheduleIDG, isPending } = useMutation<IDGMeetingResponse, Error>({
    mutationFn: () =>
      createIDGMeetingFn({
        data: {
          input: {
            patientId,
            scheduledAt: new Date(scheduledAt).toISOString(),
            attendees: attendees.map((a) => ({
              userId: a.userId || crypto.randomUUID(),
              name: a.name,
              role: a.role,
              status: a.status,
            })),
          },
        },
      }) as Promise<IDGMeetingResponse>,
    onSuccess: () => {
      // Invalidate compliance cache so the hard-block modal disappears
      queryClient.invalidateQueries({ queryKey: ["idg-compliance", patientId] });
      queryClient.invalidateQueries({ queryKey: ["idg-meetings", patientId] });
      navigate({ to: "/patients/$patientId", params: { patientId } });
    },
    onError: (err) => {
      setFormError(err.message);
    },
  });

  function updateAttendee(idx: number, field: keyof AttendeeRow, value: string) {
    setAttendees((prev) => prev.map((a, i) => (i === idx ? { ...a, [field]: value } : a)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const filled = attendees.filter((a) => a.name.trim().length > 0);
    if (filled.length < 4) {
      setFormError("All 4 required attendees (RN, MD, SW, Chaplain/Spiritual Care) must be named.");
      return;
    }

    scheduleIDG();
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-6">
        <Link
          to="/patients/$patientId"
          params={{ patientId }}
          className="text-blue-600 hover:text-blue-900 text-sm"
        >
          ← Back to Patient
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-gray-900">Schedule IDG Meeting</h1>
        <p className="mt-1 text-sm text-gray-500">
          Per 42 CFR §418.56(a), the IDG must include a physician, registered nurse, social worker,
          and pastoral/spiritual care counselor. All four are required.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Meeting date/time */}
        <div>
          <label htmlFor="scheduledAt" className="block text-sm font-medium text-gray-700 mb-1">
            Meeting Date & Time
          </label>
          <input
            id="scheduledAt"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            required
            className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Attendees */}
        <fieldset>
          <legend className="text-sm font-medium text-gray-700 mb-3">
            Required Attendees (RN · MD · SW · Chaplain/Spiritual Care)
          </legend>
          <div className="space-y-3">
            {attendees.map((attendee, idx) => (
              <div
                key={`attendee-${attendee.role}`}
                className="grid grid-cols-3 gap-3 items-center"
              >
                <div>
                  <label htmlFor={`role-${idx}`} className="sr-only">
                    Role
                  </label>
                  <div
                    id={`role-${idx}`}
                    className="px-3 py-2 text-sm font-semibold text-gray-700 bg-gray-100 rounded-md"
                  >
                    {attendee.role}
                  </div>
                </div>
                <div>
                  <label htmlFor={`name-${idx}`} className="sr-only">
                    Name
                  </label>
                  <input
                    id={`name-${idx}`}
                    type="text"
                    placeholder="Clinician name"
                    value={attendee.name}
                    onChange={(e) => updateAttendee(idx, "name", e.target.value)}
                    required
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor={`status-${idx}`} className="sr-only">
                    Attendance
                  </label>
                  <select
                    id={`status-${idx}`}
                    value={attendee.status}
                    onChange={(e) =>
                      updateAttendee(idx, "status", e.target.value as AttendeeRow["status"])
                    }
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="present">Present</option>
                    <option value="remote">Remote</option>
                  </select>
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        {formError && (
          <p role="alert" className="text-sm text-red-600">
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50"
        >
          {isPending ? "Scheduling…" : "Schedule IDG Meeting"}
        </button>
      </form>
    </div>
  );
}
