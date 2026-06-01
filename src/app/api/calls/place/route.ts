import { NextResponse } from "next/server";
import { z } from "zod";
import { getProvider } from "@/lib/crm/registry";
import { placeCall } from "@/lib/comms";
import { getActiveVoice } from "@/lib/voice";
import { writeRateLimit } from "@/lib/ratelimit";
import { withGuard } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

const Body = z.object({ dealId: z.string().optional(), contactId: z.string().optional(), to: z.string().optional() });

export const POST = withGuard(async (req: Request) => {
  if (!writeRateLimit(req, "call").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const provider = getProvider();
  let to = parsed.data.to;
  let contactId = parsed.data.contactId;

  const opp = parsed.data.dealId ? await provider.getOpportunity(parsed.data.dealId) : null;
  if (opp) contactId = contactId ?? opp.contactId;
  const contact = contactId ? await provider.getContact(contactId) : null;
  if (!to) to = contact?.points.find((p) => p.channel === "phone")?.value;
  if (!to) return NextResponse.json({ error: "No phone number on file" }, { status: 400 });

  // Brief the in-house agent so it talks like it knows the prospect. Best-effort:
  // never let context-building block the call.
  let context: string | undefined;
  let opener: string | undefined;
  try {
    const voice = await getActiveVoice();
    const rep = voice.senderName?.trim();
    const first = (contact?.name ?? "").trim().split(/\s+/)[0] || "there";
    const bits: string[] = [];
    if (contact?.name) bits.push(`You're calling ${contact.name}${contact.company ? ` at ${contact.company}` : ""}.`);
    if (opp?.title) bits.push(`It's about "${opp.title}"${opp.value ? ` — worth ${opp.currency ?? ""}${opp.value.toLocaleString()}` : ""}.`);
    if (opp?.lossReason) bits.push("This deal went cold / was marked lost — you're re-engaging warmly, no guilt-trip.");
    if (voice.business) bits.push(`Your business: ${voice.business}`);
    if (rep) bits.push(`You are ${rep}.`);
    bits.push("Goal: land one real next step — a meeting or a clear yes.");
    context = bits.join(" ");
    opener = rep ? `Hey ${first}, it's ${rep} — caught you at an okay time?` : `Hey ${first} — caught you at an okay time?`;
  } catch {
    /* context is a nicety; place the call regardless */
  }

  const result = await placeCall(to, { context, opener });
  if (result.status === "failed") return NextResponse.json({ error: result.detail ?? "Call failed" }, { status: 502 });
  return NextResponse.json({ ok: true, to, ...result });
});
