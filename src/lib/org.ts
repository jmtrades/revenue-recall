import { cache } from "@/lib/cache";
import { getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getConfig } from "@/lib/config";
import { getIndustry } from "@/lib/industries";

export interface OrgSettings {
  id?: string;
  name: string;
  industryId: string;
  currency: string;
  monthlyQuota: number;
  /** true when backed by a database row (editable), false when env-derived. */
  persisted: boolean;
}

function envFallback(): OrgSettings {
  const cfg = getConfig();
  return {
    name: cfg.orgName,
    industryId: cfg.industryId,
    currency: getIndustry(cfg.industryId).currency,
    monthlyQuota: cfg.monthlyQuota,
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
    .select("id,name,industry_id,currency,monthly_quota")
    .eq("id", orgId)
    .maybeSingle();
  if (!data) return envFallback();
  return {
    id: data.id as string,
    name: (data.name as string) ?? getConfig().orgName,
    industryId: (data.industry_id as string) ?? "generic",
    currency: (data.currency as string) ?? "USD",
    monthlyQuota: Number(data.monthly_quota ?? getConfig().monthlyQuota),
    persisted: true,
  };
}

/** Current org settings (DB-backed when available, else env). Request-cached. */
export const getOrgSettings = cache(read);

export async function updateOrgSettings(patch: { name?: string; monthlyQuota?: number }): Promise<OrgSettings> {
  const client = getSupabase();
  if (!client) throw new Error("Settings are read-only without a database.");
  const orgId = await resolveActiveOrgId();
  if (!orgId) throw new Error("No active org.");
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.monthlyQuota !== undefined) update.monthly_quota = patch.monthlyQuota;
  if (Object.keys(update).length === 0) return read();
  const { error } = await client.from("orgs").update(update).eq("id", orgId);
  if (error) throw new Error(error.message);
  return read();
}
