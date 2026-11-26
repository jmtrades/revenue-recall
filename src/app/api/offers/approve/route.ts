import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { requireRole } from "@/lib/authz";
import { approveCampaign } from "@/lib/offers/store";
import { flushRemoteWrites } from "@/lib/free/db";

export const dynamic = "force-dynamic";

/** Marks a reactivation campaign approved. It still does not send. */
export const POST = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  const campaign = approveCampaign(body?.id ?? "");
  if (!campaign) return NextResponse.json({ error: "Campaign not found." }, { status: 404 });
  await flushRemoteWrites();
  return NextResponse.json({ ok: true, status: campaign.status, sends: 0 });
});
