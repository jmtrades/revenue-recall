import { firstName, pick } from "@/lib/copy";

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

  const pool = reactivation
    ? [
        `Hey ${first}, ${who} — it's been a while, I know. No agenda, just wanted to reconnect${aboutClause}. Give me a ring back when it's easy, no rush at all.`,
        `Hi ${first}, ${who}. It's been a minute — thought I'd check in${aboutClause}. Buzz me back whenever you get a sec, I'll keep it short.`,
        `${first}, ${who} — I know it's been a while. Nothing urgent, just wanted to pick things back up${aboutClause}. Call me back when you've got a minute.`,
      ]
    : [
        `Hey ${first}, ${who} — quick one${aboutClause}. Give me a ring back when you get a sec, no rush. Talk soon.`,
        `Hi ${first}, ${who}. Wanted to catch you${aboutClause} — call me back when it's easy, I'll keep it short. Cheers.`,
        `${first}, ${who} — tried to catch you${aboutClause}. Ping me back whenever, I'll be around. Thanks.`,
      ];
  return pick(pool, seed, reactivation ? "vm_reactivate" : "vm");
}
