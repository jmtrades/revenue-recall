import { getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getSessionUser } from "@/lib/auth";
import type { MessageTemplate } from "@/lib/templates";

/**
 * Org-authored message templates — the write side the preset library never
 * had. Backed by the org-scoped `custom_templates` table. Reads degrade
 * gracefully (empty without a DB or before the migration lands) so every
 * surface keeps working on presets alone; writes require a database.
 */

export interface CustomTemplateInput {
  name: string;
  channel: "email" | "sms";
  subject?: string;
  body: string;
}

interface Row {
  id: string;
  name: string;
  channel: string;
  category: string;
  subject: string | null;
  body: string;
}

function toTemplate(r: Row): MessageTemplate {
  return {
    id: r.id,
    name: r.name,
    channel: r.channel as MessageTemplate["channel"],
    category: r.category,
    subject: r.subject ?? undefined,
    body: r.body,
    industries: ["*"], // org-authored → applies to the org's own industry, always shown
  };
}

/** The org's own templates (newest first). Never throws. */
export async function listCustomTemplates(): Promise<MessageTemplate[]> {
  const client = getSupabase();
  if (!client) return [];
  const orgId = await resolveActiveOrgId().catch(() => null);
  if (!orgId) return [];
  const { data, error } = await client
    .from("custom_templates")
    .select("id,name,channel,category,subject,body")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false });
  if (error) return []; // table missing / transient → presets only
  return ((data as Row[] | null) ?? []).map(toTemplate);
}

async function ctx() {
  const client = getSupabase();
  if (!client) throw new Error("Custom templates require a database.");
  const orgId = await resolveActiveOrgId();
  if (!orgId) throw new Error("No active org.");
  const user = await getSessionUser().catch(() => null);
  return { client, orgId, userId: user?.id ?? null };
}

export async function createCustomTemplate(input: CustomTemplateInput): Promise<MessageTemplate> {
  const { client, orgId, userId } = await ctx();
  const { data, error } = await client
    .from("custom_templates")
    .insert({
      org_id: orgId,
      name: input.name,
      channel: input.channel,
      subject: input.subject || null,
      body: input.body,
      created_by: userId,
    })
    .select("id,name,channel,category,subject,body")
    .single();
  if (error) throw new Error(error.message);
  return toTemplate(data as Row);
}

export async function updateCustomTemplate(id: string, patch: Partial<CustomTemplateInput>): Promise<void> {
  const { client, orgId } = await ctx();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) update.name = patch.name;
  if (patch.channel !== undefined) update.channel = patch.channel;
  if (patch.subject !== undefined) update.subject = patch.subject || null;
  if (patch.body !== undefined) update.body = patch.body;
  const { error } = await client.from("custom_templates").update(update).eq("id", id).eq("org_id", orgId);
  if (error) throw new Error(error.message);
}

export async function deleteCustomTemplate(id: string): Promise<void> {
  const { client, orgId } = await ctx();
  const { error } = await client.from("custom_templates").delete().eq("id", id).eq("org_id", orgId);
  if (error) throw new Error(error.message);
}

/** The org's templates merged ahead of the industry presets — the one accessor
 *  every surface (templates page, inbox picker) should use. */
export async function allTemplatesFor(industryId: string): Promise<MessageTemplate[]> {
  const { templatesFor } = await import("@/lib/templates");
  const custom = await listCustomTemplates();
  return [...custom, ...templatesFor(industryId)];
}
