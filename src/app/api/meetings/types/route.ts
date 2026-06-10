import { NextResponse } from "next/server";
import { z } from "zod";
import { createMeetingType, updateMeetingType, deleteMeetingType } from "@/lib/meetings/store";
import { slugify } from "@/lib/meetings/slug";
import { requireRole } from "@/lib/authz";
import { writeRateLimit } from "@/lib/ratelimit";
import { withGuard } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

/**
 * In-app admin for meeting types (the public booking endpoint is separate, under
 * /api/bookings). Owner/admin only; org-scoped by the store.
 */
const LOCATION = z.enum(["phone", "video", "in_person", "custom"]);

const CreateBody = z.object({
  name: z.string().trim().min(1).max(80),
  durationMinutes: z.number().int().min(5).max(480),
  locationKind: LOCATION.default("phone"),
  locationDetail: z.string().trim().max(200).optional(),
  description: z.string().trim().max(500).optional(),
  slug: z.string().trim().max(60).optional(),
  enabled: z.boolean().optional(),
});

const PatchBody = z
  .object({
    id: z.string().min(1).max(200),
    name: z.string().trim().min(1).max(80).optional(),
    durationMinutes: z.number().int().min(5).max(480).optional(),
    locationKind: LOCATION.optional(),
    locationDetail: z.string().trim().max(200).optional(),
    description: z.string().trim().max(500).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 1, { message: "Provide a field to update" });

const DeleteBody = z.object({ id: z.string().min(1).max(200) });

function dbUnavailable(e: unknown) {
  const msg = e instanceof Error ? e.message : "Failed";
  return /require a database|No active org/.test(msg)
    ? NextResponse.json({ error: "Scheduling needs a connected database." }, { status: 409 })
    : NextResponse.json({ error: msg }, { status: 409 });
}

export const POST = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!writeRateLimit(req, "meeting-type").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A meeting type needs a name and a duration." }, { status: 400 });
  const { slug, ...rest } = parsed.data;
  try {
    const meetingType = await createMeetingType({ ...rest, slug: slug ? slugify(slug) : slugify(rest.name) });
    return NextResponse.json({ ok: true, meetingType }, { status: 201 });
  } catch (e) {
    return dbUnavailable(e);
  }
});

export const PATCH = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!writeRateLimit(req, "meeting-type").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  const { id, ...patch } = parsed.data;
  try {
    await updateMeetingType(id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return dbUnavailable(e);
  }
});

export const DELETE = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!writeRateLimit(req, "meeting-type").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = DeleteBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await deleteMeetingType(parsed.data.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return dbUnavailable(e);
  }
});
