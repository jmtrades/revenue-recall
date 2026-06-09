import { NextResponse } from "next/server";
import { verifyClickToken, recordClick } from "@/lib/tracking";

export const dynamic = "force-dynamic";

/**
 * Tracked-link redirect. Public (recipients are signed-out prospects); the
 * token's HMAC covers the destination, so this can never be an open redirect —
 * only URLs this server signed at send time resolve. Invalid/expired tokens
 * land on the homepage rather than erroring at a prospect.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const payload = verifyClickToken(url.searchParams.get("d") ?? "");
  if (!payload) return NextResponse.redirect(new URL("/", url.origin), 302);
  await recordClick(payload);
  return NextResponse.redirect(payload.u, 302);
}
