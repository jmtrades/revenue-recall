import { NextResponse } from "next/server";
import { getProvider } from "@/lib/crm/registry";
import { z } from "zod";
import { writeRateLimit } from "@/lib/ratelimit";
import { setContactStatus } from "@/lib/leads";
import { LEAD_STATUSES } from "@/lib/crm/lead-status";
import { logError, errMessage } from "@/lib/log";

const Body = z.object({
  name: z.string().min(1).max(200),
  company: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
});

const StatusBody = z.object({ id: z.string().min(1).max(200), status: z.enum(LEAD_STATUSES) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid contact" }, { status: 400 });
  const { name, company, title, email, phone } = parsed.data;

  const points = [
    ...(email ? [{ channel: "email" as const, value: email }] : []),
    ...(phone ? [{ channel: "phone" as const, value: phone }] : []),
  ];

  try {
    const contact = await getProvider().createContact({ name, company, title, points, attributes: {} });
    return NextResponse.json({ contact }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 409 });
  }
}

/** Update a contact's lead-lifecycle status. */
export async function PATCH(req: Request) {
  if (!writeRateLimit(req, "contact-status").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = StatusBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const status = await setContactStatus(parsed.data.id, parsed.data.status);
    if (!status) return NextResponse.json({ error: "Couldn't update — this CRM doesn't support editing contacts here." }, { status: 409 });
    return NextResponse.json({ ok: true, status });
  } catch (err) {
    logError("contacts.status.failed", { error: errMessage(err) });
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}
