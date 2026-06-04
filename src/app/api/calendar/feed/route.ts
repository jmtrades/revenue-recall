import { getCalendar } from "@/lib/queries";
import { runWithOrg } from "@/lib/supabase/org-context";
import { verifyCalendarFeedToken, toIcs, type FeedEvent } from "@/lib/calendar-feed";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * Subscribable calendar feed (iCalendar / .ics). A calendar app (Google, Apple,
 * Outlook) polls this URL on its own schedule, with no session — so it's authed
 * by the unguessable HMAC token in the query string, scoped to one org. The
 * org's upcoming target-closes and follow-ups flow into the user's calendar as
 * events. One-way sync, zero OAuth/credentials.
 */
export async function GET(req: Request) {
  // Calendar clients poll on a fixed cadence, but bound abuse of the public URL.
  if (!rateLimit(clientKey(req, "calfeed"), 120, 60_000).ok) {
    return new Response("Too many requests", { status: 429 });
  }

  const url = new URL(req.url);
  const orgId = url.searchParams.get("org") ?? "";
  const token = url.searchParams.get("token");
  // Fail closed: an invalid/missing token never reaches tenant data.
  if (!verifyCalendarFeedToken(orgId, token)) {
    return new Response("Invalid or expired calendar token", { status: 401 });
  }

  let events: FeedEvent[] = [];
  try {
    // Scope every downstream read to this org (no session on a calendar poll).
    const { events: calEvents } = await runWithOrg(orgId, () => getCalendar());
    events = calEvents.map((e) => ({ date: e.date, title: e.title, dealId: e.dealId }));
  } catch {
    // A transient read failure should still return a valid (empty) calendar so
    // the subscribing app keeps the subscription instead of disabling it.
    events = [];
  }

  return new Response(toIcs(events), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="revenue-recall.ics"',
      // Let calendar clients cache briefly; they re-poll regardless.
      "Cache-Control": "public, max-age=300",
    },
  });
}
