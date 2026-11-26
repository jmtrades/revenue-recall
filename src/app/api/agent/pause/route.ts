import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { resolveProvider } from "@/lib/crm/registry";

export const dynamic = "force-dynamic";

/** Pause or resume the AI on one contact. A paused contact gets no automatic reply. */
export const POST = withGuard(async (req: Request) => {
  const body = (await req.json().catch(() => null)) as { contactId?: string; paused?: boolean } | null;
  const contactId = body?.contactId?.trim() ?? "";
  if (!contactId) return NextResponse.json({ error: "Missing contact." }, { status: 400 });
  const provider = await resolveProvider();
  if (!provider.updateContact) return NextResponse.json({ error: "This workspace cannot update contacts." }, { status: 400 });
  const contacts = await provider.listContacts();
  const contact = contacts.find((c) => c.id === contactId);
  if (!contact) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  const paused = Boolean(body?.paused);
  await provider.updateContact(contact.id, {
    attributes: { ...contact.attributes, aiPaused: paused ? "true" : "false" },
  });
  return NextResponse.json({ ok: true, paused });
});
