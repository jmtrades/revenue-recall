export type AgentTrigger = "manual" | "daily" | "on_new_lead" | "on_idle_deal";
export type AgentChannel = "email" | "sms" | "call" | "none";
export type AgentAutonomy = "review" | "auto";

export interface AgentTask {
  id: string;
  name: string;
  /** Natural-language instruction the AI follows when working each deal. */
  goal: string;
  trigger: AgentTrigger;
  /** recall_queue | all_open | stage:<id> | deal:<id> */
  scope: string;
  channel: AgentChannel;
  autonomy: AgentAutonomy;
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
}

export interface NewAgentTask {
  name: string;
  goal: string;
  trigger?: AgentTrigger;
  scope?: string;
  channel?: AgentChannel;
  autonomy?: AgentAutonomy;
}

export interface AgentAction {
  type: string; // email | sms | call | recommend
  dealId?: string;
  title: string;
  detail: string;
  result: "sent" | "logged" | "drafted" | "queued" | "skipped";
  source: "ai" | "template";
  value?: number;
}

/** Channels a queued outbox item can be sent on: email/sms + social platforms. */
export type OutboxChannel = "email" | "sms" | "whatsapp" | "instagram" | "messenger" | "telegram" | "x" | "linkedin";

export interface OutboxItem {
  id: string;
  runId?: string;
  taskId?: string;
  dealId?: string;
  contactId?: string;
  channel: OutboxChannel;
  subject?: string;
  body: string;
  status: "pending" | "sent" | "dismissed";
  source: "ai" | "template";
  createdAt: string;
  sentAt?: string;
}

export interface AgentRun {
  id: string;
  taskId: string;
  status: "running" | "completed" | "failed";
  summary: string;
  actions: AgentAction[];
  itemsProcessed: number;
  recoverable: number;
  ai: boolean;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}
