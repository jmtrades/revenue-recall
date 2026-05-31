import { NextResponse } from "next/server";
import { getSocialChannel } from "@/lib/social/registry";
import { ingestSocialMessages } from "@/lib/social/ingest";
import { findOrgIdByAccount } from "@/lib/connections/store";
import { runWithOrg } from "@/lib/supabase/org-context";
import type { InboundSocialMessage, SocialPlatform } from "@/lib/social/types";

export const dynamic = "force-dynamic";

const PLATFORMS = new Set<SocialPlatform>(["whatsapp", "instagram", "messenger", "linkedin", "x", "telegram"]);

function isPlatform(p: string): p is SocialPlatform {
  return PLATFORMS.has(p as SocialPlatform);
}

/**
 * Unified inbound webhook for every social platform: /api/social/<platform>.
 * GET handles the platforms that require a subscribe challenge (Meta hub.challenge,
 * X CRC). POST verifies the platform signature, normalizes messages, and ingests
 * them into the unified inbox. In the middleware PUBLIC_API allowlist because each
 * adapter authenticates the request by its own secret.
 *
 * Multi-tenant routing: each connected platform message carries the account it
 * was sent to (toAccountId — WhatsApp phone_number_id, Meta page id, …). We look
 * that up in the connections table to find the OWNING org and ingest inside that
 * org's context, so a message never lands in the wrong tenant. An optional
 * ?org=<id> on the webhook URL is honored as an explicit override (useful for
 * Telegram, whose payload has no stable account id). Falls back to the default
 * single-tenant resolution when nothing matches.
 */
export async function GET(req: Request, { params }: { params: { platform: string } }) {
  if (!isPlatform(params.platform)) return new NextResponse("unknown platform", { status: 404 });
  const channel = getSocialChannel(params.platform);
  const url = new URL(req.url);
  const orgParam = url.searchParams.get("org") ?? undefined;
  const verify = () => channel?.verifyChallenge?.(url.searchParams) ?? null;
  const challenge = orgParam ? await runWithOrg(orgParam, async () => verify()) : await verify();
  if (challenge != null) {
    // Echo verbatim (Meta expects the raw challenge; X expects a JSON token).
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("ok", { status: 200 });
}

export async function POST(req: Request, { params }: { params: { platform: string } }) {
  if (!isPlatform(params.platform)) return NextResponse.json({ error: "unknown platform" }, { status: 404 });
  const platform = params.platform;
  const channel = getSocialChannel(platform);
  if (!channel) return NextResponse.json({ error: "unknown platform" }, { status: 404 });

  const rawBody = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));
  const orgParam = new URL(req.url).searchParams.get("org") ?? undefined;

  // Parse (and signature-verify) inside the candidate org context so the adapter
  // resolves that org's own app secret. We try the ?org= override first; if not
  // given, parse with default creds then route by the message's target account.
  const parseIn = async (orgId?: string): Promise<InboundSocialMessage[]> => {
    const run = () => channel.parseWebhook({ rawBody, headers, query: new URL(req.url).searchParams });
    return orgId ? runWithOrg(orgId, run) : run();
  };

  let messages: InboundSocialMessage[];
  try {
    messages = await parseIn(orgParam);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Group messages by the org that owns the account they were sent to, so a
  // single webhook delivering events for multiple tenants routes each correctly.
  try {
    if (messages.length) {
      const byOrg = new Map<string | null, InboundSocialMessage[]>();
      for (const m of messages) {
        const orgId = orgParam ?? (await findOrgIdByAccount(platform, m.toAccountId)) ?? null;
        const list = byOrg.get(orgId);
        if (list) list.push(m);
        else byOrg.set(orgId, [m]);
      }
      for (const [orgId, group] of byOrg) {
        if (orgId) await runWithOrg(orgId, () => ingestSocialMessages(group));
        else await ingestSocialMessages(group); // default/single-tenant resolution
      }
    }
  } catch {
    // Never make the platform retry forever over our own ingest hiccup.
  }
  return NextResponse.json({ ok: true, received: messages.length });
}
