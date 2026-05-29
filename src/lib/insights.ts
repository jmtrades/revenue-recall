import type { Activity } from "@/lib/crm/types";

/**
 * Contact engagement intelligence: where and when a person actually responds.
 * Pure and deterministic — derived from their logged activity, no AI needed —
 * so a rep (and Autopilot) can reach out on the channel they reply on, at the
 * time of day they're responsive. Reaching people the right way is half of
 * recovering revenue.
 */

export type Channel = "call" | "email" | "sms";
const CHANNELS: Channel[] = ["call", "email", "sms"];

export interface ContactInsights {
  /** The channel they've replied on most (null if they never have). */
  bestChannel: Channel | null;
  /** Time-of-day window they tend to engage in (null if unknown). */
  bestTime: string | null;
  /** How engaged they are overall. */
  responsiveness: "high" | "medium" | "low" | "unknown";
  /** One-line, rep-facing summary. */
  note: string;
}

const isChannel = (k: string): k is Channel => (CHANNELS as string[]).includes(k);

function timeBucket(hour: number): string {
  if (hour >= 5 && hour < 11) return "mornings";
  if (hour >= 11 && hour < 14) return "midday";
  if (hour >= 14 && hour < 18) return "afternoons";
  if (hour >= 18 && hour < 22) return "evenings";
  return "late hours";
}

/** Analyze a contact/deal's activity timeline for how best to reach them. */
export function contactInsights(activities: Activity[]): ContactInsights {
  const inbound = activities.filter((a) => a.direction === "inbound" && isChannel(a.kind));
  const outbound = activities.filter((a) => a.direction === "outbound" && isChannel(a.kind));

  if (inbound.length === 0) {
    const responsiveness = outbound.length > 0 ? "low" : "unknown";
    return {
      bestChannel: null,
      bestTime: null,
      responsiveness,
      note:
        responsiveness === "low"
          ? "No replies yet despite outreach — try a different channel or a lighter, value-first touch."
          : "No history yet — make a first, low-friction touch and see how they respond.",
    };
  }

  // Channel they reply on most.
  const byChannel = new Map<Channel, number>();
  for (const a of inbound) byChannel.set(a.kind as Channel, (byChannel.get(a.kind as Channel) ?? 0) + 1);
  const bestChannel = [...byChannel.entries()].sort((a, b) => b[1] - a[1])[0][0];

  // Time-of-day they engage in.
  const byBucket = new Map<string, number>();
  for (const a of inbound) {
    const h = new Date(a.occurredAt).getHours();
    const b = timeBucket(h);
    byBucket.set(b, (byBucket.get(b) ?? 0) + 1);
  }
  const bestTime = [...byBucket.entries()].sort((a, b) => b[1] - a[1])[0][0];

  const responsiveness = inbound.length >= 3 ? "high" : "medium";
  const channelWord = bestChannel === "call" ? "a call" : bestChannel === "sms" ? "a text" : "email";
  const note = `Replies most on ${channelWord}, usually in the ${bestTime} — reach out then for the best shot.`;

  return { bestChannel, bestTime, responsiveness, note };
}

/**
 * A short, drafter-facing hint about how this person engages — fed to the AI
 * writer so outreach can feel naturally timed (never stated mechanically).
 * Returns null when there's no signal worth acting on.
 */
export function reachHint(insights: ContactInsights): string | null {
  if (insights.responsiveness === "unknown") return null;
  if (insights.responsiveness === "low") {
    return "They haven't replied to past outreach — keep it light, low-pressure, and genuinely easy to ignore.";
  }
  const channelWord = insights.bestChannel === "call" ? "a call" : insights.bestChannel === "sms" ? "a text" : "email";
  const time = insights.bestTime ? `, usually in the ${insights.bestTime}` : "";
  return `They tend to engage over ${channelWord}${time}.`;
}
