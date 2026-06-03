import { NextResponse } from "next/server";
import { gatewayDiagnostics } from "@/lib/calls/diagnostics";
import { withGuard } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

/** Auth-gated (via middleware) live check of the calling path: channel status +
 *  a real ping of the call-gateway. Pings an operator-set URL only — no user
 *  input — so there's no SSRF surface. */
export const GET = withGuard(async () => {
  return NextResponse.json(await gatewayDiagnostics());
});
