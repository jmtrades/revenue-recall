import { getProvider } from "@/lib/crm/registry";
import { getConfig } from "@/lib/config";
import { getIndustry } from "@/lib/industries";
import { computeMetrics, type PipelineMetrics } from "@/lib/analytics";
import { buildRecallQueue, summarizeRecall, type RecallItem, type RecallSummary } from "@/lib/recall/engine";
import type { Contact, Opportunity, Pipeline } from "@/lib/crm/types";

/** Everything the dashboard needs in one round trip. */
export interface Overview {
  orgName: string;
  industryLabel: string;
  providerLabel: string;
  terminology: ReturnType<typeof getIndustry>["terminology"];
  pipeline: Pipeline;
  metrics: PipelineMetrics;
  recall: RecallItem[];
  recallSummary: RecallSummary;
}

export async function getOverview(): Promise<Overview> {
  const provider = getProvider();
  const cfg = getConfig();
  const industry = getIndustry(cfg.industryId);

  const [pipelines, opportunities] = await Promise.all([provider.listPipelines(), provider.listOpportunities()]);
  const pipeline = pipelines[0];
  const metrics = computeMetrics(opportunities, pipeline);
  const recall = buildRecallQueue(opportunities, pipelines);
  const recallSummary = summarizeRecall(recall, metrics.currency);

  return {
    orgName: cfg.orgName,
    industryLabel: industry.label,
    providerLabel: provider.info().label,
    terminology: industry.terminology,
    pipeline,
    metrics,
    recall,
    recallSummary,
  };
}

export interface BoardData {
  pipeline: Pipeline;
  opportunities: Opportunity[];
  contacts: Map<string, Contact>;
}

export async function getBoard(): Promise<BoardData> {
  const provider = getProvider();
  const [pipelines, opportunities, contacts] = await Promise.all([
    provider.listPipelines(),
    provider.listOpportunities(),
    provider.listContacts(),
  ]);
  return {
    pipeline: pipelines[0],
    opportunities,
    contacts: new Map(contacts.map((c) => [c.id, c])),
  };
}

export async function getRecallQueue(): Promise<{ items: RecallItem[]; summary: RecallSummary; contacts: Map<string, Contact>; opps: Map<string, Opportunity> }> {
  const provider = getProvider();
  const [pipelines, opportunities, contacts] = await Promise.all([
    provider.listPipelines(),
    provider.listOpportunities(),
    provider.listContacts(),
  ]);
  const items = buildRecallQueue(opportunities, pipelines);
  const currency = opportunities[0]?.currency ?? "USD";
  return {
    items,
    summary: summarizeRecall(items, currency),
    contacts: new Map(contacts.map((c) => [c.id, c])),
    opps: new Map(opportunities.map((o) => [o.id, o])),
  };
}

export async function getLeads(): Promise<{ contacts: Contact[]; opps: Map<string, Opportunity> }> {
  const provider = getProvider();
  const [contacts, opportunities] = await Promise.all([provider.listContacts(), provider.listOpportunities()]);
  const byContact = new Map<string, Opportunity>();
  for (const o of opportunities) if (!byContact.has(o.contactId)) byContact.set(o.contactId, o);
  return { contacts, opps: byContact };
}
