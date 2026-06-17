import { getPlaybook } from "@/lib/industries";
import type { ObjectionKind } from "@/lib/ai/intent";

/**
 * Rep-facing objection cheat-sheet for the power dialer. A human rep on a live
 * manual dial needs the same industry-true reframes the AI uses — at a glance,
 * not generated. This reads the resolved industry playbook's `objectionAngles`
 * and presents each as "if they say X → reframe with this angle". Pure (no I/O),
 * so it's safe to compute server-side and trivially testable.
 */

export interface ObjectionGuideEntry {
  kind: ObjectionKind;
  /** What the prospect is pushing back on. */
  label: string;
  /** The industry-true reframe angle (a rep prompt, not a script to read). */
  angle: string;
}

/** Display order: the objections reps hit most often, first. */
const ORDER: ReadonlyArray<{ kind: ObjectionKind; label: string }> = [
  { kind: "price", label: "Too expensive / what's it cost" },
  { kind: "timing", label: "Not the right time" },
  { kind: "competitor", label: "Already have someone" },
  { kind: "trust", label: "Not sure it works / skeptical" },
  { kind: "info", label: "Just send me info" },
];

export function objectionGuide(industryId: string): ObjectionGuideEntry[] {
  const angles = getPlaybook(industryId).objectionAngles;
  return ORDER.map(({ kind, label }) => ({ kind, label, angle: angles[kind] }));
}
