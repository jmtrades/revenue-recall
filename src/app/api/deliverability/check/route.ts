import { NextResponse } from "next/server";
import { sendingDomain, checkDomainAuth } from "@/lib/deliverability";
import { writeRateLimit } from "@/lib/ratelimit";
import { withGuard } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

/**
 * Live DNS verification of the sending domain's SPF + DMARC. Auth-gated (in-app),
 * rate-limited, and only ever checks the platform's OWN configured EMAIL_FROM
 * domain — never a user-supplied host — so it can't be used as a DNS probe.
 */
export const GET = withGuard(async (req: Request) => {
  if (!writeRateLimit(req, "deliverability").ok) return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  const domain = sendingDomain();
  if (!domain) return NextResponse.json({ configured: false });
  const status = await checkDomainAuth(domain);
  return NextResponse.json({ configured: true, status });
});
