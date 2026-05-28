import { completeJson, isAiConfigured } from "@/lib/ai/client";
import { getPlaybook } from "@/lib/industries";
import { AI_TELLS, capitalize as cap, firstName, pickVariant, sentence } from "@/lib/copy";

export interface DraftInput {
  channel: "email" | "sms" | "call";
  contactName: string;
  company?: string;
  dealTitle: string;
  valueLabel: string;
  value: number;
  currency: string;
  stageLabel: string;
  industryLabel: string;
  /** Industry id, so output is tuned to how that vertical actually talks. */
  industryId?: string;
  recallReason?: string;
  daysSinceContact?: number;
  history?: string[];
  repName?: string;
  /** Optional extra instruction from a user-defined Autopilot task. */
  instruction?: string;
  /** The rep's distilled writing voice + sign-off, so messages sound like them. */
  voice?: { senderName?: string; profile?: string; signature?: string; customNextSteps?: string[]; customReengage?: string[] };
}

export interface DraftResult {
  subject?: string;
  body: string;
  source: "ai" | "template";
}

const SYSTEM = `You ghostwrite outreach AS a specific human sales rep. Every message must read as if that person typed it themselves on their phone between meetings — never like an AI, an assistant, a bot, or a mail-merge template. If a reader could suspect AI wrote it, you failed.

WHO YOU ARE
- You are the rep — a real, busy person who knows this prospect. Never reveal or imply AI. No disclaimers, no "as an AI", no robotic scaffolding.
- When a VOICE PROFILE is given, match it exactly: tone, rhythm, greetings, sign-off, quirks, capitalization, emoji habits. The result must be indistinguishable from that person's own writing.
- When an INDUSTRY PLAYBOOK is given, sound like a real rep in THAT business — use their natural next-steps and vocabulary, anticipate their objections. Match it; never copy the example lines verbatim.

HOW HUMANS ACTUALLY WRITE (do this)
- Use contractions. Vary sentence length — mix a short punchy one with a longer one. An occasional fragment is fine.
- Be specific to this prospect and deal. Reference a real detail. Get to the point fast.
- One clear, low-friction ask. Give an easy out. Never pushy, never salesy.
- Sound a little informal and imperfect, like a real person — not polished corporate prose.
- SMS: lowercase-casual is good, under 320 chars, no subject. Email: a short, human subject + 40-90 word body. Call: a 5-bullet talk track in the body, no subject.

NEVER (these are instant AI tells)
- Banned openers: "I hope this email finds you well", "I wanted to reach out", "I'm reaching out", "Just reaching out".
- Banned clichés: "circling back", "touch base", "at your earliest convenience", "don't hesitate", "feel free to", "looking forward to hearing from you", "let me know if you have any questions".
- Banned AI words: delve, leverage, utilize, elevate, streamline, robust, seamless, cutting-edge, best-in-class, synergy, furthermore, moreover, unlock, game-changer.
- No buzzwords, no hype, no exclamation spam, no over-the-top enthusiasm, no perfectly balanced rule-of-three lists, no em-dash overuse.
- Never invent facts. Use only the supplied context.

RE-ENGAGEMENT: acknowledge time has passed the way a human would (lightly, no guilt-trip), lead with a genuine reason or an easy question, and make it painless to say "not now".
Sign off in the rep's voice using their signature/name when provided. Return only the requested JSON.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    subject: { type: "string" },
    body: { type: "string" },
  },
  required: ["subject", "body"],
};

function signOff(input: DraftInput): string {
  return input.voice?.signature || input.voice?.senderName || input.repName || "";
}

/**
 * Deterministic, industry-aware, human-sounding fallback used when no API key is
 * set (the default demo path). Pulls natural phrasing from the industry playbook
 * and varies per deal so it never reads like a fixed template.
 */
function fallback(input: DraftInput): DraftResult {
  const first = firstName(input.contactName);
  const pb = getPlaybook(input.industryId ?? "generic");
  const seed = `${input.dealTitle}|${input.contactName}|${input.channel}`;
  const cold = (input.daysSinceContact ?? 0) >= 14 || input.recallReason === "lost_winnable";
  const sig = signOff(input);

  // Prefer the workspace's own go-to lines when they've tuned them.
  const nextFor = (ch: "email" | "sms"): string[] =>
    input.voice?.customNextSteps?.length ? input.voice.customNextSteps : pb.nextSteps[ch];
  const reLines = input.voice?.customReengage?.length ? input.voice.customReengage : pb.reengage;

  if (input.channel === "sms") {
    const step = pickVariant(nextFor("sms"), seed);
    const body = cold
      ? `${sentence(`hey ${first}, ${pickVariant(reLines, seed)}`)} ${step}`
      : `hey ${first} — ${step}`;
    return { body, source: "template" };
  }

  if (input.channel === "call") {
    const [a, b, c] = [pb.nextSteps.call[0], pb.nextSteps.call[1], pb.nextSteps.call[2]];
    return {
      body: [
        `• Open like you know them: reference ${input.company ?? "their situation"}${input.daysSinceContact ? ` and that it's been ${input.daysSinceContact} days` : ""}.`,
        `• ${a}`,
        `• ${b ?? "Listen for the real blocker before you pitch anything."}`,
        `• ${c ?? `Keep ${input.valueLabel.toLowerCase()} (${input.value} ${input.currency}) in mind and anchor to it.`}`,
        `• Lock one concrete next step with a date before you hang up.`,
      ].join("\n"),
      source: "template",
    };
  }

  // email
  const step = pickVariant(nextFor("email"), seed);
  if (cold) {
    const subject = pickVariant([`still on your radar, ${first}?`, `worth picking this back up?`, `quick one, ${first}`], seed);
    const body = `Hi ${first},\n\n${sentence(cap(pickVariant(reLines, seed)))} ${cap(step)}\n\nEither way, no pressure — just tell me to back off and I will.${sig ? `\n\n${sig}` : ""}`;
    return { subject: cap(subject), body, source: "template" };
  }
  const subject = pickVariant([`next on ${input.dealTitle}`, `quick next step, ${first}`, `keeping ${input.dealTitle} moving`], seed);
  const opener = pickVariant(
    [`Wanted to keep ${input.dealTitle} moving`, `Following up on ${input.dealTitle}`, `Picking back up on ${input.dealTitle}`],
    seed,
  );
  const body = `Hi ${first},\n\n${opener} — we left off around ${input.stageLabel.toLowerCase()}. ${cap(step)}${sig ? `\n\n${sig}` : ""}`;
  return { subject: cap(subject), body, source: "template" };
}

function playbookBlock(input: DraftInput): string {
  const pb = getPlaybook(input.industryId ?? "generic");
  const ch = input.channel === "call" ? "call" : input.channel;
  return `How a real ${input.industryLabel} rep talks (match the spirit, never copy these lines):
- What ${firstName(input.contactName)} wants: ${pb.buyerGoal}
- You are: ${pb.repRole}
- Objections you might hit: ${pb.objections.join("; ")}
- Natural next steps for ${ch}: ${pb.nextSteps[ch].join(" / ")}
- Words this industry uses: ${pb.vocabulary.join(", ")}
- Example lines in a real rep's voice (for tone only):
  • ${pb.sampleVoice.join("\n  • ")}`;
}

export async function draftMessage(input: DraftInput): Promise<DraftResult> {
  if (!isAiConfigured()) return fallback(input);

  const pb = getPlaybook(input.industryId ?? "generic");
  const user = `Channel: ${input.channel}
Industry: ${input.industryLabel}
Prospect: ${input.contactName}${input.company ? ` at ${input.company}` : ""}
Deal: "${input.dealTitle}" — ${input.valueLabel} ${input.value} ${input.currency}, currently at stage "${input.stageLabel}"
${input.recallReason ? `Recall reason: ${input.recallReason} (re-engagement — they've gone quiet)\n` : ""}${input.daysSinceContact !== undefined ? `Days since last contact: ${input.daysSinceContact}\n` : ""}${input.voice?.senderName || input.repName ? `You are: ${input.voice?.senderName ?? input.repName}\n` : ""}${input.voice?.signature ? `Sign off as: ${input.voice.signature}\n` : ""}${input.history && input.history.length ? `Recent history (newest first):\n- ${input.history.slice(0, 5).join("\n- ")}` : "No prior activity logged."}

${playbookBlock(input)}
${input.voice?.customNextSteps?.length ? `\nThis rep's own go-to next steps (prefer one of these when it fits): ${input.voice.customNextSteps.join(" / ")}` : ""}
${input.recallReason ? `\nRe-engagement openers (for inspiration): ${(input.voice?.customReengage?.length ? input.voice.customReengage : pb.reengage).join(" / ")}` : ""}
${input.voice?.profile ? `\nWrite in THIS person's voice — match it exactly so it sounds like them, not an AI:\n"""${input.voice.profile}"""` : ""}${input.instruction ? `\nAlso follow this instruction for this message:\n"""${input.instruction}"""` : ""}

Write the ${input.channel} message now, as this human. Make it impossible to tell AI was involved.`;

  try {
    const out = await completeJson<{ subject?: string; body: string }>({
      system: SYSTEM,
      user,
      schema: SCHEMA,
      maxTokens: 1024,
    });
    return {
      subject: input.channel === "email" ? out.subject : undefined,
      body: out.body,
      source: "ai",
    };
  } catch {
    return fallback(input);
  }
}

/** Exposed for tests: the phrases we guarantee never appear in human copy. */
export { AI_TELLS };
