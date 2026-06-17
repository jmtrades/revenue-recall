import { NextResponse } from "next/server";
import { getWonBackDeals } from "@/lib/queries";
import { withGuard } from "@/lib/api/guard";
import { writeRateLimit } from "@/lib/ratelimit";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

/**
 * Export the org's won-back deals as CSV — the case-study proof behind the
 * headline recovered-revenue number ("here's every deal recall brought back,
 * when we re-engaged it, when it closed, and for how much"). Auth-gated by
 * middleware and org-scoped via the provider, so it only returns the caller's
 * tenant's deals.
 */
export const GET = withGuard(async (req: Request) => {
  if (!writeRateLimit(req, "export").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const deals = await getWonBackDeals();
  const header = ["Deal", "Value", "Currency", "Owner", "Recall started", "Won"] as const;
  const day = (iso: string) => (iso ? iso.slice(0, 10) : "");
  const rows = deals.map((d) => [d.title, d.value, d.currency, d.ownerName, day(d.recallStartedAt), day(d.wonAt)]);
  const csv = toCsv([header, ...rows]);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="won-back-deals-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
