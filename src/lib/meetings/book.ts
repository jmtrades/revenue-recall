import { resolveProvider } from "@/lib/crm/registry";
import { captureLead } from "@/lib/leads-capture";
import { getOrgSettings } from "@/lib/org";
import { sendEmail } from "@/lib/comms";
import { ownerEmailsForOrg } from "@/lib/billing/lifecycle";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { emitWebhook } from "@/lib/webhooks-out";
import { getAvailability, getMeetingTypeBySlug, busyIntervals, insertBooking } from "@/lib/meetings/store";
import { isSlotAvailable } from "@/lib/meetings/availability";
import { DEFAULT_MEETING_TYPE, type MeetingType } from "@/lib/meetings/types";
import { prospectStrings, fill, type ProspectStrings } from "@/lib/i18n/prospect";
import { localeFor } from "@/lib/languages";
import { bookingIcsUrl } from "@/lib/meetings/ics";
import { bookingCancelUrl } from "@/lib/meetings/manage";

/**
 * Book a meeting. Runs in the CURRENT org scope — the caller (the public booking
 * endpoint) must already be inside runWithOrg(org, …). The chosen start is
 * re-validated against live availability + existing bookings server-side, so a
 * tampered or stale slot (double-book) is rejected rather than trusted. On
 * success it dedupes/creates the contact + open deal (reusing the same capture
 * path as the lead form), logs a meeting activity, persists the booking, and
 * sends confirmation + an internal notice. Best-effort side effects never undo a
 * confirmed booking.
 */

export interface BookMeetingInput {
  /** Meeting-type slug; falls back to the default type when absent/unknown. */
  slug?: string;
  /** Chosen start as a UTC ISO instant. */
  startIso: string;
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
}

export interface BookMeetingResult {
  bookingId: string;
  contactId: string;
  dealId: string;
  startsAt: string;
  endsAt: string;
  meetingName: string;
}

export class BookingError extends Error {}

/** Human-friendly rendering of an instant in a timezone (UTC fallback), in the
 *  given BCP-47 locale so a Spanish-selling org's prospect reads a Spanish date. */
function formatInZone(iso: string, tz: string, locale = "en-US"): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone: tz || "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString();
  }
}

export async function bookMeeting(input: BookMeetingInput): Promise<BookMeetingResult> {
  const name = input.name.trim();
  const email = input.email?.trim() || undefined;
  const phone = input.phone?.trim() || undefined;
  if (!name) throw new BookingError("Please enter your name.");
  if (!email && !phone) throw new BookingError("Please provide an email or phone so we can confirm.");

  const start = Date.parse(input.startIso);
  if (!Number.isFinite(start)) throw new BookingError("Please pick a valid time.");

  // Resolve the meeting type (default when an org hasn't configured one yet).
  const type = (input.slug ? await getMeetingTypeBySlug(input.slug) : null) ?? DEFAULT_MEETING_TYPE;
  if (!type.enabled) throw new BookingError("That meeting type isn't available.");
  const duration = type.durationMinutes;

  // Re-validate the slot against LIVE availability + existing bookings. This is
  // the authority — never trust the client's slot, which prevents off-grid times
  // and double-booking a taken slot.
  const avail = await getAvailability();
  const now = new Date();
  const horizonEnd = new Date(now.getTime() + Math.max(1, avail.horizonDays) * 86_400_000 + 86_400_000);
  const busy = await busyIntervals(now.toISOString(), horizonEnd.toISOString());
  if (!isSlotAvailable(avail, { durationMinutes: duration, busy, now }, new Date(start).toISOString())) {
    throw new BookingError("That time is no longer available — please pick another.");
  }

  const startsAt = new Date(start).toISOString();
  const endsAt = new Date(start + duration * 60_000).toISOString();

  // Dedupe/create contact + open deal via the shared capture path.
  const cap = await captureLead({
    name,
    email,
    phone,
    source: "Booking",
    dealTitle: `${type.name} — ${name}`,
    notes: input.notes ? `Booking note: ${input.notes}` : undefined,
  });

  // Log the meeting on the timeline (best-effort — a logging hiccup must not lose
  // the booking the prospect just made).
  const when = formatInZone(startsAt, avail.timezone);
  await resolveProvider()
    .then((p) =>
      p.logActivity({
        contactId: cap.contactId,
        opportunityId: cap.dealId,
        kind: "meeting",
        summary: `${type.name} booked for ${when}`,
        direction: "inbound",
        occurredAt: new Date().toISOString(),
      }),
    )
    .catch(() => undefined);

  const booking = await insertBooking({
    meetingTypeId: type.id || null,
    meetingName: type.name,
    durationMinutes: duration,
    contactId: cap.contactId,
    dealId: cap.dealId,
    inviteeName: name,
    inviteeEmail: email,
    inviteePhone: phone,
    startsAt,
    endsAt,
    timezone: avail.timezone,
    notes: input.notes,
  });

  await notify(type, name, email, startsAt, avail.timezone, booking.id).catch(() => undefined);
  await emitWebhook("meeting.booked", {
    bookingId: booking.id,
    contactId: cap.contactId,
    dealId: cap.dealId,
    name,
    email: email ?? null,
    phone: phone ?? null,
    meeting: type.name,
    startsAt,
    endsAt,
  }).catch(() => undefined);

  return { bookingId: booking.id, contactId: cap.contactId, dealId: cap.dealId, startsAt, endsAt, meetingName: type.name };
}

/** Confirmation to the invitee (in the org's SELLING language) + an internal
 *  heads-up to the org's owners (English, like the rest of the app's mail). */
async function notify(type: MeetingType, name: string, email: string | undefined, whenIso: string, tz: string, bookingId: string): Promise<void> {
  const org = await getOrgSettings().catch(() => null);
  const orgId = await resolveActiveOrgId().catch(() => null);
  const brand = org?.name || "the team";
  const s = prospectStrings(org?.language);
  const when = formatInZone(whenIso, tz, localeFor(org?.language));
  const loc = locationLine(type, s);

  if (email) {
    const icsUrl = orgId ? bookingIcsUrl(orgId, bookingId) : null;
    const cancelUrl = orgId ? bookingCancelUrl(orgId, bookingId) : null;
    const body = [
      fill(s.emailGreeting, { name }),
      "",
      fill(s.emailBooked, { meeting: type.name, brand }),
      "",
      fill(s.emailWhen, { when }),
      loc ? fill(s.emailWhere, { where: loc }) : "",
      icsUrl ? `${s.emailAddToCalendar} ${icsUrl}` : "",
      "",
      s.emailChange,
      cancelUrl ? `${s.emailManage} ${cancelUrl}` : "",
    ]
      .filter((l) => l !== "")
      .join("\n");
    await sendEmail(email, fill(s.emailSubject, { meeting: type.name, brand }), body, { internal: true }).catch(() => null);
  }

  if (!orgId) return;
  const owners = await ownerEmailsForOrg(orgId).catch(() => []);
  if (!owners.length) return;
  const internal = [
    `${name}${email ? ` (${email})` : ""} booked a ${type.name}.`,
    "",
    `When: ${formatInZone(whenIso, tz)}`,
    "It's on the deal timeline in Revenue Recall.",
  ].join("\n");
  for (const addr of owners) {
    await sendEmail(addr, `New booking: ${type.name} with ${name}`, internal, { internal: true }).catch(() => null);
  }
}

function locationLine(type: MeetingType, s: ProspectStrings): string {
  if (type.locationDetail) return type.locationDetail;
  switch (type.locationKind) {
    case "phone":
      return s.locPhoneLong;
    case "video":
      return s.locVideoLong;
    case "in_person":
      return s.locInPersonLong;
    default:
      return "";
  }
}
