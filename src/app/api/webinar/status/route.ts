import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { requireAdmin } from "@/lib/admin";
import { safeEqual } from "@/lib/safe-compare";
import { resolveWebinarOrg, webinarOverview } from "@/lib/webinar/engine";
import { webinarWebhookUrl } from "@/lib/webinar/verify";

export const dynamic = "force-dynamic";

/**
 * Operator view of webinar recovery: whether webhooks are armed, how many
 * leads sit in each lifecycle state, and the compliance limits in effect.
 * Requires ADMIN_TOKEN or CRON_SECRET. No prospect phone numbers or message bodies.
 */
export const GET = withGuard(async (req: Request) => {
  const cron = process.env.CRON_SECRET;
  const header = req.headers.get("authorization") ?? "";
  const cronOk = Boolean(cron && safeEqual(header, `Bearer ${cron}`));
  if (!cronOk) {
    const denied = requireAdmin(req, "webinar-status");
    if (denied) return denied;
  }
  const url = new URL(req.url);
  const orgId = await resolveWebinarOrg(url.searchParams.get("org"));
  if (!orgId) return NextResponse.json({ error: "Org could not be resolved" }, { status: 400 });
  const overview = await webinarOverview(orgId);
  return NextResponse.json({
    ok: true,
    orgId,
    ...overview,
    webhookUrl: webinarWebhookUrl(orgId),
  });
});
