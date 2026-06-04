import { NextResponse } from "next/server";
import { z } from "zod";
import { withGuard } from "@/lib/api/guard";
import { requireRole } from "@/lib/authz";
import { getWebhookStatus, setWebhook, removeWebhook, isValidWebhookUrl } from "@/lib/webhooks-out";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Current webhook status (URL, never the secret). */
export const GET = withGuard(async () => {
  return NextResponse.json(await getWebhookStatus());
});

const Body = z.object({ url: z.string().trim().max(2000) });

/** Set/replace the org's webhook endpoint. Returns the signing secret ONCE. */
export const POST = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isValidWebhookUrl(parsed.data.url)) {
    return NextResponse.json({ error: "Enter a valid public https:// URL." }, { status: 400 });
  }
  const { secret } = await setWebhook(parsed.data.url);
  await recordAudit("webhook.set", parsed.data.url);
  return NextResponse.json({ ok: true, secret });
});

/** Remove the org's webhook endpoint. */
export const DELETE = withGuard(async () => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  await removeWebhook();
  await recordAudit("webhook.remove");
  return NextResponse.json({ ok: true });
});
