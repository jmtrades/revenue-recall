import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { safeEqual } from "@/lib/safe-compare";
import { installSecret } from "@/lib/webinar/install";
import { previewDropOff } from "@/lib/webinar/preview";

export const dynamic = "force-dynamic";

/**
 * Dry-run a drop-off. Same state machine as a live webhook, but nothing is
 * stored and nothing is dialed, texted, or emailed.
 */
export const POST = withGuard(async (req: Request) => {
  if (!rateLimit(clientKey(req, "webinar-preview"), 60, 60_000).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const url = new URL(req.url);
  const secret = installSecret();
  const token = url.searchParams.get("token") ?? "";
  if (!secret || !token || !safeEqual(token, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const provider = (url.searchParams.get("provider") || "generic").toLowerCase();
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  return NextResponse.json(previewDropOff(provider, body));
});
