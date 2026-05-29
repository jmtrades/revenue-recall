import { cache } from "@/lib/cache";
import { getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getConfig } from "@/lib/config";
import { getIndustry } from "@/lib/industries";
import { DEFAULT_LANGUAGE } from "@/lib/languages";
import { defaultNotificationPrefs, mergeNotificationPrefs, type NotificationPrefs } from "@/lib/notifications";
import { defaultTheme, mergeTheme, type Theme } from "@/lib/theme";

export { NOTIFICATION_OPTIONS, defaultNotificationPrefs, mergeNotificationPrefs, type NotificationPrefs } from "@/lib/notifications";

export interface OrgCompliance {
  /** Sender name shown in the email footer (defaults to the org name). */
  senderName?: string;
  /** Physical postal address — legally required in commercial email (CAN-SPAM). */
  address?: string;
}

export interface OrgSettings {
  id?: string;
  name: string;
  industryId: string;
  /** ISO 639-1 language the workspace sells in (drives AI drafting + voice). */
  language: string;
  currency: string;
  monthlyQuota: number;
  notificationPrefs: NotificationPrefs;
  theme: Theme;
  compliance: OrgCompliance;
  /** true when backed by a database row (editable), false when env-derived. */
  persisted: boolean;
}

function mergeCompliance(stored?: Record<string, unknown> | null): OrgCompliance {
  const s = (stored && typeof stored === "object" ? stored : {}) as Record<string, unknown>;
  return {
    senderName: typeof s.senderName === "string" && s.senderName ? s.senderName : undefined,
    address: typeof s.address === "string" && s.address ? s.address : undefined,
  };
}

function envFallback(): OrgSettings {
  const cfg = getConfig();
  return {
    name: cfg.orgName,
    industryId: cfg.industryId,
    language: DEFAULT_LANGUAGE,
    currency: getIndustry(cfg.industryId).currency,
    monthlyQuota: cfg.monthlyQuota,
    notificationPrefs: defaultNotificationPrefs(),
    theme: defaultTheme(),
    compliance: {},
    persisted: false,
  };
}

async function read(): Promise<OrgSettings> {
  const client = getSupabase();
  if (!client) return envFallback();
  const orgId = await resolveActiveOrgId();
  if (!orgId) return envFallback();
  const { data } = await client
    .from("orgs")
    .select("id,name,industry_id,language,currency,monthly_quota,notification_prefs,theme,compliance")
    .eq("id", orgId)
    .maybeSingle();
  if (!data) return envFallback();
  return {
    id: data.id as string,
    name: (data.name as string) ?? getConfig().orgName,
    industryId: (data.industry_id as string) ?? "generic",
    language: (data.language as string) ?? DEFAULT_LANGUAGE,
    currency: (data.currency as string) ?? "USD",
    monthlyQuota: Number(data.monthly_quota ?? getConfig().monthlyQuota),
    notificationPrefs: mergeNotificationPrefs(data.notification_prefs as Record<string, unknown> | null),
    theme: mergeTheme(data.theme as Record<string, unknown> | null),
    compliance: mergeCompliance(data.compliance as Record<string, unknown> | null),
    persisted: true,
  };
}

/** Current org settings (DB-backed when available, else env). Request-cached. */
export const getOrgSettings = cache(read);

export async function updateOrgSettings(patch: {
  name?: string;
  industryId?: string;
  language?: string;
  monthlyQuota?: number;
  notificationPrefs?: NotificationPrefs;
  theme?: Partial<Theme>;
  compliance?: OrgCompliance;
}): Promise<OrgSettings> {
  const client = getSupabase();
  if (!client) throw new Error("Settings are read-only without a database.");
  const orgId = await resolveActiveOrgId();
  if (!orgId) throw new Error("No active org.");
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  // Switching industry re-tunes pipeline terminology/playbooks and follows the
  // template's native currency.
  if (patch.industryId !== undefined) {
    update.industry_id = patch.industryId;
    update.currency = getIndustry(patch.industryId).currency;
  }
  if (patch.language !== undefined) update.language = patch.language;
  if (patch.monthlyQuota !== undefined) update.monthly_quota = patch.monthlyQuota;
  if (patch.notificationPrefs !== undefined) update.notification_prefs = mergeNotificationPrefs(patch.notificationPrefs);
  // Merge a partial theme patch over the org's current theme so changing the
  // mode never resets the accent (or vice-versa).
  if (patch.theme !== undefined) {
    const current = await read();
    update.theme = mergeTheme({ ...current.theme, ...patch.theme });
  }
  if (patch.compliance !== undefined) {
    const current = await read();
    update.compliance = mergeCompliance({ ...current.compliance, ...patch.compliance });
  }
  if (Object.keys(update).length === 0) return read();
  const { error } = await client.from("orgs").update(update).eq("id", orgId);
  if (error) throw new Error(error.message);
  return read();
}
