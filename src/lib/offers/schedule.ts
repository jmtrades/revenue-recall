export type ScheduleKind = "booked" | "no_show";

export interface ScheduleEvent {
  kind: ScheduleKind;
  email?: string;
  name?: string;
  phone?: string;
  start?: string;
}

function dict(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}
function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

/** Bookings and no-shows from Calendly and Cal.com. */
export function parseScheduleEvent(body: unknown): ScheduleEvent | null {
  const root = dict(body);
  if (!root) return null;
  const event = (str(root.event) ?? str(root.triggerEvent) ?? "").toLowerCase();
  const payload = dict(root.payload) ?? root;
  const noShow = /no[_-]?show|canceled|cancelled/.test(event) || payload.noShow === true || payload.no_show === true;
  if (event === "invitee.created" || event === "booking_created") {
    return {
      kind: "booked",
      email: str(payload.email) ?? str(dict(Array.isArray(payload.attendees) ? payload.attendees[0] : null)?.email),
      name: str(payload.name),
      phone: str(payload.text_reminder_number) ?? str(payload.phone),
      start: str(dict(payload.scheduled_event)?.start_time) ?? str(payload.startTime),
    };
  }
  if (noShow) {
    const attendees = Array.isArray(payload.attendees) ? payload.attendees : [];
    const first = dict(attendees[0]) ?? dict(payload.invitee) ?? payload;
    return {
      kind: "no_show",
      email: str(first.email) ?? str(payload.email),
      name: str(first.name) ?? str(payload.name),
      phone: str(first.phone) ?? str(payload.text_reminder_number),
      start: str(payload.startTime) ?? str(dict(payload.scheduled_event)?.start_time),
    };
  }
  return null;
}
