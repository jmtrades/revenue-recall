import { NextResponse } from "next/server";
import { z } from "zod";
import { withGuard } from "@/lib/api/guard";
import { withApiKey, readLimit } from "@/lib/api/auth";
import { getProvider } from "@/lib/crm/registry";
import { createContactRecord, serializeContact } from "@/lib/contacts";

export const dynamic = "force-dynamic";

/**
 * Public API — contacts resource. POST creates a standalone contact (no deal
 * required); GET lists contacts. Authenticated by the workspace API key.
 */

const Body = z
  .object({
    name: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(200).optional(),
    phone: z.string().trim().min(3).max(40).optional(),
    company: z.string().trim().max(200).optional(),
    title: z.string().trim().max(200).optional(),
  })
  .refine((d) => Boolean(d.email || d.phone), { message: "email or phone is required" });

export const POST = withGuard(
  withApiKey(async (req: Request) => {
    const parsed = Body.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    const contact = await createContactRecord(parsed.data);
    return NextResponse.json({ ok: true, contact: serializeContact(contact) }, { status: 201 });
  }),
);

export const GET = withGuard(
  withApiKey(async (req: Request) => {
    const contacts = await getProvider().listContacts();
    const limit = readLimit(req);
    return NextResponse.json({ data: contacts.slice(0, limit).map(serializeContact), count: Math.min(contacts.length, limit), total: contacts.length });
  }),
);
