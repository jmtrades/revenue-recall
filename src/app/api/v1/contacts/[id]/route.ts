import { NextResponse } from "next/server";
import { z } from "zod";
import { withGuard } from "@/lib/api/guard";
import { withApiKey } from "@/lib/api/auth";
import { resolveProvider } from "@/lib/crm/registry";
import { updateContactRecord, serializeContact } from "@/lib/contacts";

export const dynamic = "force-dynamic";

/** Public API — GET / PATCH a single contact. */
const Patch = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    email: z.string().trim().email().max(200).optional(),
    phone: z.string().trim().min(3).max(40).optional(),
    company: z.string().trim().max(200).optional(),
    title: z.string().trim().max(200).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "Provide at least one field to update" });

export const GET = withGuard(
  withApiKey<{ params: Promise<{ id: string }> }>(async (_req, _orgId, { params }) => {
    const contact = await (await resolveProvider()).getContact((await params).id);
    if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    return NextResponse.json({ contact: serializeContact(contact) });
  }),
);

export const PATCH = withGuard(
  withApiKey<{ params: Promise<{ id: string }> }>(async (req, _orgId, { params }) => {
    const parsed = Patch.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    const updated = await updateContactRecord((await params).id, parsed.data);
    if (!updated) return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    return NextResponse.json({ ok: true, contact: serializeContact(updated) });
  }),
);
