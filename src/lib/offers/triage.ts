import { scoreBant, type BantScore } from "@/lib/agent/team";

export type TriageBand = "hot" | "warm" | "cold";

export function triageLead(input: { text: string; monthlyRevenue?: number }): { band: TriageBand; bant: BantScore; qualified: boolean } {
  const money = input.monthlyRevenue && input.monthlyRevenue > 0 ? ` monthly revenue ${input.monthlyRevenue}` : "";
  const bant = scoreBant(`${input.text}${money}`);
  const budget = bant.budget || (input.monthlyRevenue ?? 0) >= 10000;
  const scored = { ...bant, budget, fit: budget && !bant.budget ? Math.min(100, bant.fit + 25) : bant.fit };
  const band: TriageBand = scored.fit >= 75 && (scored.budget || scored.timing) ? "hot" : scored.fit >= 50 ? "warm" : "cold";
  return { band, bant: scored, qualified: band !== "cold" };
}
