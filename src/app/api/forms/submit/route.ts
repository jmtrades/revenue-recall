import { NextResponse } from "next/server";
import { publicSiteUrl } from "@/lib/site";
import { withGuard } from "@/lib/api/guard";
import { verifyFormToken } from "@/lib/forms";
import { runWithOrg } from "@/lib/supabase/org-context";
import { captureLead } from "@/lib/leads-capture";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

/**
 * Public submit endpoint for the hosted / embeddable lead form. Authenticated by
 * the org's HMAC form token (safe to embed — it can only create a lead). Accepts
 * a native HTML form POST (urlencoded) or JSON. A hidden honeypot field traps
 * bots. On success it redirects back to the form with ?sent=1 (HTML) or returns
 * JSON (programmatic).
 */
// Server-side bounds for the public, unauthenticated form. The HTML form sets
// maxLength, but those are client-only — a direct POST bypasses them, so we cap
// every field here (mirroring the authed /api/v1/leads schema) and reject an
// oversized body, so the endpoint can't be used to flood storage with multi-MB
// values.
const MAX_BODY_BYTES = 64 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cap = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

export const POST = withGuard(async (req: Request) => {
  if (!rateLimit(clientKey(req, "formsubmit"), 30, 60_000).ok) {
    return NextResponse.json({ error: "Too many submissions — please wait a moment." }, { status: 429 });
  }
  // Reject an oversized payload before parsing (best-effort; field caps below are
  // the real backstop since Content-Length can be absent).
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Submission too large." }, { status: 413 });
  }

  const ct = req.headers.get("content-type") ?? "";
  const wantsJson = ct.includes("application/json");

  let fields: Record<string, string> = {};
  if (wantsJson) {
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (body) fields = Object.fromEntries(Object.entries(body).map(([k, v]) => [k, String(v ?? "")]));
  } else {
    const form = await req.formData().catch(() => null);
    if (form) for (const [k, v] of form.entries()) fields[k] = typeof v === "string" ? v : "";
  }

  const org = (fields.org ?? "").trim();
  const token = (fields.token ?? "").trim();
  if (!verifyFormToken(org, token)) {
    return NextResponse.json({ error: "This form link is invalid or expired." }, { status: 401 });
  }

  // Honeypot: a hidden field real users never see. If it's filled, it's a bot —
  // pretend success and create nothing.
  if ((fields.website ?? "").trim()) {
    return done(req, wantsJson, org, token);
  }

  // Bound every field server-side. A malformed email is dropped (not stored) so
  // garbage never enters the dedup/outreach path; the name+(email|phone) check
  // below then decides if enough remains to create a lead.
  const name = cap(fields.name, 200);
  let email = cap(fields.email, 254);
  if (email && !EMAIL_RE.test(email)) email = "";
  const phone = cap(fields.phone, 40);
  if (!name || (!email && !phone)) {
    if (wantsJson) return NextResponse.json({ error: "Name and a valid email or phone are required." }, { status: 400 });
    return NextResponse.redirect(formUrl(req, org, token, "error=1"), 303);
  }

  await runWithOrg(org, () =>
    captureLead({
      name,
      email: email || undefined,
      phone: phone || undefined,
      company: cap(fields.company, 200) || undefined,
      notes: cap(fields.message, 2000) || undefined,
      source: "Web form",
    }),
  );

  return done(req, wantsJson, org, token);
});

function done(req: Request, wantsJson: boolean, org: string, token: string): Response {
  if (wantsJson) return NextResponse.json({ ok: true });
  return NextResponse.redirect(formUrl(req, org, token, "sent=1"), 303);
}

/**
 * Absolute redirect target for the hosted form. Prefer NEXT_PUBLIC_SITE_URL so
 * the redirect is stable behind a proxy/CDN (req.url reflects the client Host
 * header); fall back to the request origin only when it isn't configured.
 */
function formUrl(req: Request, org: string, token: string, query: string): string {
  const base = (publicSiteUrl() || new URL(req.url).origin).replace(/\/$/, "");
  return `${base}/f/${encodeURIComponent(org)}?k=${encodeURIComponent(token)}&${query}`;
}
