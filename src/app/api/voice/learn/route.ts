import { NextResponse } from "next/server";
import { z } from "zod";
import { learnVoice } from "@/lib/voice";
import { aiRateLimit } from "@/lib/ratelimit";
import { withGuard } from "@/lib/api/guard";
import { requireRole } from "@/lib/authz";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  senderName: z.string().max(120).optional(),
  role: z.string().max(160).optional(),
  signature: z.string().max(200).optional(),
  samples: z.string().max(8000).optional(),
  business: z.string().max(4000).optional(),
  customNextSteps: z.string().max(4000).optional(),
  customReengage: z.string().max(4000).optional(),
  // An http(s) URL, or "" to clear it. Restricting the protocol blocks
  // javascript:/data: links from ever reaching a drafted email or SMS.
  bookingUrl: z.union([z.string().url().max(500).regex(/^https?:\/\//i), z.literal("")]).optional(),
});

// The persona/voice is an ORG-WIDE setting that shapes every member's drafted
// email/SMS, so it's owner/admin only — matching its siblings voice/select and
// voice/hosted (a rep shouldn't be able to rewrite the whole org's voice).
export const POST = withGuard(async (req: Request) => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  if (!(await aiRateLimit(req, "voice-learn")).ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Add a description or a writing sample first." }, { status: 400 });
  const { senderName, role, signature, samples, business, customNextSteps, customReengage, bookingUrl } = parsed.data;
  // Accept anything worth saving — name/role/signature are useful on their own
  // (they shape sign-offs), even before a writing sample is added. Only reject a
  // wholly empty request.
  const hasSomething = [senderName, role, signature, samples, business, customNextSteps, customReengage, bookingUrl].some((v) => v?.trim());
  if (!hasSomething) {
    return NextResponse.json({ error: "Add your name, a writing sample, or some go-to lines first." }, { status: 400 });
  }
  // Guard against a junk "voice" trained on a single character (e.g. "b").
  // The fields that actually teach the voice are the business description and
  // writing samples — if a business description is given it must be a real
  // phrase, unless backed by a substantive writing sample. (Name/signature-only
  // saves still pass: those just shape sign-offs, they don't claim a "voice".)
  const biz = business?.trim() ?? "";
  const samp = samples?.trim() ?? "";
  if (biz && biz.length < 12 && samp.length < 20) {
    return NextResponse.json({ error: "Tell us a bit more about what your business does (a sentence is plenty), or paste a real message — a single word isn't enough to learn your voice." }, { status: 400 });
  }
  try {
    const voice = await learnVoice(parsed.data);
    return NextResponse.json(voice);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
});
