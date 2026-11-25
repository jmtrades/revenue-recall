import { createHash } from "node:crypto";
import { containsUnverifiedClaim, isHardOptOut } from "@/lib/agent/guardrails";
import { getFreeDb } from "@/lib/free/db";

/**
 * The sales team, as rules first. Anthropic can rewrite the line when a key
 * is set; without one, these templates are what actually gets sent.
 */

export type AgentRole = "sdr" | "setter" | "closer" | "recovery" | "reactivation";
export type NextAction = "call" | "sms" | "email" | "dm";

export interface BantScore {
  budget: boolean;
  authority: boolean;
  need: boolean;
  timing: boolean;
  fit: number;
  score: number;
}

export interface TeamPlan {
  role: AgentRole;
  action: NextAction;
  variantId: string;
  body: string;
  paused: boolean;
  optOut: boolean;
  bant: BantScore;
  disclose: boolean;
}

const VARIANTS: Record<AgentRole, { id: string; body: string }[]> = {
  sdr: [
    { id: "sdr-a", body: "Thanks for reaching out. What are you hoping this would take off your plate?" },
    { id: "sdr-b", body: "Got it. Quick one so I don't waste your time — who is this for, and what does a good result look like?" },
  ],
  setter: [
    { id: "set-a", body: "Sounds like a fit. I can hold a short time to walk through it — want me to send a couple of slots?" },
    { id: "set-b", body: "Happy to book a call so you can see it on your own list. What day is easiest?" },
  ],
  closer: [
    { id: "close-a", body: "The useful next step is a working session on your actual pipeline, not another pitch. Want me to set that?" },
    { id: "close-b", body: "If the timing is real, I'll book the working session and you can decide after you've seen it." },
  ],
  recovery: [
    { id: "rec-a", body: "You dropped off — I can text the link to hop back in, or grab a time if now is better." },
    { id: "rec-b", body: "Missed you at the session. I can send the replay, or we can do a short call instead." },
  ],
  reactivation: [
    { id: "re-a", body: "It's been a while. If this is still on your list, I can pick it up from where we left it." },
    { id: "re-b", body: "Checking back once. If the timing's off, say so and I won't keep pinging." },
  ],
};

export function chooseRole(input: { text: string; priorTouches: number; recovering?: boolean; quiet?: boolean }): AgentRole {
  const t = input.text.toLowerCase();
  if (input.recovering || /dropped|left the|replay|webinar/.test(t)) return "recovery";
  if (input.quiet || input.priorTouches > 6) return "reactivation";
  if (/price|cost|contract|sign|ready to start|close/.test(t)) return "closer";
  if (/book|schedule|time|call|calendar|meet/.test(t)) return "setter";
  return "sdr";
}

export function scoreBant(text: string, history: string[] = []): BantScore {
  const blob = [text, ...history].join(" \n ").toLowerCase();
  const budget = /budget|afford|price is fine|we can pay|\$\d/.test(blob);
  const authority = /i decide|my call|i'm the owner|i run|founder|ceo/.test(blob);
  const need = /need|struggle|leads|pipeline|no-?shows|drop/.test(blob);
  const timing = /this week|this month|asap|now|ready|soon/.test(blob);
  const hits = [budget, authority, need, timing].filter(Boolean).length;
  const fit = Math.round((hits / 4) * 100);
  return { budget, authority, need, timing, fit, score: fit };
}

export function nextBestAction(input: { channel: string; repliedOn?: string; bant: BantScore }): NextAction {
  const ch = (input.repliedOn || input.channel || "").toLowerCase();
  if (ch === "instagram" || ch === "messenger" || ch === "whatsapp" || ch === "web") return "dm";
  if (input.bant.timing && input.bant.fit >= 50) return "call";
  if (ch === "sms" || ch === "phone") return "sms";
  if (ch === "email") return "email";
  return input.bant.fit >= 75 ? "call" : "email";
}

export function pickVariant(role: AgentRole, seed: string): { id: string; body: string } {
  const options = VARIANTS[role];
  const n = createHash("sha256").update(`${role}:${seed}`).digest()[0] % options.length;
  return options[n];
}

export function planTeamReply(input: {
  text: string;
  history?: string[];
  channel: string;
  seed: string;
  paused?: boolean;
  recovering?: boolean;
  quiet?: boolean;
  priorTouches?: number;
  bookingUrl?: string;
}): TeamPlan {
  const bant = scoreBant(input.text, input.history ?? []);
  const role = chooseRole({ text: input.text, priorTouches: input.priorTouches ?? (input.history?.length ?? 0), recovering: input.recovering, quiet: input.quiet });
  const action = nextBestAction({ channel: input.channel, bant });
  const variant = pickVariant(role, input.seed);
  if (isHardOptOut(input.text)) {
    return { role, action, variantId: variant.id, body: "You're opted out. I won't message you again.", paused: true, optOut: true, bant, disclose: false };
  }
  if (input.paused) {
    return { role, action, variantId: variant.id, body: "", paused: true, optOut: false, bant, disclose: false };
  }
  let body = variant.body;
  if (role === "setter" && input.bookingUrl) body = `${body} ${input.bookingUrl}`;
  if (containsUnverifiedClaim(body)) body = variant.body;
  const disclose = input.channel === "call" || input.channel === "web";
  if (disclose) body = `I'm an AI assistant with the team. ${body}`;
  return { role, action, variantId: variant.id, body, paused: false, optOut: false, bant, disclose };
}

export interface TeamEvent {
  at: string;
  role: AgentRole;
  outcome: "reply" | "booked" | "recovered";
  channel: string;
}

const TEAM_KIND = "team-perf";
const memory: TeamEvent[] = [];

function readEvents(): TeamEvent[] {
  const db = getFreeDb();
  const doc = db?.readDoc<{ events?: TeamEvent[] }>("local", TEAM_KIND);
  if (doc?.events) return doc.events;
  return memory;
}

export function recordTeamEvent(event: TeamEvent): void {
  const events = [...readEvents(), event].slice(-2000);
  const db = getFreeDb();
  if (db) db.writeDoc("local", TEAM_KIND, { events });
  else {
    memory.length = 0;
    memory.push(...events);
  }
}

export function teamReport(): { role: AgentRole; replies: number; booked: number; recovered: number }[] {
  const roles: AgentRole[] = ["sdr", "setter", "closer", "recovery", "reactivation"];
  return roles.map((role) => {
    const rows = readEvents().filter((e) => e.role === role);
    return {
      role,
      replies: rows.filter((e) => e.outcome === "reply").length,
      booked: rows.filter((e) => e.outcome === "booked").length,
      recovered: rows.filter((e) => e.outcome === "recovered").length,
    };
  });
}

export function __resetTeamForTests(): void {
  memory.length = 0;
}
