import { NextResponse } from "next/server";
import { getProvider } from "@/lib/crm/registry";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().toLowerCase();
  if (!q) return NextResponse.json({ contacts: [], deals: [] });

  const provider = getProvider();
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
}
