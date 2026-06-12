import { firstName, pick, sentence } from "@/lib/copy";
import { getPlaybook } from "@/lib/industries";

/**
 * Voicemail script — the spoken message the dialer leaves when an outbound call
 * reaches an answering machine. Co-located with the call brain and kept pure so
 * it's testable and reusable: the call-placement route builds one for every call
 * and sends it in the gateway payload, to be spoken if the line goes to voicemail.
 *
 * It mirrors the live opener's warmth: a real gap since the last touch flips it
 * to a "been a while" reactivation message (no guilt-trip) — exactly the recall
 * motion. Most recall calls hit voicemail, so a good one left here is often what
 * actually restarts the conversation, instead of a silent dropped call.
 */

/** A real gap (days) since the last touch flips the voicemail to a warm
 *  reactivation message. Matches the live-opener threshold in the conversation engine. */
export const VOICEMAIL_REACTIVATION_GAP_DAYS = 21;

export interface VoicemailInput {
  /** Contact's full name (the first name is extracted). */
  contactName?: string;
  /** The rep's name, if configured — "it's Alex" vs. a generic "it's me". */
  repName?: string;
  /** What the call is about — referenced lightly, never salesy. */
  dealTitle?: string;
  /** Days since the last touch; >= the gap threshold → a reactivation voicemail. */
  daysSinceContact?: number;
  /** Org industry — reactivation voicemails borrow the vertical's re-engagement
   *  hooks ("your rate quote is about to expire"), the concrete reason to call back. */
  industryId?: string;
  /** Stable seed so the same call always yields the same line (no flip-flop across
   *  a retry or a preview). Defaults to the contact/deal/rep identity. */
  seed?: string;
}

/**
 * Build a short, natural voicemail to leave: two spoken sentences, one easy reason
 * to call back, no pressure and no sign-off block (it's spoken, not written).
 * Deterministic for a given seed.
 */
export function voicemailScript(input: VoicemailInput): string {
  const first = input.contactName ? firstName(input.contactName) : "there";
  const rep = (input.repName ?? "").trim();
  const who = rep ? `it's ${rep}` : "it's me";
  const about = (input.dealTitle ?? "").trim();
  const aboutClause = about ? ` about ${about}` : "";
  const seed = input.seed ?? `${input.contactName ?? ""}|${about}|${rep}`;
  const reactivation = (input.daysSinceContact ?? 0) >= VOICEMAIL_REACTIVATION_GAP_DAYS;

  // The vertical's re-engagement hooks give the voicemail what generic lines
  // can't: a CONCRETE reason to call back ("your rate quote from last month is
  // about to expire"), spoken as its own sentence — so the hook variants skip
  // the deal-title clause rather than referencing the subject twice.
  const hooks = reactivation
    ? getPlaybook(input.industryId ?? "generic").reengage.map((h) => {
        const spoken = sentence(h.charAt(0).toUpperCase() + h.slice(1));
        return `Hey ${first}, ${who} — been a while, I know. ${spoken} Ring me back when it's easy, no rush.`;
      })
    : [];

  const pool = reactivation
    ? [
        `Hey ${first}, ${who} — it's been a while, I know. No agenda, just wanted to reconnect${aboutClause}. Give me a ring back when it's easy, no rush at all.`,
        `Hi ${first}, ${who}. It's been a minute — thought I'd check in${aboutClause}. Buzz me back whenever you get a sec, I'll keep it short.`,
        `${first}, ${who} — I know it's been a while. Nothing urgent, just wanted to pick things back up${aboutClause}. Call me back when you've got a minute.`,
        ...hooks,
      ]
    : [
        `Hey ${first}, ${who} — quick one${aboutClause}. Give me a ring back when you get a sec, no rush. Talk soon.`,
        `Hi ${first}, ${who}. Wanted to catch you${aboutClause} — call me back when it's easy, I'll keep it short. Cheers.`,
        `${first}, ${who} — tried to catch you${aboutClause}. Ping me back whenever, I'll be around. Thanks.`,
      ];
  return pick(pool, seed, reactivation ? "vm_reactivate" : "vm");
}

/**
 * The short text to send right after leaving a voicemail — so the prospect has
 * an easy async reply path (replying to a text beats calling back). Casual,
 * lower-case SMS register, one light ask, no pressure. Deterministic by seed.
 */
export function voicemailFollowupText(input: VoicemailInput): string {
  const first = input.contactName ? firstName(input.contactName) : "there";
  const rep = (input.repName ?? "").trim();
  const sign = rep ? ` – ${rep}` : "";
  const about = (input.dealTitle ?? "").trim();
  const aboutClause = about ? ` about ${about}` : "";
  const seed = input.seed ?? `${input.contactName ?? ""}|${about}|${rep}`;
  // Every variant invites naming a time — a reply like "4pm" re-books the
  // scheduled redial to exactly then (inbound.ts arms the time parser whenever
  // a pending callback/retry exists), so the invitation is a real capability,
  // not politeness.
  const pool = [
    `hey ${first}, just left you a quick voicemail${aboutClause}. no rush — text back a time that suits (even just "4pm") and i'll call you then.${sign}`,
    `hi ${first} — tried you just now and left a message${aboutClause}. reply with a good time and i'll ring you exactly then. text works too.${sign}`,
    `${first}, just missed you — left a voicemail${aboutClause}. happy to keep it to text, or name a time and i'll call you back then.${sign}`,
  ];
  return pick(pool, seed, "vm_followup");
}
