import { NextResponse } from "next/server";
import { resolveProvider } from "@/lib/crm/registry";
import { verifyUnsubToken } from "@/lib/unsubscribe";
import { markDoNotContact } from "@/lib/opt-out";
import { runWithOrg } from "@/lib/supabase/org-context";
import { getOrgSettings } from "@/lib/org";
import { prospectStrings, type ProspectStrings } from "@/lib/i18n/prospect";
import { rateLimit, clientKey } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

function page(title: string, message: string, status: number, dir: "ltr" | "rtl" = "ltr"): Response {
  const html = `<!doctype html><html dir="${dir}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0a0b0a;color:#dfe3df;display:grid;place-items:center;min-height:100vh;margin:0}
.card{max-width:28rem;padding:2rem;text-align:center;background:#111311;border:1px solid #262a27;border-radius:16px}h1{font-size:1.25rem;margin:0 0 .5rem;color:#fff}p{color:#949a94;line-height:1.5}</style></head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body></html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/** One-click unsubscribe. Verifies the signed token, then records a hard opt-out
 *  (an inbound "unsubscribe" activity) the guardrails honor — no auth needed. */
export async function GET(req: Request) {
  if (!rateLimit(clientKey(req, "unsub"), 60, 60_000).ok) return page("Slow down", "Too many requests — try again shortly.", 429);

  const url = new URL(req.url);
  const contactId = url.searchParams.get("c") ?? "";
  const token = url.searchParams.get("t");
  // Org-bound links carry ?org=; the token is verified against it (legacy links
  // omit org and verify the contact-only token). The org also scopes the writes
  // so the opt-out lands on the right tenant instead of the first org.
  const orgId = url.searchParams.get("org") || undefined;
  if (!verifyUnsubToken(contactId, token, orgId)) {
    return page("Link expired", "This unsubscribe link is invalid or expired. Reply with “unsubscribe” to opt out.", 400);
  }

  try {
    // The token verified, so the org binding is trusted — show the result in the
    // org's SELLING language (the language the prospect was emailed in).
    const optOut = async (): Promise<{ result: "ok" | "missing"; s: ProspectStrings }> => {
      const s = prospectStrings((await getOrgSettings().catch(() => null))?.language);
      const provider = (await resolveProvider());
      const contact = await provider.getContact(contactId);
      if (!contact) return { result: "missing", s };
      await provider.logActivity({
        contactId,
        kind: "note",
        // The word "unsubscribe" here is what the opt-out guardrail keys on.
        summary: "Opted out via the unsubscribe link.",
        direction: "inbound",
        occurredAt: new Date().toISOString(),
      });
      // Persist a durable do-not-contact flag too, so the opt-out outlives the
      // recent-activity read window the guardrail scans.
      await markDoNotContact(provider, contact);
      return { result: "ok", s };
    };
    const { result, s } = orgId ? await runWithOrg(orgId, optOut) : await optOut();
    if (result === "missing") return page(s.unsubAlreadyTitle, s.unsubAlreadyBody, 404, s.dir);
    return page(s.unsubDoneTitle, s.unsubDoneBody, 200, s.dir);
  } catch {
    const s = prospectStrings();
    return page(s.unsubErrorTitle, s.unsubErrorBody, 500, s.dir);
  }
}
