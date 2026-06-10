import { NextResponse } from "next/server";
import { z } from "zod";
import { withGuard } from "@/lib/api/guard";
import { verifyBookingToken } from "@/lib/meetings/token";
import { runWithOrg } from "@/lib/supabase/org-context";
import { bookMeeting, BookingError } from "@/lib/meetings/book";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * Public booking endpoint for the hosted booking page (/book/[org]). Authorized
 * by the org's HMAC booking token (safe to expose — it can only create a booking
 * for that org). A hidden honeypot traps bots; the chosen slot is re-validated
 * server-side in bookMeeting. Returns JSON.
 */
const Body = z.object({
  org: z.string().min(1).max(200),
  token: z.string().min(1).max(200),
  slug: z.string().trim().max(120).optional(),
  start: z.string().min(1).max(40), // UTC ISO instant
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().max(200).optional(),
  phone: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(2000).optional(),
  // Honeypot — real users never fill this.
  website: z.string().max(200).optional(),
});

export const POST = withGuard(async (req: Request) => {
  if (!rateLimit(clientKey(req, "booking"), 20, 60_000).ok) {
    return NextResponse.json({ error: "Too many requests — please wait a moment." }, { status: 429 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Missing booking details." }, { status: 400 });
  const { org, token, website, slug, start, name, email, phone, notes } = parsed.data;

  if (!verifyBookingToken(org, token)) {
    return NextResponse.json({ error: "This booking link is invalid or expired." }, { status: 401 });
  }
  // Honeypot filled → pretend success, create nothing.
  if ((website ?? "").trim()) return NextResponse.json({ ok: true });

  if (!email && !phone) {
    return NextResponse.json({ error: "Provide an email or phone so we can confirm." }, { status: 400 });
  }

  try {
    const res = await runWithOrg(org, () => bookMeeting({ slug, startIso: start, name, email, phone, notes }));
    return NextResponse.json({ ok: true, booking: { id: res.bookingId, startsAt: res.startsAt, endsAt: res.endsAt, meeting: res.meetingName } }, { status: 201 });
  } catch (e) {
    if (e instanceof BookingError) return NextResponse.json({ error: e.message }, { status: 409 });
    return NextResponse.json({ error: "We couldn't complete that booking. Please try again." }, { status: 500 });
  }
});
