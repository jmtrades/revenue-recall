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
export const POST = withGuard(async (req: Request) => {
  if (!rateLimit(clientKey(req, "formsubmit"), 30, 60_000).ok) {
    return NextResponse.json({ error: "Too many submissions — please wait a moment." }, { status: 429 });
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

  const name = (fields.name ?? "").trim();
  const email = (fields.email ?? "").trim();
  const phone = (fields.phone ?? "").trim();
  if (!name || (!email && !phone)) {
    if (wantsJson) return NextResponse.json({ error: "Name and an email or phone are required." }, { status: 400 });
    return NextResponse.redirect(formUrl(req, org, token, "error=1"), 303);
  }

  await runWithOrg(org, () =>
    captureLead({
      name,
      email: email || undefined,
      phone: phone || undefined,
      company: (fields.company ?? "").trim() || undefined,
      notes: (fields.message ?? "").trim() || undefined,
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
