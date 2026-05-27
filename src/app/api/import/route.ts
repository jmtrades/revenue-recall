import { NextResponse } from "next/server";
import { z } from "zod";
import { getProvider } from "@/lib/crm/registry";
import { limited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Row = z.object({
  name: z.string().min(1).max(200),
  company: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
});
const Body = z.object({ rows: z.array(Row).min(1).max(1000) });

/** Bulk-create contacts from a parsed CSV. Writes through the active CRM
 *  provider, so it respects whichever backend is configured. */
export async function POST(req: Request) {
  const rl = limited(req, "import", 5, 60_000);
  if (rl) return rl;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Provide up to 1000 rows, each with at least a name." }, { status: 400 });
  }

  const provider = getProvider();
  let created = 0;
  const errors: string[] = [];

  for (const r of parsed.data.rows) {
    const points = [
      ...(r.email ? [{ channel: "email" as const, value: r.email }] : []),
      ...(r.phone ? [{ channel: "phone" as const, value: r.phone }] : []),
    ];
    try {
      await provider.createContact({ name: r.name, company: r.company, title: r.title, points, attributes: {} });
      created += 1;
    } catch (e) {
      errors.push(`${r.name}: ${e instanceof Error ? e.message : "failed"}`);
    }
  }

  return NextResponse.json({ created, failed: errors.length, errors: errors.slice(0, 10) });
}
