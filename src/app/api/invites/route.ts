import { NextResponse } from "next/server";
import { z } from "zod";
import { listInvites, createInvites, revokeInvite } from "@/lib/invites-server";
import { parseInviteEmails, normalizeRole, INVITE_ROLES } from "@/lib/invites";
import { writeRateLimit } from "@/lib/ratelimit";
import { requireRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

export async function GET() {
  // Pending invitee emails + roles are admin info — don't expose them to reps.
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  return NextResponse.json({ invites: await listInvites() });
}

const Body = z.object({
  emails: z.union([z.string(), z.array(z.string())]).optional(),
  role: z.enum(INVITE_ROLES as [string, ...string[]]).optional(),
});

export async function POST(req: Request) {
  if (!writeRateLimit(req, "invites").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const raw = Array.isArray(parsed.data.emails) ? parsed.data.emails.join("\n") : parsed.data.emails ?? "";
  const emails = parseInviteEmails(raw);
  if (emails.length === 0) return NextResponse.json({ error: "No valid email addresses." }, { status: 400 });

  try {
    const invites = await createInvites(emails, normalizeRole(parsed.data.role));
    return NextResponse.json({ invites });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Invite failed" }, { status: 409 });
  }
}

export async function DELETE(req: Request) {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  try {
    await revokeInvite(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Revoke failed" }, { status: 409 });
  }
}
