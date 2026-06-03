import { NextResponse } from "next/server";
import { gatewayDiagnostics } from "@/lib/calls/diagnostics";

export const dynamic = "force-dynamic";

/** Auth-gated (via middleware) live check of the calling path: channel status +
 *  a real ping of the call-gateway. Pings an operator-set URL only — no user
 *  input — so there's no SSRF surface. */
export async function GET() {
  return NextResponse.json(await gatewayDiagnostics());
}
