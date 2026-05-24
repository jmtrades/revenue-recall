import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: Request) {
  let email = "";
  let source = "";
  try {
    const body = await req.json();
    email = String(body?.email ?? "").trim().toLowerCase();
    source = String(body?.source ?? "").slice(0, 64);
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }

  const sb = getSupabase();
  if (!sb) return NextResponse.json({ error: "Not configured." }, { status: 503 });

  const { error } = await sb.from("waitlist").insert({ email, source: source || null });
  // Treat a duplicate email as success — the visitor is already on the list.
  if (error && error.code !== "23505") {
    return NextResponse.json({ error: "Could not save. Try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
