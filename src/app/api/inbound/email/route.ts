import { NextResponse } from "next/server";
import { z } from "zod";
import { handleInbound } from "@/lib/inbound";
import { writeRateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  from: z.string().min(3),
  subject: z.string().optional(),
  text: z.string().min(1),
});

/** Generic inbound-email webhook (JSON). Point your email provider's inbound
 *  parse / forwarding webhook here. Token-gated via ?token=INBOUND_TOKEN. */
export async function POST(req: Request) {
  if (!writeRateLimit(req, "inbound-email").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const url = new URL(req.url);
  const token = process.env.INBOUND_TOKEN;
  if (token && url.searchParams.get("token") !== token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const result = await handleInbound("email", parsed.data.from, parsed.data.text, parsed.data.subject);
  return NextResponse.json(result);
}
