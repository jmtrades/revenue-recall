import { listBookingsForManagement } from "@/lib/meetings/store";
import { getOrgSettings } from "@/lib/org";
import { localeFor } from "@/lib/languages";
import { hostedBookingUrl } from "@/lib/meetings/token";
import { PageHeader, Card } from "@/components/ui";
import { BookingsManager, type BookingRow } from "@/components/meetings/BookingsManager";

export const metadata = { title: "Meetings" };
export const dynamic = "force-dynamic";

function whenLabel(iso: string, tz: string, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { timeZone: tz || undefined, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

export default async function MeetingsPage() {
  const [bookings, org] = await Promise.all([listBookingsForManagement(), getOrgSettings()]);
  const locale = localeFor(org.language);
  const now = Date.now();

  const rows: BookingRow[] = bookings.map((b) => ({
    id: b.id,
    meetingName: b.meetingName,
    inviteeName: b.inviteeName,
    inviteeEmail: b.inviteeEmail,
    inviteePhone: b.inviteePhone,
    dealId: b.dealId,
    whenLabel: whenLabel(b.startsAt, b.timezone, locale),
    status: b.status,
    past: Date.parse(b.endsAt) < now,
  }));

  // Upcoming = not past and not cancelled, soonest first. Past = newest first.
  const upcoming = rows.filter((r) => !r.past && r.status !== "cancelled");
  const past = rows.filter((r) => r.past || r.status === "cancelled").reverse();
  const bookingUrl = org.id ? hostedBookingUrl(org.id) : null;

  return (
    <div className="space-y-6">
      <PageHeader title="Meetings" subtitle="Your booked meetings — mark outcomes and keep the calendar honest." />
      {bookings.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            No meetings yet. Share your booking link and meetings booked there land here and on your pipeline.
            {bookingUrl && (
              <>
                {" "}
                <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                  Open your booking page
                </a>
                .
              </>
            )}
          </p>
        </Card>
      ) : (
        <BookingsManager upcoming={upcoming} past={past} />
      )}
    </div>
  );
}
