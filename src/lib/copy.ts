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
  "i hope this email finds you well",
  "i hope this finds you well",
  "i hope you're doing well",
  "i wanted to reach out",
  "i am reaching out",
  "i'm reaching out",
  "just reaching out",
  "circling back",
  "circle back",
  "touch base",
  "i hope all is well",
  "at your earliest convenience",
  "please don't hesitate",
  "don't hesitate to reach out",
  "feel free to reach out",
  "looking forward to hearing from you",
  "i'd be more than happy",
  "i would be more than happy",
  "let me know if you have any questions",
  "in today's fast-paced",
  "in today's ever-changing",
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
  "unlock the potential",
  "take it to the next level",
  "synergy",
  "furthermore",
  "moreover",
  "rest assured",
  "we are thrilled",
  "i am excited to",
];

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
