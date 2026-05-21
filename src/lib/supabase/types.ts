/** Postgres row shapes for the built-in CRM schema (supabase/migrations). */

export interface OrgRow {
  id: string;
  name: string;
  industry_id: string;
  provider_id: string;
  currency: string;
  created_at: string;
}

export interface MemberRow {
  id: string;
  org_id: string;
  name: string;
  email: string | null;
  role: string;
  auth_user_id: string | null;
}

export interface PipelineRow {
  id: string;
  org_id: string;
  label: string;
  position: number;
}

export interface StageRow {
  id: string;
  pipeline_id: string;
  label: string;
  probability: number | string;
  type: "open" | "won" | "lost";
  position: number;
}

export interface ContactRow {
  id: string;
  org_id: string;
  name: string;
  company: string | null;
  title: string | null;
  points: { channel: string; value: string; label?: string }[] | null;
  attributes: Record<string, string | number | boolean | null> | null;
  created_at: string;
}

export interface OpportunityRow {
  id: string;
  org_id: string;
  pipeline_id: string;
  stage_id: string;
  contact_id: string | null;
  title: string;
  value: number | string;
  currency: string;
  owner_id: string | null;
  source: string | null;
  tags: string[] | null;
  expected_close_at: string | null;
  last_activity_at: string | null;
  closed_at: string | null;
  loss_reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActivityRow {
  id: string;
  org_id: string;
  opportunity_id: string | null;
  contact_id: string | null;
  kind: string;
  summary: string;
  direction: "inbound" | "outbound" | null;
  owner_id: string | null;
  occurred_at: string;
}
