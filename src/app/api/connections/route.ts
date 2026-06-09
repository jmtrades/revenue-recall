import { NextResponse } from "next/server";
import { z } from "zod";
import { getProviderSpec, CONNECTION_SPECS } from "@/lib/connections/spec";
import { saveConnection, deleteConnection, listConnections } from "@/lib/connections/store";
import { encryptionAvailable } from "@/lib/crypto";
import { requireRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

/**
 * Per-org connection management. Authenticated org members only (gated by
 * middleware). Splits submitted fields into encrypted secrets vs plain config
 * per the provider spec, and never returns secret values — only which keys are
 * set, so the UI can show "connected" without exposing tokens.
 */

const Body = z.object({
  provider: z.string().min(1).max(40),
  values: z.record(z.string().max(8000)),
});

export async function GET() {
  // Integration topology (which CRM/database/social providers are connected and
  // their account refs) is owner/admin-only — a rep has no need to enumerate it,
  // matching the POST/DELETE gating below.
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  const conns = await listConnections();
  // Sanitized: report which fields are set, not their values.
  const out = conns.map((c) => ({
    provider: c.provider,
    kind: c.kind,
    connected: c.connected,
    accountRef: c.accountRef,
    setFields: [...Object.keys(c.secrets), ...Object.keys(c.config)],
  }));
  return NextResponse.json({ connections: out, encryptionAvailable: encryptionAvailable() });
}

export async function POST(req: Request) {
  // These are ORG-WIDE credentials (CRM/database/social/comms secrets) — only an
  // owner/admin may change them, not any member (a rep must not be able to
  // repoint the org's data source or overwrite its integrations).
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid connection payload" }, { status: 400 });

  const spec = getProviderSpec(parsed.data.provider);
  if (!spec) return NextResponse.json({ error: "Unknown provider" }, { status: 404 });

  // Required-field check.
  for (const f of spec.fields) {
    if (f.required && !parsed.data.values[f.key]?.trim()) {
      return NextResponse.json({ error: `${f.label} is required` }, { status: 400 });
    }
  }

  const secrets: Record<string, string> = {};
  const config: Record<string, string> = {};
  for (const f of spec.fields) {
    const v = parsed.data.values[f.key]?.trim();
    if (!v) continue;
    if (f.secret) secrets[f.key] = v;
    else config[f.key] = v;
  }
  const accountRef = spec.accountRefKey ? (config[spec.accountRefKey] ?? secrets[spec.accountRefKey]) : undefined;

  try {
    await saveConnection({ kind: spec.kind, provider: spec.provider, accountRef, secrets, config });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Save failed" }, { status: 409 });
  }
}

const DeleteBody = z.object({ provider: z.string().min(1).max(40) });

export async function DELETE(req: Request) {
  const denied = await requireRole("owner", "admin");
  if (denied) return denied;
  const parsed = DeleteBody.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "provider required" }, { status: 400 });
  if (!CONNECTION_SPECS.some((s) => s.provider === parsed.data.provider)) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 404 });
  }
  await deleteConnection(parsed.data.provider);
  return NextResponse.json({ ok: true });
}
