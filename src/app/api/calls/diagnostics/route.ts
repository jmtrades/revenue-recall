import { NextResponse } from "next/server";
import { gatewayDiagnostics } from "@/lib/calls/diagnostics";
import { withGuard } from "@/lib/api/guard";
import { isAuthRequired } from "@/lib/config";
import { isOperator } from "@/lib/operator";

export const dynamic = "force-dynamic";

/** Live check of the calling path: channel status + a real ping of the
 *  call-gateway. Pings an operator-set URL only — no user input — so there's no
 *  SSRF surface. Operator-only (same gate as the Channels UI that renders it):
 *  the payload exposes the gateway URL/transport, deployment infra a tenant
 *  member shouldn't see. */
export const GET = withGuard(async () => {
  if (isAuthRequired() && !(await isOperator())) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }
  return NextResponse.json(await gatewayDiagnostics());
});
