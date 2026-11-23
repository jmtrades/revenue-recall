import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { integrationStatus } from "@/lib/integrations/status";

export const dynamic = "force-dynamic";

export const GET = withGuard(async () => {
  return NextResponse.json({ rows: integrationStatus() });
});
