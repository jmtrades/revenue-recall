import { NextResponse } from "next/server";
import { deleteContactRecord } from "@/lib/contacts";
import { writeRateLimit } from "@/lib/ratelimit";
import { logError, errMessage } from "@/lib/log";

/** Permanently delete a contact. Session-gated by middleware; rate-limited.
 *  Refuses a contact that still has deals (would orphan pipeline records). */
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  if (!writeRateLimit(req, "contact-delete").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  try {
    const result = await deleteContactRecord(params.id);
    if (!result.ok) {
      if (result.reason === "not_found") return NextResponse.json({ error: "Contact not found" }, { status: 404 });
      if (result.reason === "has_deals")
        return NextResponse.json({ error: "Delete or reassign this contact's deals first." }, { status: 409 });
      return NextResponse.json({ error: "This CRM doesn't support deleting contacts here." }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    logError("contacts.delete.failed", { error: errMessage(err) });
    return NextResponse.json({ error: "Failed to delete contact" }, { status: 500 });
  }
}
