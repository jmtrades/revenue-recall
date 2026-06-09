import { NextResponse } from "next/server";
import { resolveProvider } from "@/lib/crm/registry";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { withGuard } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

export const GET = withGuard(async (req: Request) => {
  // Public read endpoint — cap bursts (60/min per client).
  const rl = rateLimit(clientKey(req, "search"), 60, 60_000);
  if (!rl.ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const raw = new URL(req.url).searchParams.get("q") ?? "";
  const q = raw.trim().slice(0, 100).toLowerCase(); // bound the query
  if (!q) return NextResponse.json({ contacts: [], deals: [] });

  const provider = (await resolveProvider());
  const [contacts, opps] = await Promise.all([provider.listContacts(), provider.listOpportunities()]);

  const matchedContacts = contacts
    .filter((c) => c.name.toLowerCase().includes(q) || (c.company ?? "").toLowerCase().includes(q) || c.points.some((p) => p.value.toLowerCase().includes(q)))
    .slice(0, 6)
    .map((c) => ({ id: c.id, name: c.name, company: c.company ?? "" }));

  const matchedDeals = opps
    .filter((o) => o.title.toLowerCase().includes(q))
    .slice(0, 6)
    .map((o) => ({ id: o.id, title: o.title, value: o.value, currency: o.currency }));

  return NextResponse.json({ contacts: matchedContacts, deals: matchedDeals });
});
