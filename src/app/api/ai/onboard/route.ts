import { NextResponse } from "next/server";
import { z } from "zod";
import { planWorkspace } from "@/lib/ai/onboard";
import { limited } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const Body = z.object({ description: z.string().min(1).max(2000) });

export async function POST(req: Request) {
  const rl = limited(req, "ai", 20, 60_000);
  if (rl) return rl;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Describe your business in a sentence or two." }, { status: 400 });

  const plan = await planWorkspace(parsed.data.description);
  return NextResponse.json(plan);
}
