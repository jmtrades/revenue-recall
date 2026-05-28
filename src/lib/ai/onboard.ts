import { completeJson, isAiConfigured } from "@/lib/ai/client";
import { INDUSTRIES, getIndustry } from "@/lib/industries";

export interface WorkspacePlan {
  industryId: string;
  industryLabel: string;
  orgName: string;
  senderName: string;
  monthlyQuota?: number;
  summary: string;
  source: "ai" | "heuristic";
}

// The real industry templates (exclude the *_default pipeline ids).
const INDUSTRY_IDS = INDUSTRIES.map((i) => i.id).filter((id) => !id.endsWith("_default"));

const KEYWORDS: [string, string[]][] = [
  ["real_estate", ["real estate", "realtor", "realty", "listing", "broker", "property", "homebuyer", "home buyer", "seller", "mls"]],
  ["mortgage", ["mortgage", "loan officer", "lender", "lending", "refinance", "refi", "borrower", "ltv", "underwriting"]],
  ["insurance", ["insurance", "policy", "policies", "premium", "underwrit", "claims", "carrier", "broker of record"]],
  ["saas", ["saas", "software", "b2b software", "subscription", "arr", "mrr", "platform", "app ", "product-led", "seats"]],
  ["agency", ["agency", "marketing", "consult", "creative", "retainer", "freelance", "services firm", "studio"]],
  ["auto", ["dealership", "automotive", "car ", "vehicle", "trade-in", "lease", "test drive", "auto "]],
  ["home_services", ["roofing", "hvac", "plumbing", "contractor", "remodel", "landscaping", "home service", "installation", "estimate"]],
];

function guessIndustry(text: string): string {
  const d = ` ${text.toLowerCase()} `;
  for (const [id, kws] of KEYWORDS) {
    if (INDUSTRY_IDS.includes(id) && kws.some((k) => d.includes(k))) return id;
  }
  return INDUSTRY_IDS.includes("generic") ? "generic" : INDUSTRY_IDS[0];
}

function heuristic(description: string): WorkspacePlan {
  const industryId = guessIndustry(description);
  return {
    industryId,
    industryLabel: getIndustry(industryId).label,
    orgName: "",
    senderName: "",
    summary: `Set up for ${getIndustry(industryId).label}. Add your name and workspace to finish.`,
    source: "heuristic",
  };
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    industryId: { type: "string", enum: INDUSTRY_IDS },
    orgName: { type: "string" },
    senderName: { type: "string" },
    monthlyQuota: { type: "number" },
    summary: { type: "string" },
  },
  required: ["industryId", "orgName", "senderName", "summary"],
};

const SYSTEM = `You configure a sales workspace from a short, plain-language description of someone's business. Be fast and accurate.
- Pick the single best-fit industryId from the allowed list (use "generic" only if truly none fit).
- Infer a clean orgName if they named their company; else return "".
- Infer the person's first name as senderName if stated; else "".
- If they mention a revenue goal/target, set monthlyQuota (a monthly number in their currency); else omit.
- summary: one friendly sentence confirming what you set up.
Never invent a company name or goal that wasn't implied. Return only the JSON.`;

/**
 * Turn a free-text business description into a tailored workspace setup. Uses
 * the model when configured; otherwise falls back to keyword-based industry
 * detection so setup still works (and is free) with no AI credits.
 */
export async function planWorkspace(description: string): Promise<WorkspacePlan> {
  const trimmed = description.trim();
  if (!isAiConfigured() || trimmed.length < 8) return heuristic(trimmed);
  try {
    const out = await completeJson<Omit<WorkspacePlan, "industryLabel" | "source">>({
      system: SYSTEM,
      user: `Allowed industryIds: ${INDUSTRY_IDS.join(", ")}\n\nTheir description:\n"""${trimmed}"""\n\nConfigure the workspace now.`,
      schema: SCHEMA,
      maxTokens: 400,
    });
    const industryId = INDUSTRY_IDS.includes(out.industryId) ? out.industryId : guessIndustry(trimmed);
    return {
      industryId,
      industryLabel: getIndustry(industryId).label,
      orgName: out.orgName ?? "",
      senderName: out.senderName ?? "",
      monthlyQuota: out.monthlyQuota,
      summary: out.summary || heuristic(trimmed).summary,
      source: "ai",
    };
  } catch {
    return heuristic(trimmed);
  }
}
