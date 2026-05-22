import { NextResponse } from "next/server";
import { z } from "zod";
import { getOutboxItem, setOutboxStatus } from "@/lib/agent/store";
import { getProvider } from "@/lib/crm/registry";
import { sendEmail, sendSms } from "@/lib/comms";

export const dynamic = "force-dynamic";

const Body = z.object({ action: z.enum(["approve", "dismiss"]) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "action required" }, { status: 400 });

  const item = await getOutboxItem(params.id);
  if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (item.status !== "pending") return NextResponse.json({ error: "Already handled" }, { status: 409 });

  if (parsed.data.action === "dismiss") {
    await setOutboxStatus(item.id, "dismissed");
    return NextResponse.json({ ok: true, status: "dismissed" });
  }

  // approve → send + log
  const provider = getProvider();
  let to: string | undefined;
  if (item.contactId) {
    const c = await provider.getContact(item.contactId);
    to = c?.points.find((p) => p.channel === (item.channel === "email" ? "email" : "phone"))?.value;
  }
  if (!to) return NextResponse.json({ error: "No destination on file" }, { status: 400 });

  const res = item.channel === "email" ? await sendEmail(to, item.subject ?? "", item.body) : await sendSms(to, item.body);
  if (res.status === "failed") return NextResponse.json({ error: res.detail ?? "Send failed" }, { status: 502 });

  await provider.logActivity({
    opportunityId: item.dealId,
    contactId: item.contactId,
    kind: item.channel,
    summary: item.subject ? `${item.subject}\n\n${item.body}` : item.body,
    direction: "outbound",
    occurredAt: new Date().toISOString(),
  });
  await setOutboxStatus(item.id, "sent");
  return NextResponse.json({ ok: true, status: "sent", provider: res.provider });
}
