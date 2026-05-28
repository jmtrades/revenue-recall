import { AI_TELLS } from "@/lib/copy";

/**
 * Human-ness check. Scans a piece of outreach for the patterns that make copy
 * read like AI or a mail-merge template, and returns a 0–100 "human" score with
 * specific, fixable flags. Pure and synchronous so it can run live as a rep
 * types or pastes — no API call needed.
 */

export interface HumannessFlag {
  /** The matched phrase or a short label for a pattern. */
  text: string;
  /** Plain-language reason + how to fix it. */
  reason: string;
}

export interface HumannessResult {
  /** 0–100, higher = more human. */
  score: number;
  rating: "human" | "stiff" | "robotic";
  flags: HumannessFlag[];
}

const CONTRACTION =
  /\b(i'm|i'll|i've|i'd|you're|you'll|you've|don't|doesn't|didn't|can't|won't|it's|that's|we're|we'll|we've|let's|here's|there's|they're|isn't|aren't|wasn't|wouldn't|couldn't|shouldn't|haven't|hasn't|what's|i'd)\b/i;

const STIFF: [RegExp, string, string][] = [
  [/^\s*dear\b/i, "Dear …", '"Dear" reads like a form letter — open with their first name'],
  [/\bi am writing to\b/i, "I am writing to", "nobody talks like this — get to the point"],
  [/\bto whom it may concern\b/i, "To whom it may concern", "use their actual name"],
  [/\bplease be advised\b/i, "please be advised", "drop the legalese"],
  [/\bkindly\b/i, "kindly", '"kindly" reads automated — just say "can you"'],
  [/\bas per\b/i, "as per", 'say "based on" or "from"'],
  [/\bper my (last|previous)\b/i, "per my last…", "passive-aggressive corporate tell — rephrase plainly"],
  [/\bplease find attached\b/i, "please find attached", 'just say "here\'s …"'],
];

export function analyzeHumanness(input: string): HumannessResult {
  const text = input.trim();
  if (!text) return { score: 100, rating: "human", flags: [] };

  const lower = text.toLowerCase();
  const flags: HumannessFlag[] = [];
  let score = 100;

  // 1. Canonical AI tells — the strongest signal.
  for (const tell of AI_TELLS) {
    if (lower.includes(tell)) {
      flags.push({ text: tell, reason: "classic AI/template phrase — cut it or say it the way you'd say it out loud" });
      score -= 18;
    }
  }

  // 2. Stiff, formal, or robotic openers/phrases.
  for (const [re, label, reason] of STIFF) {
    if (re.test(text)) {
      flags.push({ text: label, reason });
      score -= 12;
    }
  }

  // 3. Exclamation spam.
  const bangs = (text.match(/!/g) ?? []).length;
  if (bangs >= 3) {
    flags.push({ text: `${bangs} exclamation marks`, reason: "too much — one is plenty" });
    score -= 10;
  }

  // 4. Em-dash overuse (a frequent AI giveaway).
  const dashes = (text.match(/—/g) ?? []).length;
  if (dashes >= 3) {
    flags.push({ text: `${dashes} em-dashes`, reason: "AI overuses em-dashes — swap some for periods" });
    score -= 8;
  }

  // 5. A longer message with zero contractions reads formal/robotic.
  const words = text.split(/\s+/).length;
  if (words >= 25 && !CONTRACTION.test(text)) {
    flags.push({ text: "no contractions", reason: 'real people write "I\'ll / you\'re / don\'t" — it reads human' });
    score -= 10;
  }

  score = Math.max(0, Math.min(100, score));
  const rating = score >= 80 ? "human" : score >= 55 ? "stiff" : "robotic";
  return { score, rating, flags };
}
