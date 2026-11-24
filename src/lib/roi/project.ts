import type { Activity } from "@/lib/crm/types";
import type { RecallTouch } from "@/lib/recall/events";
import type { RoiChannel, RoiEvent, RoiEventName } from "@/lib/roi/types";

export interface ProjectedWin {
  dealId: string;
  value: number;
  wonAt: string;
  contactId?: string;
}

function channelFor(kind: Activity["kind"]): RoiChannel | undefined {
  if (kind === "email" || kind === "sms" || kind === "call") return kind;
  if (kind === "meeting") return "meeting";
  return undefined;
}

function classifyActivity(a: Activity): RoiEventName | null {
  const summary = a.summary.toLowerCase();
  if (a.kind === "email" || a.kind === "sms") {
    if (a.direction === "inbound" || /\brepl(y|ied)\b/.test(summary)) return "message.replied";
    if (a.direction === "outbound" || !a.direction) return "message.sent";
  }
  if (a.kind === "call") {
    if (/opt[\s-]?out|do not call|stop calling/.test(summary)) return "call.opt_out";
    if (/voicemail|\bvm\b/.test(summary)) return "call.voicemail";
    if (/no[-\s]?answer|missed|unanswered/.test(summary)) return "call.no_answer";
    if (/connect|spoke|answered|conversation/.test(summary)) return "call.connected";
    return "call.dialed";
  }
  if (a.kind === "meeting") {
    if (/no[-\s]?show/.test(summary)) return "meeting.no_show";
    if (/showed|attended|completed/.test(summary)) return "meeting.showed";
    return "meeting.booked";
  }
  return null;
}

export function projectActivity(a: Activity): RoiEvent | null {
  const name = classifyActivity(a);
  if (!name) return null;
  const channel = channelFor(a.kind);
  return {
    id: `act:${a.id}`,
    dedupeKey: `act:${a.id}`,
    name,
    occurredAt: a.occurredAt,
    channel,
    contactId: a.contactId,
    dealId: a.opportunityId,
    actor: "system",
  };
}

function near(a: string, b: string, ms = 120_000): boolean {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return Number.isFinite(ta) && Number.isFinite(tb) && Math.abs(ta - tb) <= ms;
}

function sameParty(a: { contactId?: string; dealId?: string }, b: { contactId?: string; dealId?: string }): boolean {
  if (a.contactId && b.contactId && a.contactId === b.contactId) return true;
  if (a.dealId && b.dealId && a.dealId === b.dealId) return true;
  return false;
}

/**
 * One ledger. Stored events win. CRM activities fill the gaps so history from
 * before this ledger existed is not invisible. Recall touches stamp campaign
 * and actor onto the matching send instead of adding a second row.
 */
export function mergeLedger(stored: RoiEvent[], activities: Activity[], touches: RecallTouch[], wins: ProjectedWin[]): RoiEvent[] {
  const out: RoiEvent[] = stored.map((e) => ({ ...e }));
  const seen = new Set(out.map((e) => e.dedupeKey));

  for (const activity of activities) {
    const projected = projectActivity(activity);
    if (!projected || seen.has(projected.dedupeKey)) continue;
    const covered = out.some(
      (e) =>
        e.channel === projected.channel &&
        e.name === projected.name &&
        sameParty(e, projected) &&
        near(e.occurredAt, projected.occurredAt),
    );
    if (covered) continue;
    out.push(projected);
    seen.add(projected.dedupeKey);
  }

  for (const touch of touches) {
    const channel: RoiChannel = touch.channel;
    const match = out.find(
      (e) =>
        e.channel === channel &&
        (e.name === "message.sent" || e.name === "call.dialed" || e.name === "call.completed" || e.name === "call.connected") &&
        sameParty(e, { contactId: touch.contactId, dealId: touch.dealId }) &&
        near(e.occurredAt, touch.occurredAt, 5 * 60_000),
    );
    if (match) {
      if (!match.sequenceId && touch.sequenceId) match.sequenceId = touch.sequenceId;
      if (!match.campaignId && touch.sequenceId) match.campaignId = touch.sequenceId;
      if (touch.source === "autopilot") match.actor = "ai";
      else if (match.actor === "system") match.actor = "user";
      continue;
    }
    const key = `recall:${touch.id}`;
    if (seen.has(key)) continue;
    out.push({
      id: key,
      dedupeKey: key,
      name: touch.channel === "call" ? "call.dialed" : "message.sent",
      occurredAt: touch.occurredAt,
      channel,
      contactId: touch.contactId,
      dealId: touch.dealId,
      sequenceId: touch.sequenceId,
      campaignId: touch.sequenceId,
      actor: touch.source === "autopilot" ? "ai" : "user",
    });
    seen.add(key);
  }

  for (const win of wins) {
    if (out.some((e) => e.name === "deal.won" && e.dealId === win.dealId)) continue;
    const key = `won:${win.dealId}`;
    if (seen.has(key)) continue;
    out.push({
      id: key,
      dedupeKey: key,
      name: "deal.won",
      occurredAt: win.wonAt,
      channel: "system",
      dealId: win.dealId,
      contactId: win.contactId,
      revenue: win.value,
      actor: "system",
    });
    seen.add(key);
  }

  return out;
}
