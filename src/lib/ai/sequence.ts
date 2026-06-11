/**
 * Sequence generation — "build the cadence for MY business", not a blank form.
 * Grounds the plan in everything the org has told us: what they sell (voice
 * profile's `business`), how their industry actually buys (playbook objections,
 * re-engage angles, vocabulary), and the goal they typed.
 *
 * Output steps are BRIEFS, not finished copy — the cadence runtime drafts each
 * send from its brief in the rep's voice at send time, so generated sequences
 * behave exactly like hand-written ones.
 *
 * Live AI when configured (with the standard budget/allowance guards in
 * completeJson); otherwise a template plan derived from the industry playbook —
 * still tailored, never lorem-ipsum generic.
 */
import { completeJson, isAiConfigured } from "@/lib/ai/client";
import { getOrgSettings } from "@/lib/org";
import { getStoredVoice } from "@/lib/voice";
import { getIndustry, type IndustryTemplate } from "@/lib/industries";
import type { SeqChannel, SequenceStep } from "@/lib/sequences";

export interface GeneratedSequence {
  name: string;
  goal: string;
  steps: SequenceStep[];
}

const CHANNELS: SeqChannel[] = ["email", "sms", "call"];

// Every step carries a subject (the runtime uses it as the step title); when
// the model doesn't give a usable one, label by channel.
const STEP_LABEL: Record<SeqChannel, string> = { email: "Follow-up", sms: "Text nudge", call: "Call attempt" };

/** Coerce a model-shaped plan into something the cadence runtime can run:
 *  3–8 steps, valid channels, ascending days 0–60, every step titled.
 *  Exported for tests. */
export function clampPlan(raw: unknown, fallbackName: string, goal: string): GeneratedSequence | null {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawSteps = Array.isArray(o.steps) ? o.steps : [];
  let lastDay = -1;
  const steps: SequenceStep[] = [];
  for (const s of rawSteps.slice(0, 8)) {
    const st = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    const body = typeof st.body === "string" ? st.body.trim().slice(0, 400) : "";
    if (!body) continue;
    const channel = CHANNELS.includes(st.channel as SeqChannel) ? (st.channel as SeqChannel) : "email";
    let day = Math.round(Number(st.day));
    if (!Number.isFinite(day)) day = lastDay + 3;
    day = Math.max(0, Math.min(60, day));
    if (day <= lastDay) day = lastDay + 1; // keep the timeline strictly forward
    if (day > 60) continue; // can't fit inside the 60-day window — drop it
    lastDay = day;
    const modelSubject = typeof st.subject === "string" && st.subject.trim() ? st.subject.trim().slice(0, 90) : "";
    // Email keeps the model's subject line; other channels get a clean label
    // (a "subject" written for an email reads wrong as an SMS title).
    const subject = channel === "email" && modelSubject ? modelSubject : STEP_LABEL[channel];
    steps.push({ day, channel, subject, body });
  }
  if (steps.length < 3) return null;
  const name = (typeof o.name === "string" && o.name.trim() ? o.name.trim() : fallbackName).slice(0, 80);
  return { name, goal, steps };
}

/** Industry-playbook fallback — used with no AI key, over budget, or on a model
 *  error. Personal to the org: its industry's angles + the stated goal. */
export function templateSequence(goal: string, ind: IndustryTemplate, business?: string): GeneratedSequence {
  const pb = ind.playbook;
  const about = business ? ` Ground it in what we do: ${business}.` : "";
  const term = ind.terminology;
  return {
    name: goal.length <= 48 ? goal : `${ind.label} follow-up`,
    goal,
    steps: [
      { day: 0, channel: "email", subject: pb.reengage[0]?.slice(0, 80) ?? "picking this back up", body: `Open the loop on the goal: ${goal}. Lead with a genuine, specific reason to reach out today and give an easy out.${about}` },
      { day: 2, channel: "call", subject: "Call attempt", body: `${pb.nextSteps.call[0] ?? "Reference where things left off and open with a fresh angle."} If voicemail, keep it under 20 seconds and point at the email.` },
      { day: 5, channel: "sms", subject: "Text nudge", body: pb.nextSteps.sms[0] ? `Text, casual register, in the spirit of: "${pb.nextSteps.sms[0]}"` : "Short, low-pressure text — one concrete next step." },
      { day: 9, channel: "email", subject: "answer the real objection", body: `Pre-empt the most common ${ind.label.toLowerCase()} objection — "${pb.objections[0]}" — and answer it in one tight paragraph aimed at the goal: ${goal}.` },
      { day: 14, channel: "sms", subject: "Close the loop", body: `Final, friendly close-the-loop: happy either way, one-tap reply. Mention the ${term.opportunity.toLowerCase()} only if it helps.` },
    ],
  };
}

const SCHEMA = {
  type: "object",
  required: ["name", "steps"],
  properties: {
    name: { type: "string", description: "Short sequence name, e.g. 'Past-client win-back'" },
    steps: {
      type: "array",
      minItems: 4,
      maxItems: 7,
      items: {
        type: "object",
        required: ["day", "channel", "body"],
        properties: {
          day: { type: "number", description: "Days after enrollment, 0-based, strictly increasing, total span ≤ 21" },
          channel: { type: "string", enum: ["email", "sms", "call"] },
          subject: { type: "string", description: "Email subject — lower-key, human, no Title Case clickbait. Email steps only." },
          body: { type: "string", description: "A BRIEF for the drafting AI (what this touch must accomplish, the angle, what to reference) — NOT finished copy. 1–3 sentences." },
        },
      },
    },
  },
} as const;

export async function generateSequence(goalInput: string): Promise<GeneratedSequence> {
  const goal = (goalInput ?? "").trim().slice(0, 200) || "Re-engage cold deals and book a next step";
  const [org, voice] = await Promise.all([getOrgSettings(), getStoredVoice().catch(() => ({}) as Record<string, never>)]);
  const ind = getIndustry(org.industryId);
  const business = (voice as { business?: string }).business;

  if (isAiConfigured()) {
    try {
      const raw = await completeJson<unknown>({
        system: `You are a top-1% outbound strategist designing a multi-channel cadence for a ${ind.label} business. You write step BRIEFS for a drafting AI (which writes the actual sends in the rep's voice later) — never finished copy. Mix channels deliberately (email to open, a call inside the first 3 days, SMS for nudges). Every step needs a distinct job; no two steps may say "just checking in". Use the industry's reality: buyers' objections include ${ind.playbook.objections.slice(0, 3).map((o) => `"${o}"`).join(", ")}; speak in its vocabulary (${(ind.playbook.vocabulary ?? []).slice(0, 6).join(", ")}).`,
        user: `Business: ${business || `a ${ind.label.toLowerCase()} business`}\nCadence goal: ${goal}\nDesign the sequence now.`,
        schema: SCHEMA as unknown as Record<string, unknown>,
        feature: "sequence",
        think: true,
        effort: "high",
      });
      const plan = clampPlan(raw, `${ind.label} cadence`, goal);
      if (plan) return plan;
    } catch {
      /* budget/allowance/model error → tailored template below */
    }
  }
  return templateSequence(goal, ind, business);
}
