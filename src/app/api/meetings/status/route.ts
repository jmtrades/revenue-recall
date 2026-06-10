import { NextResponse } from "next/server";
import { z } from "zod";
import { setBookingStatus, getBooking } from "@/lib/meetings/store";
import { resolveProvider } from "@/lib/crm/registry";
import { emitWebhook } from "@/lib/webhooks-out";
import { writeRateLimit } from "@/lib/ratelimit";
import { withGuard } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

/**
 * Rep marks a booking outcome (completed / no-show / cancelled) or restores it to
 * confirmed. In-app + auth-gated (this lives under /api/meetings, NOT the public
 * /api/bookings prefix). Logs a timeline note so the outcome shows on the deal.
 */
const Body = z.object({
  id: z.string().min(1).max(200),
  status: z.enum(["confirmed", "cancelled", "completed", "no_show"]),
});

const LABEL: Record<string, string> = { completed: "completed", no_show: "a no-show", cancelled: "cancelled", confirmed: "reopened" };

export const POST = withGuard(async (req: Request) => {
  if (!writeRateLimit(req, "booking-status").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { id, status } = parsed.data;
  try {
    const booking = await getBooking(id);
    if (!booking) return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    await setBookingStatus(id, status);
    // Best-effort timeline note so the outcome is visible on the deal.
    if (booking.dealId || booking.contactId) {
      await resolveProvider()
        .then((p) => p.logActivity({ contactId: booking.contactId ?? undefined, opportunityId: booking.dealId ?? undefined, kind: "note", summary: `Meeting marked ${LABEL[status] ?? status}: ${booking.meetingName} with ${booking.inviteeName}.`, occurredAt: new Date().toISOString() }))
        .catch(() => undefined);
    }
    // Emit a lifecycle webhook for a real outcome change (not a reopen).
    if (status !== "confirmed") {
      await emitWebhook(`meeting.${status === "no_show" ? "no_show" : status}`, { bookingId: id, contactId: booking.contactId, dealId: booking.dealId, name: booking.inviteeName, meeting: booking.meetingName, startsAt: booking.startsAt, by: "rep" }).catch(() => undefined);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return /require a database|No active org/.test(msg)
      ? NextResponse.json({ error: "Scheduling needs a connected database." }, { status: 409 })
      : NextResponse.json({ error: msg }, { status: 409 });
  }
});
