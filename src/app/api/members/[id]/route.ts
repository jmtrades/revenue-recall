import { NextResponse } from "next/server";
import { z } from "zod";
import { updateMemberRole, removeMember } from "@/lib/members-server";
import { MEMBER_ROLES } from "@/lib/members";
import { requireRole, type MemberRole } from "@/lib/authz";
import { recordAudit } from "@/lib/audit";
import { writeRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

const PatchBody = z.object({ role: z.enum(MEMBER_ROLES as [string, ...string[]]) });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!writeRateLimit(req, "members").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;

  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick a valid role." }, { status: 400 });
  try {
    const member = await updateMemberRole(params.id, parsed.data.role as MemberRole);
    await recordAudit("member.role_changed", `${params.id} → ${parsed.data.role}`);
    return NextResponse.json({ member });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't update role" }, { status: 409 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  try {
    await removeMember(params.id);
    await recordAudit("member.removed", params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't remove member" }, { status: 409 });
  }
}
