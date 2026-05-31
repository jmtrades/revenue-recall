import { completeJson, isAiConfigured } from "@/lib/ai/client";
import { isIndustryId } from "@/lib/industries";

/**
 * Conversational onboarding: turn a free-text description of someone's business
 * into a structured profile that pre-fills the whole setup — industry, what they
 * sell, a workspace name, their voice tone, and a sensible revenue goal — so a
 * new user can type one sentence instead of clicking through every step.
 *
 * AI does the mapping when configured; otherwise a deterministic keyword matcher
 * gives a solid result with zero dependencies (so onboarding personalizes even
 * with no API key — it just won't be as nuanced).
 */

export type OnboardIndustry = "real_estate" | "mortgage" | "insurance" | "saas" | "agency" | "auto" | "home_services" | "generic";

export interface OnboardProfile {
  industryId: OnboardIndustry;
  /** Suggested workspace/org name, if inferable (else empty). */
  orgName: string;
  /** One-line summary of what they sell, echoed back so it feels understood. */
  sells: string;
  /** A short voice/tone descriptor to seed the AI writing style. */
  voiceTone: string;
  /** Suggested monthly revenue goal in whole dollars. */
  monthlyQuota: number;
  /** Whether this came from AI (true) or the keyword fallback (false). */
  ai: boolean;
}

const VALID: OnboardIndustry[] = ["real_estate", "mortgage", "insurance", "saas", "agency", "auto", "home_services", "generic"];

// Keyword → industry for the no-AI fallback. Ordered most-specific first.
const KEYWORDS: [OnboardIndustry, RegExp][] = [
  ["real_estate", /\b(real estate|realtor|realty|listing|broker(age)?|home(s)? for sale|property|properties|buyer|seller)\b/i],
  ["mortgage", /\b(mortgage|loan officer|lend(ing|er)|refinance|underwrit|escrow|pre-?approv)\b/i],
  ["insurance", /\b(insurance|insur(e|er)|policy|policies|premium|underwrit|claims?|coverage|agent)\b/i],
  ["saas", /\b(saas|software|b2b|platform|app|api|subscription|onboarding|trial|seats?|product-led)\b/i],
  ["auto", /\b(auto|car|vehicle|dealership|dealer|showroom|test drive|trade-?in)\b/i],
  ["home_services", /\b(hvac|plumb|roof|landscap|contractor|home service|electric(al|ian)|remodel|pest|cleaning)\b/i],
  ["agency", /\b(agency|consult|marketing|creative|studio|freelance|retainer|client work|services)\b/i],
];

// Lift a company name. Match the cue case-insensitively but capture only a real
// Proper-Cased name (case-sensitive), skipping a leading article — otherwise a
// phrase like "I run a boutique real estate brokerage" yields the junk name "a
// boutique real estate". Prefer an explicit "called/named X"; return "" when
// there's no clear proper noun (better an empty field than a wrong one).
function extractOrgName(t: string): string {
  const strong = t.match(/\b(?:[Cc]alled|[Nn]amed)\s+([A-Z][A-Za-z0-9&'’.\-]*(?:\s+[A-Z][A-Za-z0-9&'’.\-]*){0,3})/);
  const weak = t.match(/\b(?:[Ww]e(?:'re|’re| are)|[Ii] (?:run|own)|[Aa]t|[Ff]or)\s+(?:(?:the|a|an|my|our)\s+)?([A-Z][A-Za-z0-9&'’.\-]*(?:\s+[A-Z][A-Za-z0-9&'’.\-]*){0,3})/);
  const hit = strong ?? weak;
  return hit ? hit[1].replace(/[.,;].*$/, "").trim().slice(0, 40) : "";
}

function fallbackProfile(text: string): OnboardProfile {
  const t = text.trim();
  let industryId: OnboardIndustry = "generic";
  for (const [id, re] of KEYWORDS) {
    if (re.test(t)) { industryId = id; break; }
  }
  const orgName = extractOrgName(t);
  const sells = t.slice(0, 140);
  return {
    industryId,
    orgName,
    sells,
    voiceTone: "warm, direct, and human — like a great rep who knows the business",
    monthlyQuota: 250000,
    ai: false,
  };
}

const SYSTEM = `You set up a sales workspace from a one-paragraph description of someone's business. Map it to the best-fit industry and extract setup details. Be decisive and concise.

Return ONLY JSON. Rules:
- industryId MUST be exactly one of: real_estate, mortgage, insurance, saas, agency, auto, home_services, generic. Pick the closest; use "generic" only when nothing fits.
- orgName: the company name if stated, else "".
- sells: a crisp one-line description of what they sell (max ~12 words).
- voiceTone: a short phrase describing how their outreach should sound (e.g. "friendly and consultative", "sharp and premium").
- monthlyQuota: a sensible monthly revenue goal in whole US dollars given the business size implied (default 250000 if unclear; small local business ~50000; enterprise ~1000000).`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    industryId: { type: "string", enum: VALID },
    orgName: { type: "string" },
    sells: { type: "string" },
    voiceTone: { type: "string" },
    monthlyQuota: { type: "number" },
  },
  required: ["industryId", "orgName", "sells", "voiceTone", "monthlyQuota"],
};

export async function personalizeFromDescription(description: string): Promise<OnboardProfile> {
  const text = (description ?? "").trim();
  if (!text) return { ...fallbackProfile(""), industryId: "generic", sells: "" };
  if (!isAiConfigured()) return fallbackProfile(text);

  try {
    const out = await completeJson<{ industryId: string; orgName: string; sells: string; voiceTone: string; monthlyQuota: number }>({
      system: SYSTEM,
      user: `Business description:\n"""${text.slice(0, 2000)}"""`,
      schema: SCHEMA,
      maxTokens: 400,
      effort: "low",
      feature: "onboarding",
    });
    const industryId = (isIndustryId(out.industryId) && VALID.includes(out.industryId as OnboardIndustry)) ? (out.industryId as OnboardIndustry) : "generic";
    const quota = Number.isFinite(out.monthlyQuota) && out.monthlyQuota > 0 ? Math.round(out.monthlyQuota) : 250000;
    return {
      industryId,
      orgName: (out.orgName ?? "").trim().slice(0, 60),
      sells: (out.sells ?? "").trim().slice(0, 160),
      voiceTone: (out.voiceTone ?? "").trim().slice(0, 120) || "warm, direct, and human",
      monthlyQuota: quota,
      ai: true,
    };
  } catch {
    return fallbackProfile(text);
  }
}
