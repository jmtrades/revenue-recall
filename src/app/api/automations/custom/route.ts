import { NextResponse } from "next/server";
import { z } from "zod";
import {
  listCustomAutomations,
  createCustomAutomation,
  updateCustomAutomation,
  deleteCustomAutomation,
} from "@/lib/automations/custom-store";
import { requireRole } from "@/lib/authz";
import { writeRateLimit } from "@/lib/ratelimit";
import { withGuard } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

/**
 * CRUD for org-authored custom automation rules. Reading is open to any member;
 * authoring is owner/admin (it changes org-wide engine behavior). The executor
 * and a pure evaluator enforce the same shapes; zod validates at the boundary.
 */
const ConditionZ = z.object({
  field: z.enum(["value", "source", "pipeline"]),
  op: z.enum(["eq", "gt", "gte", "lt", "lte", "contains"]),
  value: z.union([z.string().max(200), z.number()]),
});

const ActionZ = z.discriminatedUnion("type", [
  z.object({ type: z.literal("create_task"), title: z.string().trim().min(1).max(160), dueInDays: z.number().int().min(0).max(365).optional() }),
  z.object({ type: z.literal("enroll_sequence"), sequenceId: z.string().trim().min(1).max(200) }),
  z.object({ type: z.literal("notify_owner"), message: z.string().trim().max(500).optional() }),
]);

const CreateBody = z.object({
  name: z.string().trim().min(1).max(80),
  triggerKind: z.enum(["stage_changed", "deal_won", "deal_lost", "lead_created"]),
  stageId: z.string().trim().max(200).nullish(),
  conditions: z.array(ConditionZ).max(10).optional().default([]),
  actions: z.array(ActionZ).min(1).max(10),
  enabled: z.boolean().optional(),
});

const PatchBody = z
  .object({
    id: z.string().min(1).max(200),
    name: z.string().trim().min(1).max(80).optional(),
    triggerKind: z.enum(["stage_changed", "deal_won", "deal_lost", "lead_created"]).optional(),
    stageId: z.string().trim().max(200).nullish(),
    conditions: z.array(ConditionZ).max(10).optional(),
    actions: z.array(ActionZ).min(1).max(10).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((d) => Object.keys(d).length > 1, { message: "Provide a field to update" });

const DeleteBody = z.object({ id: z.string().min(1).max(200) });

function dbUnavailable(e: unknown) {
  const msg = e instanceof Error ? e.message : "Failed";
  return /require a database|No active org/.test(msg)
    ? NextResponse.json({ error: "Custom automations need a connected database." }, { status: 409 })
    : NextResponse.json({ error: msg }, { status: 409 });
}

/** List the org's custom automations (any member). */
export const GET = withGuard(async () => {
  return NextResponse.json({ automations: await listCustomAutomations() });
});

export const POST = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!writeRateLimit(req, "custom-automation").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = CreateBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "A rule needs a name, a trigger, and at least one action." }, { status: 400 });
  try {
    const automation = await createCustomAutomation(parsed.data);
    return NextResponse.json({ ok: true, automation }, { status: 201 });
  } catch (e) {
    return dbUnavailable(e);
  }
});

export const PATCH = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!writeRateLimit(req, "custom-automation").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = PatchBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid update" }, { status: 400 });
  const { id, ...patch } = parsed.data;
  try {
    await updateCustomAutomation(id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return dbUnavailable(e);
  }
});

export const DELETE = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!writeRateLimit(req, "custom-automation").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = DeleteBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await deleteCustomAutomation(parsed.data.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return dbUnavailable(e);
  }
});
