import { getFreeDb } from "@/lib/free/db";
import type { ChannelStatus } from "@/lib/offers/setter";
import type { ParsedLead, ReactivationEstimate } from "@/lib/offers/reactivation";
import type { TriageBand } from "@/lib/offers/triage";

export interface SetterRun {
  id: string;
  at: string;
  name: string;
  email: string;
  phone: string;
  business: string;
  triage: TriageBand;
  call: ChannelStatus;
  sms: ChannelStatus;
  emailStatus: ChannelStatus;
  reason: string;
  test?: boolean;
}

export interface ReactivationCampaign {
  id: string;
  at: string;
  name: string;
  email: string;
  status: "draft" | "approved";
  estimate: ReactivationEstimate;
  leadCount: number;
  leads: ParsedLead[];
}

const SETTER = "setter-runs";
const CAMPAIGNS = "reactivation-campaigns";

function read<T>(kind: string): T[] {
  return getFreeDb()?.readDoc<T[]>("local", kind) ?? [];
}

export function listSetterRuns(): SetterRun[] {
  return read<SetterRun>(SETTER);
}

export function saveSetterRun(run: SetterRun): void {
  const db = getFreeDb();
  const next = [run, ...read<SetterRun>(SETTER)].slice(0, 200);
  if (db) db.writeDoc("local", SETTER, next);
}

export function listCampaigns(): ReactivationCampaign[] {
  return read<ReactivationCampaign>(CAMPAIGNS);
}

export function saveCampaign(campaign: ReactivationCampaign): void {
  const db = getFreeDb();
  const next = [campaign, ...read<ReactivationCampaign>(CAMPAIGNS).filter((c) => c.id !== campaign.id)].slice(0, 100);
  if (db) db.writeDoc("local", CAMPAIGNS, next);
}

export function approveCampaign(id: string): ReactivationCampaign | null {
  const rows = read<ReactivationCampaign>(CAMPAIGNS);
  const found = rows.find((c) => c.id === id);
  if (!found) return null;
  found.status = "approved";
  getFreeDb()?.writeDoc("local", CAMPAIGNS, rows);
  return found;
}
