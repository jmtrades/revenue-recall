import { getFreeDb } from "@/lib/free/db";

/**
 * Which voice a campaign or webinar speaks in. Falls back to the workspace
 * voice. Stored in the free file database when that is on, otherwise in
 * memory (tests and the no-disk demo).
 */

export interface VoiceAssignments {
  campaigns: Record<string, string>;
  webinars: Record<string, string>;
}

const memory = new Map<string, VoiceAssignments>();

function empty(): VoiceAssignments {
  return { campaigns: {}, webinars: {} };
}

function clean(raw: VoiceAssignments | null): VoiceAssignments {
  const campaigns: Record<string, string> = {};
  const webinars: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw?.campaigns ?? {})) {
    if (k && typeof v === "string" && v) campaigns[k.slice(0, 80)] = v.slice(0, 80);
  }
  for (const [k, v] of Object.entries(raw?.webinars ?? {})) {
    if (k && typeof v === "string" && v) webinars[k.slice(0, 80)] = v.slice(0, 80);
  }
  return { campaigns, webinars };
}

export async function getVoiceAssignments(orgId = "local"): Promise<VoiceAssignments> {
  const db = getFreeDb();
  if (db) return clean(db.readDoc<VoiceAssignments>(orgId, "voice-assignments"));
  return clean(memory.get(orgId) ?? null);
}

export async function setVoiceAssignment(orgId: string, kind: "campaign" | "webinar", id: string, voiceId: string | null): Promise<VoiceAssignments> {
  const current = await getVoiceAssignments(orgId);
  const bucket = kind === "campaign" ? current.campaigns : current.webinars;
  if (voiceId) bucket[id.slice(0, 80)] = voiceId.slice(0, 80);
  else delete bucket[id.slice(0, 80)];
  const db = getFreeDb();
  if (db) db.writeDoc(orgId, "voice-assignments", current);
  else memory.set(orgId, current);
  return current;
}

/** Webinar voice, then campaign voice, then the workspace voice. */
export function resolveSpokenVoice(input: { assignments?: VoiceAssignments; campaignId?: string; webinarId?: string; workspaceVoice?: string }): string | undefined {
  const a = input.assignments;
  const webinar = input.webinarId && a?.webinars[input.webinarId];
  if (webinar) return webinar;
  const campaign = input.campaignId && a?.campaigns[input.campaignId];
  if (campaign) return campaign;
  return input.workspaceVoice || undefined;
}

export function __resetVoiceAssignmentsForTests(): void {
  memory.clear();
}
