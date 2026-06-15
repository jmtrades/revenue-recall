/**
 * Power-dialer flow helpers — the pure logic behind "100 dials a day". Kept out
 * of the component so it's unit-testable (the UI has no render-test harness):
 * the queue-advance rule and the one-tap no-connect outcomes that let a rep
 * clear the ~85% of dials nobody picks up without typing a note or spending an
 * AI summary on each.
 */

/** The next not-yet-done index after `from` (−1 when none remain). Skips
 *  already-wrapped deals so auto-advance never lands back on a finished call. */
export function nextPendingIndex(length: number, isDone: (i: number) => boolean, from: number): number {
  for (let i = from + 1; i < length; i++) if (!isDone(i)) return i;
  return -1;
}

export interface QuickOutcome {
  id: string;
  label: string;
  /** The activity summary logged for a one-tap outcome — no AI summary needed
   *  (there's nothing said to summarize) and no talk minutes burned. The text
   *  carries the label the retry scheduler matches on (no-answer/voicemail/busy
   *  are all retryable), so a missed dial still gets re-queued automatically. */
  line: string;
}

/** The no-connect outcomes a rep taps to log-and-advance in one click. These
 *  are the bulk of any real dial day; making them a single tap is the whole
 *  point of the power dialer. */
export const QUICK_OUTCOMES: QuickOutcome[] = [
  { id: "no_answer", label: "No answer", line: "[No answer] No pickup — re-queued for another attempt." },
  { id: "voicemail", label: "Voicemail", line: "[Voicemail] Left a voicemail — re-queued to follow up." },
  { id: "busy", label: "Busy", line: "[Busy] Line busy — re-queued for another attempt." },
];

export function quickOutcome(id: string): QuickOutcome | undefined {
  return QUICK_OUTCOMES.find((o) => o.id === id);
}

/** Last-10-digit key for "same human, different lead rows" detection. NANP
 *  numbers compare equal across every format ("+1 (415) 555-0100" vs
 *  "4155550100"); anything shorter than 10 digits is too ambiguous to match. */
export function phoneKey(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length >= 10 ? d.slice(-10) : null;
}

export interface DuplicateInfo {
  firstName: string;
  firstIndex: number;
}

/** Queue index → the EARLIER queue entry sharing the same number. CSV imports
 *  routinely carry the same human under two lead rows; at 100 dials a day that
 *  means ringing someone you hung up with twenty minutes ago. Detection only —
 *  merging records is a human decision. */
export function duplicatePhoneIndexes(queue: { phone: string; contactName: string }[]): Map<number, DuplicateInfo> {
  const seen = new Map<string, { name: string; index: number }>();
  const dups = new Map<number, DuplicateInfo>();
  queue.forEach((q, i) => {
    const key = phoneKey(q.phone);
    if (!key) return;
    const first = seen.get(key);
    if (first) dups.set(i, { firstName: first.name, firstIndex: first.index });
    else seen.set(key, { name: q.contactName, index: i });
  });
  return dups;
}

/** Context the live voice agent needs to run a real dialer conversation as the
 *  rep — the prospect, and (when prepared) the AI brief's talk track + goal. */
export interface LiveAgentContext {
  contactName: string;
  company?: string | null;
  dealTitle?: string | null;
  /** From the AI call prep brief, when the rep has generated one. */
  summary?: string | null;
  talkingPoints?: string[];
  goal?: string | null;
}

function firstName(name: string | null | undefined): string {
  const n = (name ?? "").trim().split(/\s+/)[0];
  return n || "there";
}

/**
 * The live agent's opening line for a real outbound call — a warm, human
 * reconnect, not a scripted pitch. Always returns a usable opener, degrading to
 * a name-less "Hi there, …" when the prospect has no name. Pure + tested.
 */
export function liveAgentOpener(ctx: LiveAgentContext): string {
  return `Hi ${firstName(ctx.contactName)}, thanks for grabbing the phone — do you have a quick minute?`;
}

/**
 * Build the live agent's system prompt for a real call: who it's calling, the
 * brief's talking points, and the single goal — with explicit guardrails to
 * keep it short, consultative, and never robotic. Pure so it's unit-tested.
 * Bounded so an over-long brief can't blow the agent's prompt budget.
 */
export function liveAgentPrompt(ctx: LiveAgentContext): string {
  const who = [ctx.contactName?.trim(), ctx.company?.trim() ? `at ${ctx.company.trim()}` : ""]
    .filter(Boolean)
    .join(" ");
  const lines: string[] = [
    `You are a friendly, sharp outbound sales rep on a live phone call with ${who || "a prospect"}.`,
    ctx.dealTitle?.trim() ? `The opportunity is: ${ctx.dealTitle.trim()}.` : "",
    ctx.summary?.trim() ? `Context: ${ctx.summary.trim().slice(0, 600)}` : "",
  ];
  const points = (ctx.talkingPoints ?? [])
    .map((p) => (typeof p === "string" ? p.trim() : ""))
    .filter(Boolean)
    .slice(0, 6);
  if (points.length) lines.push(`Talking points to weave in naturally: ${points.join("; ").slice(0, 600)}.`);
  if (ctx.goal?.trim()) lines.push(`Your goal for this call: ${ctx.goal.trim().slice(0, 200)}.`);
  lines.push(
    "Keep every reply short and conversational — one or two sentences. Ask questions, listen, and react to what they say. Be warm and consultative, never pushy or scripted. If they're not interested, be gracious and offer a lighter next step.",
  );
  return lines.filter(Boolean).join(" ");
}

export type DialerKeyAction =
  | { kind: "call" }
  | { kind: "quick"; outcomeId: string }
  | { kind: "next" };

/**
 * Keyboard map for the power dialer — at 100 dials a day, reaching for the
 * mouse on every outcome is the remaining friction. Pure so the routing is
 * testable: returns null while the rep is typing (notes/select focused), for
 * modified chords (browser shortcuts must keep working), and for unmapped keys.
 *   C → call · 1/2/3 → no answer / voicemail / busy · N → next pending
 */
export function dialerKeyAction(key: string, opts: { typing: boolean; modifier: boolean }): DialerKeyAction | null {
  if (opts.typing || opts.modifier) return null;
  switch (key.toLowerCase()) {
    case "c":
      return { kind: "call" };
    case "1":
      return { kind: "quick", outcomeId: QUICK_OUTCOMES[0].id };
    case "2":
      return { kind: "quick", outcomeId: QUICK_OUTCOMES[1].id };
    case "3":
      return { kind: "quick", outcomeId: QUICK_OUTCOMES[2].id };
    case "n":
      return { kind: "next" };
    default:
      return null;
  }
}
