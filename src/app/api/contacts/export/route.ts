import { NextResponse } from "next/server";
import { getProvider } from "@/lib/crm/registry";
import { withGuard } from "@/lib/api/guard";
import { writeRateLimit } from "@/lib/ratelimit";
import { toCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";

/**
 * Export the org's contacts as CSV (data portability — complements the import).
 * Auth-gated by middleware (not in the public allowlist); org-scoped via the
 * provider, so it only ever returns the caller's tenant's records.
 */
export const GET = withGuard(async (req: Request) => {
  if (!writeRateLimit(req, "export").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const contacts = await getProvider().listContacts();
  const header = ["Name", "Company", "Title", "Email", "Phone"] as const;
  const rows = contacts.map((c) => [
    c.name,
    c.company ?? "",
    c.title ?? "",
    c.points.find((p) => p.channel === "email")?.value ?? "",
    c.points.find((p) => p.channel === "phone" || p.channel === "sms")?.value ?? "",
  ]);
  const csv = toCsv([header, ...rows]);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
});
