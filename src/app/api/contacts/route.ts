import { NextResponse } from "next/server";
import { getProvider } from "@/lib/crm/registry";
import { z } from "zod";

const Body = z.object({
  name: z.string().min(1).max(200),
  company: z.string().max(200).optional(),
  title: z.string().max(200).optional(),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(50).optional().or(z.literal("")),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid contact" }, { status: 400 });
  const { name, company, title, email, phone } = parsed.data;

  const points = [
    ...(email ? [{ channel: "email" as const, value: email }] : []),
    ...(phone ? [{ channel: "phone" as const, value: phone }] : []),
  ];

  try {
    const contact = await getProvider().createContact({ name, company, title, points, attributes: {} });
    return NextResponse.json({ contact }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 409 });
  }
}
