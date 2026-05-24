import { NextResponse } from "next/server";
import { z } from "zod";
import { handleInbound } from "@/lib/inbound";
import { authorizeSecret } from "@/lib/security";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  from: z.string().min(3),
  subject: z.string().optional(),
  text: z.string().min(1),
});

/** Generic inbound-email webhook (JSON). Point your email provider's inbound
 *  parse / forwarding webhook here. Authorize with INBOUND_TOKEN via an
 *  `Authorization: Bearer` header (preferred) or `?token=`. */
export async function POST(req: Request) {
  const token = process.env.INBOUND_TOKEN;
  if (token && !authorizeSecret(req, token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid payload" }, { status: 400 });

  const result = await handleInbound("email", parsed.data.from, parsed.data.text, parsed.data.subject);
  return NextResponse.json(result);
}
