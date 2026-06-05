import { NextResponse } from "next/server";
import { z } from "zod";
import { handleInbound } from "@/lib/inbound";
import { writeRateLimit } from "@/lib/ratelimit";
import { withGuard } from "@/lib/api/guard";
import { verifyHmacSignature } from "@/lib/webhook";
import { verifyInboundOrgToken } from "@/lib/inbound-routing";
import { runWithOrg } from "@/lib/supabase/org-context";
import { logWarn } from "@/lib/log";
import { seenInboundEvent, forgetInboundEvent } from "@/lib/inbound-dedup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  from: z.string().min(3),
  subject: z.string().optional(),
  text: z.string().min(1),
  // Provider's message id (Message-Id / id). Optional — when present it makes
  // delivery idempotent so a retry doesn't double-reply.
  messageId: z.string().max(400).optional(),
});

/** Generic inbound-email webhook (JSON). Point your email provider's inbound
 *  parse / forwarding webhook here. Auth precedence: a strong HMAC signature
 *  (INBOUND_SIGNING_SECRET, verified over the raw body, fail-closed) beats the
 *  legacy ?token=INBOUND_TOKEN. With neither set it stays open for local/dev but
 *  logs a warning, so an unauthenticated production endpoint is visible. */
export const POST = withGuard(async (req: Request) => {
  if (!writeRateLimit(req, "inbound-email").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const url = new URL(req.url);
  const raw = await req.text();

  // Multi-tenant: an org-tagged URL (?org=&t=) routes to that org — the per-org
  // token both authenticates the request and selects the tenant. Without it we
  // keep the legacy single-org auth (global secret) and first-org scope.
  const orgParam = url.searchParams.get("org");
  if (orgParam) {
    if (!verifyInboundOrgToken(orgParam, url.searchParams.get("t"))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    const signingSecret = process.env.INBOUND_SIGNING_SECRET;
    const token = process.env.INBOUND_TOKEN;
    if (signingSecret) {
      if (!verifyHmacSignature(signingSecret, raw, req.headers.get("x-rr-signature"))) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    } else if (token) {
      if (url.searchParams.get("token") !== token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    } else if (process.env.NODE_ENV === "production") {
      // Fail closed in prod: an unauthenticated inbound endpoint lets anyone inject
      // a "reply" from a contact (and trigger an auto-reply). Configure a secret.
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    } else {
      logWarn("inbound.email.unauthenticated", { note: "set INBOUND_SIGNING_SECRET (preferred) or INBOUND_TOKEN" });
    }
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  const parsed = Body.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  // Idempotency on the provider message id when supplied (retries no-op).
  if (parsed.data.messageId && (await seenInboundEvent("email", parsed.data.messageId))) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  try {
    const run = () => handleInbound("email", parsed.data.from, parsed.data.text, parsed.data.subject);
    const result = orgParam ? await runWithOrg(orgParam, run) : await run();
    return NextResponse.json(result);
  } catch (e) {
    // Processing failed — un-record the dedup key so the provider's retry can
    // reprocess instead of being silently deduped (don't drop a real reply).
    if (parsed.data.messageId) await forgetInboundEvent("email", parsed.data.messageId);
    throw e;
  }
});
