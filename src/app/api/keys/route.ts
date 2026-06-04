import { NextResponse } from "next/server";
import { withGuard } from "@/lib/api/guard";
import { requireRole } from "@/lib/authz";
import { getApiKeyInfo, rotateApiKey, revokeApiKey } from "@/lib/api-keys-server";
import { maskApiKey } from "@/lib/api-keys";
import { recordAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Current key status (never the plaintext — that's shown once at rotation). */
export const GET = withGuard(async () => {
  const info = await getApiKeyInfo();
  return NextResponse.json({
    present: info.present,
    prefix: info.prefix,
    masked: info.prefix ? maskApiKey(info.prefix) : null,
  });
});

/** Generate (or regenerate) the workspace API key. Owner/admin only. */
export const POST = withGuard(async () => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  const key = await rotateApiKey();
  await recordAudit("api_key.rotate");
  // The plaintext is returned exactly once — the client must surface it now.
  return NextResponse.json({ key });
});

/** Revoke the workspace API key. Owner/admin only. */
export const DELETE = withGuard(async () => {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  await revokeApiKey();
  await recordAudit("api_key.revoke");
  return NextResponse.json({ ok: true });
});
