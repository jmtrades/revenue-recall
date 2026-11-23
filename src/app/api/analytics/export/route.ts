import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { writeRateLimit } from "@/lib/ratelimit";
import { roiToCsv } from "@/lib/roi/csv";
import { loadRoi } from "@/lib/roi/load";

export const dynamic = "force-dynamic";

/**
 * CSV of the org's results ledger, with attribution columns on outcomes.
 * Auth-gated by middleware. The loader is org-scoped the same way the page is.
 */
export const GET = withGuard(async (req: Request) => {
  if (!writeRateLimit(req, "export").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const { events, report } = await loadRoi();
  const csv = roiToCsv(events, report.attributions);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="results-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
