/**
 * Native meetings / booking — domain types shared by the slot engine, the store,
 * the public booking page, and the booking-create flow.
 */

export type MeetingLocationKind = "phone" | "video" | "in_person" | "custom";

export interface MeetingType {
  id: string;
  name: string;
  /** URL-safe identifier, unique per org; used as ?t=<slug> on the booking page. */
  slug: string;
  durationMinutes: number;
  description?: string;
  locationKind: MeetingLocationKind;
  /** Free-form location detail, e.g. a dial-in number or a video link. */
  locationDetail?: string;
  enabled: boolean;
}

/** A single open window within a day, as org-local 24h wall-clock "HH:MM". */
export interface DayWindow {
  start: string;
  end: string;
}

/** Weekly availability keyed by weekday (0 = Sunday … 6 = Saturday). */
export type WeeklyWindows = Record<number, DayWindow[]>;

export interface Availability {
  /** IANA timezone the windows are expressed in; "" → treated as UTC. */
  timezone: string;
  weekly: WeeklyWindows;
  /** Granularity of offered start times, in minutes (e.g. 30). */
  slotMinutes: number;
  /** Soonest a slot may be booked, in minutes from now (e.g. 240 = 4h notice). */
  minNoticeMinutes: number;
  /** How many days ahead slots are offered. */
  horizonDays: number;
}

/** A bookable slot, as absolute UTC instants (ISO strings). */
export interface BookableSlot {
  start: string;
  end: string;
}

/** An existing booking's occupied interval, used to remove conflicting slots. */
export interface BusyInterval {
  start: string;
  end: string;
}

/** Synthesized fallback so the booking flow works before an org configures a
 *  meeting type. Its empty id means "not a stored row" (booking.meetingTypeId
 *  is left null). Shared by the booking page and the booking flow. */
export const DEFAULT_MEETING_TYPE: MeetingType = {
  id: "",
  name: "Intro call",
  slug: "intro",
  durationMinutes: 30,
  locationKind: "phone",
  enabled: true,
};

export interface Booking {
  id: string;
  meetingTypeId: string | null;
  meetingName: string;
  durationMinutes: number;
  contactId: string | null;
  dealId: string | null;
  inviteeName: string;
  inviteeEmail?: string;
  inviteePhone?: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  status: BookingStatus;
  notes?: string;
  createdAt: string;
}

export type BookingStatus = "confirmed" | "cancelled" | "completed" | "no_show";
export const BOOKING_STATUSES: BookingStatus[] = ["confirmed", "cancelled", "completed", "no_show"];
