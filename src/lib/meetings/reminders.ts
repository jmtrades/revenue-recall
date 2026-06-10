import { getOrgSettings } from "@/lib/org";
import { sendEmail } from "@/lib/comms";
import { prospectStrings, fill } from "@/lib/i18n/prospect";
import { localeFor } from "@/lib/languages";
import { bookingsNeedingReminder, markReminderSent } from "@/lib/meetings/store";
import { bookingCancelUrl } from "@/lib/meetings/manage";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";

/**
 * Send one reminder per upcoming booking before it starts — no-shows are the
 * biggest leak in booked pipeline. Runs in the per-org cron tick (the caller is
 * already inside runWithOrg). Each booking is marked reminded so it can never
 * fire twice; we mark even on a send failure so a hard-bouncing address can't
 * loop the scan every tick. Best-effort and never throws.
 *
 * Window: bookings starting within BOOKING_REMINDER_HOURS (default 24h).
 */
function whenLabel(iso: string, tz: string, lang?: string): string {
  try {
    return new Intl.DateTimeFormat(localeFor(lang), { timeZone: tz || "UTC", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString();
  }
}

export async function runBookingReminders(now: Date = new Date()): Promise<{ sent: number }> {
  try {
    const hours = Number(process.env.BOOKING_REMINDER_HOURS) || 24;
    const within = new Date(now.getTime() + hours * 3_600_000);
    const due = await bookingsNeedingReminder(now.toISOString(), within.toISOString());
    if (due.length === 0) return { sent: 0 };

    const org = await getOrgSettings().catch(() => null);
    const orgId = await resolveActiveOrgId().catch(() => null);
    const s = prospectStrings(org?.language);
    const brand = org?.name || "the team";

    let sent = 0;
    for (const b of due) {
      // Mark first so a thrown send / crash can't double-remind on the next tick.
      await markReminderSent(b.id).catch(() => undefined);
      if (!b.inviteeEmail) continue;
      const when = whenLabel(b.startsAt, b.timezone, org?.language);
      const cancelUrl = orgId ? bookingCancelUrl(orgId, b.id) : null;
      const body = [
        fill(s.emailGreeting, { name: b.inviteeName }),
        "",
        fill(s.reminderBody, { meeting: b.meetingName, brand }),
        "",
        fill(s.emailWhen, { when }),
        cancelUrl ? `${s.emailManage} ${cancelUrl}` : "",
      ]
        .filter((l) => l !== "")
        .join("\n");
      const r = await sendEmail(b.inviteeEmail, fill(s.reminderSubject, { meeting: b.meetingName, brand }), body, { internal: true }).catch(() => null);
      if (r && r.status !== "failed") sent++;
    }
    return { sent };
  } catch {
    return { sent: 0 };
  }
}
