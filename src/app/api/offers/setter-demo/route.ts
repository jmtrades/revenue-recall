import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { captureLead } from "@/lib/leads-capture";
import { resolveProvider } from "@/lib/crm/registry";
import { trackAds } from "@/lib/ads/track";
import { resolveAttribution } from "@/lib/ads/touch";
import { OFFERS, blockedEmail } from "@/lib/offers/catalog";
import { planSetterOutreach, setterMessage } from "@/lib/offers/setter";
import { triageLead } from "@/lib/offers/triage";
import { saveSetterRun } from "@/lib/offers/store";
import { placeCall, sendEmail, sendSms } from "@/lib/comms";
import { fireSpeedToLead } from "@/lib/agent/speed-to-lead";
import { flushRemoteWrites, hydrateRemoteStore } from "@/lib/free/db";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST = withGuard(async (req: Request) => {
  await hydrateRemoteStore().catch(() => undefined);
  if (!rateLimit(clientKey(req, "setter-demo"), 20, 60_000).ok) {
    return NextResponse.json({ error: "Too many submissions. Wait a moment." }, { status: 429 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Missing form." }, { status: 400 });
  if (String(body.website ?? "").trim()) return NextResponse.json({ ok: true, test: true });
  if (body.consent !== true && body.consent !== "yes") {
    return NextResponse.json({ error: "Consent is required before we can contact you." }, { status: 400 });
  }
  const name = String(body.name ?? "").trim().slice(0, 200);
  const email = String(body.email ?? "").trim().toLowerCase().slice(0, 254);
  const phone = String(body.phone ?? "").trim().slice(0, 40);
  const business = String(body.business ?? "").trim().slice(0, 200);
  const monthlyRevenue = Number(body.monthlyRevenue);
  const test = body.test === true || body.test === "true";
  if (!name || !EMAIL_RE.test(email) || phone.replace(/\D/g, "").length < 8) {
    return NextResponse.json({ error: "Name, a valid email, and a phone number are required." }, { status: 400 });
  }
  if (blockedEmail(email)) return NextResponse.json({ error: "This address cannot be used." }, { status: 400 });

  const triage = triageLead({
    text: `${business} ${name} wants the setter demo`,
    monthlyRevenue: Number.isFinite(monthlyRevenue) ? monthlyRevenue : undefined,
  });
  const attr = resolveAttribution(body.attribution, req.headers.get("cookie"));
  const offer = OFFERS["setter-demo"];
  const captured = await captureLead({
    name,
    email,
    phone,
    company: business || undefined,
    value: Number.isFinite(monthlyRevenue) ? monthlyRevenue : undefined,
    source: offer.source,
    notes: `Offer ${offer.id}. Triage ${triage.band}.`,
    dealTitle: `${business || name} — setter demo`,
  });
  const provider = await resolveProvider();
  const contact = (await provider.listContacts()).find((c) => c.id === captured.contactId);
  if (contact && provider.updateContact) {
    await provider.updateContact(contact.id, {
      attributes: { ...contact.attributes, offer: offer.id, triage: triage.band, bookingUrl: process.env.BOOKING_URL || "/book/local" },
    }).catch(() => contact);
  }
  await fireSpeedToLead(captured.contactId).catch(() => undefined);
  const tracked = await trackAds({
    name: "Lead",
    eventId: typeof body.eventId === "string" ? body.eventId : undefined,
    attribution: attr,
    email,
    phone,
    personName: name,
    consent: true,
    page: offer.path,
    test,
    offer: offer.id,
    qualified: triage.qualified,
  }).catch(() => null);

  const plan = planSetterOutreach({
    email,
    phone,
    test,
    voiceReady: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    bookingUrl: process.env.BOOKING_URL || "/book/local",
  });
  const copy = setterMessage(name, plan.bookingUrl);
  if (!test && plan.call === "sent") {
    await placeCall(phone, { opener: copy.opener, context: `Setter demo for ${business || name}`, meta: { offer: offer.id } }).catch(() => undefined);
  }
  if (!test && plan.sms === "sent") await sendSms(phone, copy.sms).catch(() => undefined);
  if (!test && plan.email === "sent") await sendEmail(email, copy.emailSubject, copy.emailBody).catch(() => undefined);
  saveSetterRun({
    id: tracked?.eventId || captured.contactId,
    at: new Date().toISOString(),
    name,
    email,
    phone,
    business,
    triage: triage.band,
    call: plan.call,
    sms: plan.sms,
    emailStatus: plan.email,
    reason: plan.reason,
    test,
  });
  await flushRemoteWrites();
  const res = NextResponse.json({
    ok: true,
    test,
    contactId: captured.contactId,
    eventId: tracked?.eventId,
    triage: triage.band,
    qualified: triage.qualified,
    call: plan.call,
    sms: plan.sms,
    email: plan.email,
    reason: plan.reason,
    bookingUrl: plan.bookingUrl,
  });
  if (tracked?.eventId) res.cookies.set("rr_ads_pixel", `Lead:${tracked.eventId}`, { path: "/", maxAge: 120, sameSite: "lax" });
  return res;
});
