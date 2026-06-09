import { NextResponse } from "next/server";
import { z } from "zod";
import { createCustomTemplate, updateCustomTemplate, deleteCustomTemplate } from "@/lib/templates-store";
import { requireRole } from "@/lib/authz";
import { writeRateLimit } from "@/lib/ratelimit";
import { withGuard } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

const CreateBody = z.object({
  name: z.string().trim().min(1).max(80),
  channel: z.enum(["email", "sms"]),
  subject: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1).max(5000),
});

const PatchBody = z
  .object({
    id: z.string().min(1).max(200),
    name: z.string().trim().min(1).max(80).optional(),
    channel: z.enum(["email", "sms"]).optional(),
    subject: z.string().trim().max(200).optional(),
    body: z.string().trim().min(1).max(5000).optional(),
  })
  .refine((d) => d.name !== undefined || d.channel !== undefined || d.subject !== undefined || d.body !== undefined, {
    message: "Provide a field to update",
  });

const DeleteBody = z.object({ id: z.string().min(1).max(200) });

function dbUnavailable(e: unknown) {
  const msg = e instanceof Error ? e.message : "Failed";
  return /require a database|No active org/.test(msg)
    ? NextResponse.json({ error: "Custom templates need a connected database." }, { status: 409 })
    : NextResponse.json({ error: msg }, { status: 409 });
}

/** Create an org template. Owner/admin; org-scoped by the store. */
export const POST = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!writeRateLimit(req, "template-edit").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A template needs a name, channel, and body." }, { status: 400 });
  try {
    const template = await createCustomTemplate(parsed.data);
    return NextResponse.json({ ok: true, template }, { status: 201 });
  } catch (e) {
    return dbUnavailable(e);
  }
});

export const PATCH = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!writeRateLimit(req, "template-edit").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid template update" }, { status: 400 });
  const { id, ...patch } = parsed.data;
  try {
    await updateCustomTemplate(id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return dbUnavailable(e);
  }
});

export const DELETE = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!writeRateLimit(req, "template-edit").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = DeleteBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await deleteCustomTemplate(parsed.data.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return dbUnavailable(e);
  }
});
