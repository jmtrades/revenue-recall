import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { blockedEmail } from "@/lib/offers/catalog";
import { dedupeLeads, estimateReactivation, parseLeadList } from "@/lib/offers/reactivation";
import { saveCampaign } from "@/lib/offers/store";
import { trackAds } from "@/lib/ads/track";
import { resolveAttribution } from "@/lib/ads/touch";
import { flushRemoteWrites, hydrateRemoteStore } from "@/lib/free/db";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST = withGuard(async (req: Request) => {
  await hydrateRemoteStore().catch(() => undefined);
  if (!rateLimit(clientKey(req, "reactivation"), 10, 60_000).ok) {
    return NextResponse.json({ error: "Too many submissions. Wait a moment." }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Missing form." }, { status: 400 });
  if (body.consent !== true && body.consent !== "yes") {
    return NextResponse.json({ error: "Consent attestation is required." }, { status: 400 });
  }
  const name = String(body.name ?? "").trim().slice(0, 200);
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 254);
  const list = String(body.leads ?? body.csv ?? "").slice(0, 200_000);
  const test = body.test === true || body.test === "true";
  if (!name || !EMAIL_RE.test(email)) return NextResponse.json({ error: "Name and a valid email are required." }, { status: 400 });
  if (blockedEmail(email)) return NextResponse.json({ error: "This address cannot be used." }, { status: 400 });
  const parsed = parseLeadList(list);
  const unique = dedupeLeads(parsed.leads).filter((lead) => !blockedEmail(lead.email));
  const estimate = estimateReactivation(unique);
  estimate.invalid = parsed.invalid;
  estimate.rows = parsed.leads.length + parsed.invalid;
  estimate.unique = unique.length;
  const id = `react_${Date.now().toString(36)}`;
  saveCampaign({
    id,
    at: new Date().toISOString(),
    name,
    email,
    status: "draft",
    estimate,
    leadCount: unique.length,
    leads: unique.slice(0, 500),
  });
  const tracked = await trackAds({
    name: "Lead",
    attribution: resolveAttribution(body.attribution, req.headers.get("cookie")),
    email,
    personName: name,
    consent: true,
    page: "/reactivation-audit",
    test,
    offer: "reactivation-audit",
    qualified: estimate.reachable > 0,
  }).catch(() => null);
  await flushRemoteWrites();
  const res = NextResponse.json({ ok: true, id, status: "draft", estimate, eventId: tracked?.eventId, test });
  if (tracked?.eventId) res.cookies.set("rr_ads_pixel", `Lead:${tracked.eventId}`, { path: "/", maxAge: 120, sameSite: "lax" });
  return res;
});
