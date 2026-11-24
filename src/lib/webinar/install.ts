import crypto from "node:crypto";
import { getFreeDb } from "@/lib/free/db";
import { WEBINAR_PLATFORMS, platformStatus, type PlatformArm } from "@/lib/webinar/platforms";

const INSTALL_ORG = "local";
const INSTALL_KIND = "webinar-install";

function envSecret(): string | undefined {
  const generic = (process.env.WEBINAR_WEBHOOK_SECRET ?? "").trim();
  const beacon = (process.env.WEBINAR_BEACON_TOKEN ?? "").trim();
  return generic || beacon || undefined;
}

/**
 * The secret pasted into every platform and into the beacon snippet.
 * An env var wins. Otherwise the free host generates one and keeps it in the
 * database, so detection is armed without anyone setting a variable.
 * Tests and a Supabase deploy do not generate one.
 */
export function installSecret(): string | undefined {
  const fromEnv = envSecret();
  if (fromEnv) return fromEnv;
  const db = getFreeDb();
  if (!db) return undefined;
  const existing = db.readDoc<{ secret?: string }>(INSTALL_ORG, INSTALL_KIND);
  if (existing?.secret) return existing.secret;
  const secret = crypto.randomBytes(24).toString("base64url");
  db.writeDoc(INSTALL_ORG, INSTALL_KIND, { secret });
  return secret;
}

export interface WebinarConnectRow extends PlatformArm {
  webhookUrl: string | null;
  beaconUrl: string | null;
  snippet: string | null;
}

/** Copy-paste URLs for the settings page. `origin` is this deployment's public host. */
export function webinarConnect(origin: string): { secret: string | null; rows: WebinarConnectRow[] } {
  const secret = installSecret() ?? null;
  const base = origin.replace(/\/$/, "");
  const rows = platformStatus(secret).map((row) => {
    const platform = WEBINAR_PLATFORMS.find((p) => p.id === row.id);
    if (!secret || !base) return { ...row, webhookUrl: null, beaconUrl: null, snippet: null };
    const token = encodeURIComponent(secret);
    const webhookUrl = platform?.webhook ? `${base}/api/webinar/events?provider=${row.id}&token=${token}` : null;
    const beaconUrl = `${base}/api/webinar/beacon.js?provider=${row.id}&token=${token}`;
    const snippet = `<script>
window.RR_WEBINAR = { sessionId: "SESSION_ID", email: "LEAD_EMAIL", phone: "LEAD_PHONE", name: "LEAD_NAME", consent: { call: true, sms: true } };
</script>
<script src="${beaconUrl}"></script>`;
    return { ...row, webhookUrl, beaconUrl, snippet };
  });
  return { secret, rows };
}
