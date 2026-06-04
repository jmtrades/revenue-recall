import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { requireRole } from "@/lib/authz";
import { getWebhookConfig, postWebhook } from "@/lib/webhooks-out";

export const dynamic = "force-dynamic";

/** Send a sample "ping" event to the configured webhook so the user can confirm
 *  their receiver works (and check the signature). Owner/admin only. */
export const POST = withGuard(async () => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  const cfg = await getWebhookConfig();
  if (!cfg) return NextResponse.json({ error: "No webhook configured." }, { status: 400 });
  const result = await postWebhook(cfg.url, cfg.secret, "ping", { message: "Test event from Revenue Recall" });
  return NextResponse.json({ delivered: result.ok, status: result.status ?? null });
});
