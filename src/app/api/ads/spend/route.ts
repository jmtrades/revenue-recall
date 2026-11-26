import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { requireRole } from "@/lib/authz";
import { parseSpendCsv } from "@/lib/ads/csv";
import { deleteSpend, listAds, putSpend } from "@/lib/ads/store";
import { flushRemoteWrites, hydrateRemoteStore } from "@/lib/free/db";

export const dynamic = "force-dynamic";

/** Manual spend or a CSV. Owner/admin when sign-in is on; open on the free demo host. */
export const GET = withGuard(async () => {
  await hydrateRemoteStore().catch(() => undefined);
  return NextResponse.json({ spend: listAds().spend });
});

export const POST = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  await hydrateRemoteStore().catch(() => undefined);
  const body = (await req.json().catch(() => null)) as { csv?: string; date?: string; source?: string; campaign?: string; amount?: number; currency?: string } | null;
  if (!body) return NextResponse.json({ error: "Missing body" }, { status: 400 });

  if (typeof body.csv === "string") {
    const parsed = parseSpendCsv(body.csv);
    parsed.rows.forEach((row, i) => putSpend({ ...row, id: `csv_${row.date}_${row.campaign}_${i}` }));
    return NextResponse.json({ ok: true, saved: parsed.rows.length, errors: parsed.errors });
  }

  const date = (body.date ?? "").slice(0, 10);
  const campaign = (body.campaign ?? "").trim().slice(0, 160);
  const amount = Number(body.amount);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !campaign || !Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "Date, campaign, and a spend amount are required." }, { status: 400 });
  }
  putSpend({
    id: `manual_${date}_${campaign}`,
    date,
    campaign,
    source: (body.source || "manual").slice(0, 80),
    amount,
    currency: (body.currency || "USD").toUpperCase().slice(0, 8),
  });
  await flushRemoteWrites();
  return NextResponse.json({ ok: true, saved: 1 });
});

export const DELETE = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  await hydrateRemoteStore().catch(() => undefined);
  const ok = deleteSpend(id);
  await flushRemoteWrites();
  return NextResponse.json({ ok });
});
