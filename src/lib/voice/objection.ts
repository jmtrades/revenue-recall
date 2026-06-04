import { detectIntent, OBJECTION_KINDS, SITUATIONAL_KINDS, type Intent } from "@/lib/ai/intent";

/**
 * The loop-proof policy layer for a live call.
 *
 * Great objection handling means acknowledging and reframing — but a rep who
 * re-pitches the SAME objection forever is the worst kind of call. This tracks
 * what the prospect has actually raised across the conversation and decides when
 * to keep handling vs. when to STOP and pivot to a concrete next step or a
 * gracious exit. Pure and dependency-light (just intent classification), so the
 * decision is deterministic and testable — the call can never loop indefinitely
 * no matter what the language model wants to say.
 */

/** Same objection raised this many times → stop re-pitching it. */
export const REPEAT_THRESHOLD = 2;
/** Total objection/resistance turns before we wrap to a callback regardless. */
export const MAX_HANDLING_TURNS = 4;

// Everything that isn't a clean "yes/ask" is resistance we're actively handling.
const HANDLING_INTENTS: ReadonlySet<Intent> = new Set<Intent>([...OBJECTION_KINDS, ...SITUATIONAL_KINDS]);

export interface CallProgress {
  /** How many times each intent was raised by the prospect. */
  objectionCounts: Partial<Record<Intent, number>>;
  /** A reframe-able objection (price/timing/competitor/trust/info) raised ≥ REPEAT_THRESHOLD times — the loop signal. */
  repeatedObjection: Intent | null;
  /** Prospect turns spent resisting (objection or situational), i.e. not a clean yes/question. */
  handlingTurns: number;
  /** The prospect's most recent intent. */
  lastIntent: Intent | null;
  /** Their latest turn is a buying signal. */
  warmedUp: boolean;
}

export function analyzeProgress(prospectTexts: string[]): CallProgress {
  const counts: Partial<Record<Intent, number>> = {};
  let handlingTurns = 0;
  let lastIntent: Intent | null = null;
  for (const text of prospectTexts) {
    const intent = detectIntent(text);
    lastIntent = intent;
    counts[intent] = (counts[intent] ?? 0) + 1;
    if (HANDLING_INTENTS.has(intent)) handlingTurns += 1;
  }
  let repeatedObjection: Intent | null = null;
  for (const k of OBJECTION_KINDS) if ((counts[k] ?? 0) >= REPEAT_THRESHOLD) repeatedObjection = k;
  return { objectionCounts: counts, repeatedObjection, handlingTurns, lastIntent, warmedUp: lastIntent === "positive" };
}

export type DirectiveAction = "handle" | "close" | "book_callback" | "exit";
export type DirectiveReason = "declined" | "hostile" | "repeated_objection" | "stalled" | "interested";

export interface CallDirective {
  action: DirectiveAction;
  reason?: DirectiveReason;
}

/**
 * Decide what the rep should DO next, given progress so far and how many rep
 * turns have already happened. This is the guarantee against forever-looping:
 * a firm no exits; a repeated objection or a dragging call pivots to booking a
 * callback (and ends); genuine interest goes to the close; otherwise we keep
 * handling. Because the caller drives `done` off this (not the model), the
 * conversation always terminates.
 */
export function decideDirective(progress: CallProgress, repCount: number): CallDirective {
  const last = progress.lastIntent;
  if (repCount === 0 || last === null) return { action: "handle" }; // opening
  if (last === "hostile") return { action: "exit", reason: "hostile" };
  if (last === "decline") return { action: "exit", reason: "declined" };
  // Genuine buying signal → go straight for the concrete next step.
  if (progress.warmedUp) return { action: "close", reason: "interested" };
  // Anti-loop: don't re-pitch a wall. Secure a specific callback and bow out.
  if (progress.repeatedObjection) return { action: "book_callback", reason: "repeated_objection" };
  if (progress.handlingTurns >= MAX_HANDLING_TURNS) return { action: "book_callback", reason: "stalled" };
  // Engaged but just circling on questions → stop orbiting, propose the step.
  if (last === "question" && repCount >= 3) return { action: "close", reason: "interested" };
  return { action: "handle" };
}
