import { getSupabase } from "@/lib/supabase/client";
import { getConfig } from "@/lib/config";
import { getIndustry } from "@/lib/industries";
import { seedDataset } from "@/lib/data/seed";

export interface BootstrapResult {
  orgId: string;
  pipelineId: string;
  counts: { stages: number; members: number; contacts: number; opportunities: number; activities: number };
}

/**
 * Initialize a fresh Supabase database for one org: creates the org, its
 * default pipeline + stages from the industry template, a default member, and
 * (optionally) realistic demo data so the UI is populated on first run.
 *
 * Idempotency is the caller's concern — run once per org.
 */
export async function bootstrapOrg(opts?: { industryId?: string; demo?: boolean; orgName?: string }): Promise<BootstrapResult> {
  const client = getSupabase();
  if (!client) throw new Error("Supabase is not configured");

  const cfg = getConfig();
  const industryId = opts?.industryId ?? cfg.industryId;
  const industry = getIndustry(industryId);
  const demo = opts?.demo ?? true;

  // 1. Org
  const { data: org, error: orgErr } = await client
    .from("orgs")
    .insert({ name: opts?.orgName ?? cfg.orgName, industry_id: industryId, provider_id: "supabase", currency: industry.currency })
    .select("id")
    .single();
  if (orgErr) throw new Error(`org: ${orgErr.message}`);
  const orgId = org.id as string;

  // 2. Pipeline + stages
  const { data: pipe, error: pipeErr } = await client
    .from("pipelines")
    .insert({ org_id: orgId, label: industry.pipeline.label, position: 0 })
    .select("id")
    .single();
  if (pipeErr) throw new Error(`pipeline: ${pipeErr.message}`);
  const pipelineId = pipe.id as string;

  const { data: stageRows, error: stageErr } = await client
    .from("stages")
    .insert(
      industry.pipeline.stages.map((s, i) => ({
        pipeline_id: pipelineId,
        label: s.label,
        probability: s.probability,
        type: s.type,
        position: i,
      })),
    )
    .select("id,label");
  if (stageErr) throw new Error(`stages: ${stageErr.message}`);
  // Map template slug -> uuid (labels are unique within a pipeline).
  const stageIdByLabel = new Map((stageRows as { id: string; label: string }[]).map((s) => [s.label, s.id]));
  const stageIdBySlug = new Map(industry.pipeline.stages.map((s) => [s.id, stageIdByLabel.get(s.label)!]));

  // 3. Default member
  const { data: member, error: memberErr } = await client
    .from("members")
    .insert({ org_id: orgId, name: "You", role: "owner" })
    .select("id")
    .single();
  if (memberErr) throw new Error(`member: ${memberErr.message}`);
  const memberId = member.id as string;

  const counts = { stages: industry.pipeline.stages.length, members: 1, contacts: 0, opportunities: 0, activities: 0 };

  if (!demo) return { orgId, pipelineId, counts };

  // 4. Demo data
  const ds = seedDataset(industryId);

  const { data: contactRows, error: cErr } = await client
    .from("contacts")
    .insert(ds.contacts.map((c) => ({ org_id: orgId, name: c.name, company: c.company ?? null, points: c.points, attributes: c.attributes ?? {} })))
    .select("id");
  if (cErr) throw new Error(`contacts: ${cErr.message}`);
  const contactIdBySeed = new Map(ds.contacts.map((c, i) => [c.id, (contactRows as { id: string }[])[i].id]));
  counts.contacts = ds.contacts.length;

  const { data: oppRows, error: oErr } = await client
    .from("opportunities")
    .insert(
      ds.opportunities.map((o) => ({
        org_id: orgId,
        pipeline_id: pipelineId,
        stage_id: stageIdBySlug.get(o.stageId)!,
        contact_id: contactIdBySeed.get(o.contactId) ?? null,
        title: o.title,
        value: o.value,
        currency: o.currency,
        owner_id: memberId,
        source: o.source ?? null,
        expected_close_at: o.expectedCloseAt ?? null,
        last_activity_at: o.lastActivityAt ?? null,
        closed_at: o.closedAt ?? null,
        loss_reason: o.lossReason ?? null,
        created_at: o.createdAt,
        updated_at: o.updatedAt,
      })),
    )
    .select("id");
  if (oErr) throw new Error(`opportunities: ${oErr.message}`);
  const oppIdBySeed = new Map(ds.opportunities.map((o, i) => [o.id, (oppRows as { id: string }[])[i].id]));
  counts.opportunities = ds.opportunities.length;

  if (ds.activities.length > 0) {
    const { error: aErr } = await client.from("activities").insert(
      ds.activities.map((a) => ({
        org_id: orgId,
        opportunity_id: a.opportunityId ? oppIdBySeed.get(a.opportunityId) ?? null : null,
        contact_id: a.contactId ? contactIdBySeed.get(a.contactId) ?? null : null,
        kind: a.kind,
        summary: a.summary,
        direction: a.direction ?? null,
        owner_id: memberId,
        occurred_at: a.occurredAt,
      })),
    );
    if (aErr) throw new Error(`activities: ${aErr.message}`);
    counts.activities = ds.activities.length;
  }

  return { orgId, pipelineId, counts };
}
