import { NextResponse } from "next/server";
import { getSocialChannel } from "@/lib/social/registry";
import { ingestSocialMessages } from "@/lib/social/ingest";
import type { SocialPlatform } from "@/lib/social/types";

export const dynamic = "force-dynamic";

const PLATFORMS = new Set<SocialPlatform>(["whatsapp", "instagram", "messenger", "linkedin", "x", "telegram"]);

function isPlatform(p: string): p is SocialPlatform {
  return PLATFORMS.has(p as SocialPlatform);
}

/**
 * Unified inbound webhook for every social platform: /api/social/<platform>.
 * GET handles the platforms that require a subscribe challenge (Meta hub.challenge,
 * X CRC). POST verifies the platform signature, normalizes messages, and ingests
 * them into the unified inbox. This route is in the middleware PUBLIC_API
 * allowlist because each adapter authenticates the request by its own secret.
 */
export async function GET(req: Request, { params }: { params: { platform: string } }) {
  if (!isPlatform(params.platform)) return new NextResponse("unknown platform", { status: 404 });
  const channel = getSocialChannel(params.platform);
  const url = new URL(req.url);
  const challenge = channel?.verifyChallenge?.(url.searchParams);
  if (challenge != null) {
    // Echo verbatim (Meta expects the raw challenge; X expects a JSON token).
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new NextResponse("ok", { status: 200 });
}

export async function POST(req: Request, { params }: { params: { platform: string } }) {
  if (!isPlatform(params.platform)) return NextResponse.json({ error: "unknown platform" }, { status: 404 });
  const channel = getSocialChannel(params.platform);
  if (!channel) return NextResponse.json({ error: "unknown platform" }, { status: 404 });

  const rawBody = await req.text();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k.toLowerCase()] = v));

  let messages;
  try {
    messages = await channel.parseWebhook({ rawBody, headers, query: new URL(req.url).searchParams });
  } catch {
    // Bad signature / forged request → 401, but never leak why.
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    if (messages.length) await ingestSocialMessages(messages);
  } catch {
    // Never make the platform retry forever over our own ingest hiccup.
  }
  // Platforms expect a fast 200 ack regardless of downstream processing.
  return NextResponse.json({ ok: true, received: messages.length });
}
