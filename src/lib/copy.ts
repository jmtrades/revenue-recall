/**
 * Shared helpers for writing copy that reads like a real human, not an AI.
 *
 * `AI_TELLS` is the canonical list of phrases and habits that make writing
 * "sound like AI" or like a mail-merge template. The drafting prompts forbid
 * them and the test suite asserts the deterministic fallbacks never emit them,
 * so the no-API-key demo stays human too.
 */

/** Phrases that scream "AI" or "template". Never produce these. */
export const AI_TELLS: string[] = [
  // Robotic openers
  "i hope this email finds you well",
  "i hope this finds you well",
  "i hope this message finds you",
  "i hope you're doing well",
  "i hope you are doing well",
  "i hope all is well",
  "i trust this email",
  "i trust you're well",
  "i wanted to reach out",
  "i am reaching out",
  "i'm reaching out",
  "just reaching out",
  "i wanted to touch base",
  // Filler follow-up clichés
  "circling back",
  "circle back",
  "touch base",
  "touching base",
  "as we discussed",
  "as previously mentioned",
  "per our conversation",
  "per my last email",
  "per my previous email",
  "as per our",
  // Stiff closers
  "at your earliest convenience",
  "please don't hesitate",
  "don't hesitate to reach out",
  "don't hesitate to contact",
  "feel free to reach out",
  "looking forward to hearing from you",
  "i look forward to hearing",
  "i'd be more than happy",
  "i would be more than happy",
  "let me know if you have any questions",
  "thank you for your time and consideration",
  "thank you in advance",
  "warm regards",
  "best regards",
  "kind regards",
  // Corporate filler / hype
  "in today's fast-paced",
  "in today's ever-changing",
  "without further ado",
  "needless to say",
  "at the end of the day",
  "first and foremost",
  "that being said",
  "rest assured",
  "we are thrilled",
  "i am excited to",
  "we're excited to share",
  // AI-favorite vocabulary
  "delve",
  "leverage",
  "utilize",
  "elevate your",
  "streamline your",
  "robust solution",
  "seamless experience",
  "cutting-edge",
  "best-in-class",
  "game-changer",
  "game changer",
  "unlock the potential",
  "take it to the next level",
  "move the needle",
  "low-hanging fruit",
  "synergy",
  "furthermore",
  "moreover",
  "a myriad of",
  "plethora",
  "ecosystem",
  "holistic",
  "paradigm",
  "actionable insights",
  "supercharge",
  "skyrocket",
  "tap into",
  "harness the power",
  "transform your",
  "revolutionize",
  "empower your",
  "as an ai",
];

/**
 * The single, honest label for anything produced by the deterministic template
 * fallback (no AI key connected). One phrasing everywhere — recall drafts, deal
 * briefs, the approvals queue — so the "connect AI to personalize" upgrade cue
 * reads consistently instead of four different ways across the app.
 */
export const TEMPLATE_FALLBACK_LABEL = "Template — connect AI to personalize";

/**
 * Deterministically pick one item from a list using a string seed (e.g. a deal
 * id). Same seed → same choice, so output is varied across deals but stable for
 * a given deal (and therefore testable). Never repeats like a fixed template.
 */
export function pickVariant<T>(items: T[], seed: string): T {
  if (items.length === 0) throw new Error("pickVariant: empty list");
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return items[Math.abs(h) % items.length];
}

/** First name only, for natural greetings. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name.trim();
}

/** Capitalize the first character (for using a casual fragment mid-paragraph). */
export function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Ensure a clause ends with terminal punctuation before another is appended. */
export function sentence(s: string): string {
  const t = s.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/**
 * Make casual copy read like a professional, not a bot: capitalize the first
 * letter and every sentence start, and fix the standalone "i" (and its
 * contractions, "i'll"/"i'm"/…) to "I". Applied to TEMPLATE messages so the
 * non-AI fallback never ships all-lowercase text to a client (the AI path is
 * instructed to do this directly). Leaves URLs/merge tokens untouched.
 */
export function professionalize(text: string): string {
  return text
    .replace(/(^\s*|[.!?]\s+|\n+)([a-z])/g, (_m, pre, ch: string) => pre + ch.toUpperCase())
    .replace(/\bi\b/g, "I");
}

/**
 * Salt a base seed so independent parts of a message (greeting, sign-off,
 * skeleton choice, …) vary independently of each other but stay deterministic
 * for a given deal. Without salting, every part of a message would rotate in
 * lockstep and the output would still feel templated.
 */
export function seeded(seed: string, salt: string): string {
  return `${seed}::${salt}`;
}

/** Pick from a pool using a salted seed. Shorthand for the common pattern. */
export function pick<T>(items: T[], seed: string, salt: string): T {
  return pickVariant(items, seeded(seed, salt));
}

/**
 * The point of these pools is structural variety. A real person doesn't open
 * every message the same way, so we rotate greetings, connectors, and easy-outs
 * independently — combined with multiple body skeletons, two deals almost never
 * produce the same-shaped message. None of these may contain an AI tell.
 */

/** Email greetings. Each embeds the first name so the body always personalizes. */
export const GREETINGS_EMAIL: ((f: string) => string)[] = [
  (f) => `Hi ${f},`,
  (f) => `Hey ${f},`,
  (f) => `${f} —`,
  (f) => `${f},`,
  (f) => `Hey ${f}, quick one —`,
];

/** SMS greetings: plain, lowercase-casual, no trailing punctuation. */
export const GREETINGS_SMS: ((f: string) => string)[] = [
  (f) => `Hey ${f}`,
  (f) => `Hi ${f}`,
  (f) => `${f}`,
  (f) => `Hey ${f}`,
];

/** Low-pressure email closers for re-engagement, so we never repeat one line. */
export const EASY_OUT_EMAIL: string[] = [
  "No rush at all — if the timing's off, just say so and I'll back off.",
  'If now\'s not the moment, no problem at all — a quick "not now" works.',
  "Totally fine if this has slid down your list. Just tell me either way.",
  "Either way's good with me — I'd rather know than keep guessing.",
  "No pressure on my end — tell me to hold off and I will.",
];

/** Low-pressure SMS easy-outs (lowercase-casual). */
export const EASY_OUT_SMS: string[] = [
  "no pressure either way",
  "totally fine if now's not the time",
  "just say the word if you'd rather i hold off",
  "no worries if it's not the moment",
  "either way's good, just let me know",
];
