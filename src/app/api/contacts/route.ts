import { NextResponse } from "next/server";
import { getProvider } from "@/lib/crm/registry";
import { z } from "zod";
import { writeRateLimit } from "@/lib/ratelimit";
import { setContactStatus } from "@/lib/leads";
import { updateContactRecord } from "@/lib/contacts";
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

const EditBody = z
  .object({
    id: z.string().min(1).max(200),
    name: z.string().trim().min(1).max(200).optional(),
    company: z.string().trim().max(200).optional(),
    title: z.string().trim().max(200).optional(),
    email: z.string().trim().email().max(200).optional().or(z.literal("")),
    phone: z.string().trim().max(50).optional().or(z.literal("")),
  })
  .refine((d) => [d.name, d.company, d.title, d.email, d.phone].some((v) => v !== undefined), { message: "Provide a field to update" });

export async function POST(req: Request) {
  if (!writeRateLimit(req, "contact-create").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
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

/** Update a contact — lead-lifecycle status, OR core fields (name/email/phone/…). */
export async function PATCH(req: Request) {
  if (!writeRateLimit(req, "contact-edit").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const raw = await req.json().catch(() => null);

  // Status update (the Leads-table dropdown) — kept first for back-compat.
  const asStatus = StatusBody.safeParse(raw);
  if (asStatus.success) {
    try {
      const status = await setContactStatus(asStatus.data.id, asStatus.data.status);
      if (!status) return NextResponse.json({ error: "Couldn't update — this CRM doesn't support editing contacts here." }, { status: 409 });
      return NextResponse.json({ ok: true, status });
    } catch (err) {
      logError("contacts.status.failed", { error: errMessage(err) });
      return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
    }
  }

  // Core-field edit (the contact page) → org-scoped updateContactRecord.
  const asEdit = EditBody.safeParse(raw);
  if (!asEdit.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  try {
    const { id, ...patch } = asEdit.data;
    const updated = await updateContactRecord(id, patch);
    if (!updated) return NextResponse.json({ error: "Couldn't update — this CRM doesn't support editing contacts here." }, { status: 409 });
    return NextResponse.json({ ok: true, contact: updated });
  } catch (err) {
    logError("contacts.edit.failed", { error: errMessage(err) });
    return NextResponse.json({ error: "Failed to update contact" }, { status: 500 });
  }
}
