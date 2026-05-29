import { completeJson, isAiConfigured } from "@/lib/ai/client";
import { refineForHumanness } from "@/lib/ai/refine";
import { getPlaybook } from "@/lib/industries";
import { languageDirective } from "@/lib/languages";
import { getTone, type ToneId } from "@/lib/tones";
import {
  AI_TELLS,
  capitalize as cap,
  firstName,
  pickVariant,
  pick,
  seeded,
  sentence,
  GREETINGS_EMAIL,
  GREETINGS_SMS,
  EASY_OUT_EMAIL,
  EASY_OUT_SMS,
} from "@/lib/copy";

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
  /** The buyer's most recent inbound message — the strongest anchor for a reply. */
  lastInbound?: string;
  repName?: string;
  /** Selectable voice/tone preset for this message (see lib/tones). */
  tone?: ToneId;
  /** Variation index — produces a distinctly different take of the same message. */
  variant?: number;
  /** Special message type. Default is a normal outreach/follow-up. */
  scenario?: "voicemail" | "breakup" | "referral" | "recap" | "renewal" | "reschedule";
  /** Optional extra instruction from a user-defined Autopilot task. */
  instruction?: string;
  /** ISO 639-1 language to write in (default English). See lib/languages. */
  language?: string;
  /** What we know about how/when this person engages (see lib/insights.reachHint).
   *  Used only to make live-AI copy feel naturally timed — never stated mechanically. */
  timingHint?: string;
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
- Use contractions. Vary sentence length hard — a 3-word line next to a 15-word one. Even, same-length sentences are the #1 AI tell. An occasional fragment is fine.
- Don't start sentences the same way twice in a row (especially "I"). No timid hedging openers like "I just wanted to" or "I was hoping to" — say it straight.
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
 * set (the default demo path). Composes from multiple body skeletons whose parts
 * (greeting, opener, next-step, easy-out, sign-off) each rotate on an
 * independent salted seed — so two deals almost never produce the same-shaped
 * message, and nothing reads like a fixed mail-merge.
 */
function fallback(input: DraftInput): DraftResult {
  const first = firstName(input.contactName);
  const pb = getPlaybook(input.industryId ?? "generic");
  // Fold the tone and variation index into the seed so picking a different voice
  // (or asking for another take) reshuffles the composition into a different
  // (still clean) message. Default tone + variant 0 keep the seed byte-identical
  // to before, so existing output is unchanged.
  const tonePart = input.tone && input.tone !== "warm" ? `|${input.tone}` : "";
  const variantPart = input.variant ? `|v${input.variant}` : "";
  const seed = `${input.dealTitle}|${input.contactName}|${input.channel}${tonePart}${variantPart}`;
  const cold = (input.daysSinceContact ?? 0) >= 14 || input.recallReason === "lost_winnable";
  const sig = signOff(input);
  const sigLine = sig ? `\n\n${sig}` : "";

  // Prefer the workspace's own go-to lines when they've tuned them.
  const nextFor = (ch: "email" | "sms"): string[] =>
    input.voice?.customNextSteps?.length ? input.voice.customNextSteps : pb.nextSteps[ch];
  const reLines = input.voice?.customReengage?.length ? input.voice.customReengage : pb.reengage;

  // Scenario messages have their own shape and override the channel default.
  if (input.scenario === "voicemail") {
    return { body: voicemailFallback(input, first, seed), source: "template" };
  }
  if (input.scenario === "breakup") {
    return input.channel === "sms"
      ? { body: breakupSmsFallback(first, seed), source: "template" }
      : { ...breakupEmailFallback(input, first, seed, sigLine), source: "template" };
  }
  if (input.scenario && SCENARIO_COPY[input.scenario]) {
    return scenarioFallback(input, first, seed, sigLine);
  }

  if (input.channel === "sms") {
    return { body: smsFallback(input, first, seed, cold, nextFor("sms"), reLines), source: "template" };
  }
  if (input.channel === "call") {
    return { body: callFallback(input, seed), source: "template" };
  }
  return { ...emailFallback(input, first, seed, cold, sigLine, nextFor("email"), reLines), source: "template" };
}

/** A short, natural voicemail to leave — spoken, casual, one easy reason to call back. */
function voicemailFallback(input: DraftInput, first: string, seed: string): string {
  const rep = input.voice?.senderName || input.repName || "";
  const who = rep ? `it's ${rep}` : "it's me";
  const skeletons = [
    `Hey ${first}, ${who} — quick one about ${input.dealTitle}. Give me a ring when you get a sec, no rush. Talk soon.`,
    `Hi ${first}, ${who}. Wanted to catch you about ${input.dealTitle} — call me back when it's easy, I'll keep it short. Cheers.`,
    `Hey ${first}, ${who}. Nothing urgent — had a quick thought on ${input.dealTitle}. Buzz me back when you've got a minute.`,
    `${first}, ${who} — tried to catch you about ${input.dealTitle}. Ping me back whenever, I'll be around. Thanks.`,
  ];
  return pick(skeletons, seed, "vm");
}

/** The gracious "last touch" / breakup email — often the one that gets a reply. */
function breakupEmailFallback(input: DraftInput, first: string, seed: string, sigLine: string): { subject: string; body: string } {
  const greet = pick(GREETINGS_EMAIL, seed, "greet")(first);
  const subject = pick(
    [`closing the loop, ${first}`, `should I close this out?`, `last one on ${input.dealTitle}`, `wrapping up ${input.dealTitle}`],
    seed,
    "subj",
  );
  const skeletons = [
    `${greet}\n\nI haven't heard back, so I'll assume the timing's just off and stop chasing — no hard feelings at all. If it's ever worth picking up, you know where I am.${sigLine}`,
    `${greet}\n\nI don't want to be the person clogging your inbox, so this'll be my last one for now. If things change down the line, just say the word and I'll pick it right back up.${sigLine}`,
    `${greet}\n\nSounds like now's not the moment, and that's completely fine. I'll close this out on my end — door's open whenever it makes sense for you.${sigLine}`,
  ];
  return { subject: cap(subject), body: pick(skeletons, seed, "breakup_email") };
}

function breakupSmsFallback(first: string, seed: string): string {
  const skeletons = [
    `hey ${first} — i'll stop chasing for now, figure the timing's just off. door's open if it ever makes sense. all the best.`,
    `${first}, i won't keep bugging you — this is my last one for now. just shout if anything changes.`,
    `all good ${first}, i'll close this out on my end. if it's ever worth picking up, you know where i am.`,
  ];
  return pick(skeletons, seed, "breakup_sms");
}

type ScenarioKey = "referral" | "recap" | "renewal" | "reschedule";

/** Deterministic, human copy for the remaining scenarios. `D` is the deal title.
 *  Bodies end on a question so they invite a reply; the email path adds greeting + sign-off. */
const SCENARIO_COPY: Record<ScenarioKey, { subject: (f: string, d: string) => string[]; email: (f: string, d: string) => string[]; sms: (f: string, d: string) => string[]; coach: string }> = {
  referral: {
    subject: (f, d) => [`quick favor, ${f}?`, `who else should I be talking to?`, `one ask on ${d}`],
    email: (f) => [
      `Since this has been going well, figured I'd ask — is there anyone else you know who's wrestling with the same thing? Totally fine if not, just thought I'd check.`,
      `Quick one, ${f} — who's the one person you'd point me to if they had this on their plate? No pressure at all.`,
      `If it's been useful, would you mind pointing me to one person who might get value from it too? Happy to keep it low-key.`,
    ],
    sms: (f) => [
      `hey ${f} — random ask: anyone you know dealing with the same thing? no worries if not.`,
      `quick one ${f}: who's the one person you'd send my way? totally fine to say no one comes to mind.`,
      `if it's been useful, mind pointing me to someone who'd get value too?`,
    ],
    coach: "Referral ask: only after real value, make it one easy name, zero pressure.",
  },
  recap: {
    subject: (f, d) => [`recap + next step on ${d}`, `quick recap, ${f}`, `where we landed on ${d}`],
    email: (f, d) => [
      `Good talking just now. Quick recap so we're on the same page: we covered where ${d} stands and what matters most to you. I'll get the next piece over, and we said we'd reconnect — does that still work?`,
      `Thanks for the time, ${f}. To recap: we talked through your priorities on ${d} and the path forward. I'll handle my side — want me to lock the next step now?`,
      `Great chat. Short recap: we aligned on the goal for ${d} and the next move. I'll follow through on what I owe you — when works to pick it back up?`,
    ],
    sms: (f, d) => [
      `great chat ${f} — quick recap: we lined up the next step on ${d}. i'll handle my side. good to lock a time?`,
      `thanks ${f}! recap: covered ${d} and the path forward. want me to set the next step now?`,
      `good talking ${f}. i'll send my piece over — shall we pin the next step?`,
    ],
    coach: "Post-meeting recap: confirm what was agreed, own your next step, pin the follow-up.",
  },
  renewal: {
    subject: (f, d) => [`${d} — renewal coming up`, `quick one before renewal, ${f}`, `keeping ${d} going`],
    email: (f, d) => [
      `Your renewal on ${d} is coming up, so I wanted to get ahead of it. Anything you'd want to change or add before we roll it over? Happy to walk through options.`,
      `Quick one, ${f} — ${d} is up for renewal soon. Before it rolls, is it working the way you hoped, or is there something you'd tweak?`,
      `Renewal time on ${d}. Rather than auto-pilot it, want to take five minutes to make sure it still fits where you're headed?`,
    ],
    sms: (f, d) => [
      `hey ${f} — ${d} renews soon. anything you'd change before it rolls over?`,
      `quick one ${f}: renewal's coming up on ${d}. still working how you hoped, or want to tweak?`,
      `before ${d} renews — worth five minutes to make sure it still fits?`,
    ],
    coach: "Renewal/upsell: get ahead of it, check fit honestly, open the door to expand — no hard sell.",
  },
  reschedule: {
    subject: (f, d) => [`missed you — let's grab another time`, `no worries, ${f} — reschedule?`, `another go at ${d}?`],
    email: (f, d) => [
      `Looks like we missed each other — no problem at all, happens to everyone. Want to grab another time this week for ${d}? Easy to find a slot that works.`,
      `No worries that we didn't connect, ${f}. Want to put another time on the calendar for ${d}? Whatever's easiest for you.`,
      `We got crossed wires on the last one — totally fine. When's good to try again on ${d}?`,
    ],
    sms: (f, d) => [
      `hey ${f}, looks like we missed each other — no worries. want to grab another time for ${d}?`,
      `no stress that we didn't connect ${f}. when's good to try again on ${d}?`,
      `missed you ${f}! easy to find another slot for ${d} — what works this week?`,
    ],
    coach: "No-show reschedule: zero guilt, assume good faith, make rebooking effortless.",
  },
};

function scenarioFallback(input: DraftInput, first: string, seed: string, sigLine: string): { subject?: string; body: string; source: "template" } {
  const key = input.scenario as ScenarioKey;
  const copy = SCENARIO_COPY[key];
  const d = input.dealTitle;
  if (input.channel === "sms") {
    return { body: pick(copy.sms(first, d), seed, `${key}_sms`), source: "template" };
  }
  const greet = pick(GREETINGS_EMAIL, seed, "greet")(first);
  const subject = cap(pick(copy.subject(first, d), seed, `${key}_subj`));
  const body = `${greet}\n\n${pick(copy.email(first, d), seed, `${key}_email`)}${sigLine}`;
  return { subject, body, source: "template" };
}

function smsFallback(input: DraftInput, first: string, seed: string, cold: boolean, stepPool: string[], reLines: string[]): string {
  const greet = pick(GREETINGS_SMS, seed, "greet")(first);
  const step = pickVariant(stepPool, seeded(seed, "step"));

  if (cold) {
    const re = pickVariant(reLines, seeded(seed, "re"));
    const out = pick(EASY_OUT_SMS, seed, "out");
    const skeletons = [
      `${greet}, ${sentence(re)} ${sentence(step)}`,
      `${sentence(re)} ${sentence(step)} ${sentence(out)}`,
      `${greet} — ${sentence(re)} ${sentence(step)}`,
      `${sentence(re)} ${sentence(step)}`,
    ];
    return pick(skeletons, seed, "sms_cold");
  }

  const skeletons = [
    `${greet} — ${sentence(step)}`,
    `${greet}, ${sentence(step)}`,
    `${sentence(step)}`,
    `${greet}, quick one — ${sentence(step)}`,
  ];
  return pick(skeletons, seed, "sms_warm");
}

function callFallback(input: DraftInput, seed: string): string {
  const pb = getPlaybook(input.industryId ?? "generic");
  const step = pickVariant(pb.nextSteps.call, seeded(seed, "call_step"));
  const opener = pick(
    [
      `Open like you know them: reference ${input.company ?? "their situation"}${input.daysSinceContact ? ` and that it's been ${input.daysSinceContact} days` : ""}, then ask how things are going.`,
      `Skip the script — start with ${input.company ?? "what they're working on"} and why you're calling now, then hand them the mic.`,
      `Lead warm: a quick "${input.daysSinceContact ? "been a bit" : "good timing"}", then straight into a question about ${input.company ?? "their situation"}.`,
    ],
    seed,
    "call_open",
  );
  // A discovery question keeps them talking — people stay on calls they're driving.
  const discover = pick(
    [
      "Ask an open question and then go quiet — let them fill the space.",
      "Get them talking: what's changed since you last spoke, and what's the priority now?",
      "Ask what a good outcome here looks like for them — then actually listen.",
    ],
    seed,
    "call_discover",
  );
  // Handle the objection you're most likely to hear — acknowledge, don't argue.
  const objection = pickVariant(pb.objections, seeded(seed, "call_obj"));
  const handle = pick(
    [
      `If you hear "${objection}", agree it's fair, then ask a question instead of pitching back.`,
      `Likely pushback: "${objection}". Acknowledge it honestly, then ask what'd need to be true for it to work.`,
      `Expect "${objection}". Don't argue it — get curious about what's behind it.`,
    ],
    seed,
    "call_handle",
  );
  const closer = pick(
    [
      "Lock one concrete next step with a real date before you hang up.",
      "Don't end without a specific day and time — a calendar slot, not a 'maybe'.",
      "Get a real commitment: name the next step and put a date on it together.",
    ],
    seed,
    "call_close",
  );
  return [
    `• ${opener}`,
    `• ${discover}`,
    `• ${sentence(cap(step))}`,
    `• ${handle}`,
    `• ${closer}`,
  ].join("\n");
}

function emailFallback(
  input: DraftInput,
  first: string,
  seed: string,
  cold: boolean,
  sigLine: string,
  stepPool: string[],
  reLines: string[],
): { subject: string; body: string } {
  const greet = pick(GREETINGS_EMAIL, seed, "greet")(first);
  const step = pickVariant(stepPool, seeded(seed, "step"));

  if (cold) {
    const re = pickVariant(reLines, seeded(seed, "re"));
    const out = pick(EASY_OUT_EMAIL, seed, "out");
    const subject = pick(
      [
        `still on your radar, ${first}?`,
        `worth picking this back up?`,
        `quick one, ${first}`,
        `${input.dealTitle} — still live?`,
        `should I keep this open, ${first}?`,
      ],
      seed,
      "subj",
    );
    const skeletons = [
      `${greet}\n\n${sentence(cap(re))} ${sentence(cap(step))}\n\n${out}${sigLine}`,
      `${greet}\n\n${sentence(cap(re))}\n\n${sentence(cap(step))} ${out}${sigLine}`,
      `${greet}\n\n${sentence(cap(step))} The reason I ask: ${sentence(re)}\n\n${out}${sigLine}`,
      `${greet}\n\n${sentence(cap(re))} ${sentence(cap(step))} ${out}${sigLine}`,
    ];
    return { subject: cap(subject), body: pick(skeletons, seed, "email_cold") };
  }

  const subject = pick(
    [
      `next on ${input.dealTitle}`,
      `quick next step, ${first}`,
      `keeping ${input.dealTitle} moving`,
      `where we're at on ${input.dealTitle}`,
    ],
    seed,
    "subj",
  );
  const opener = pick(
    [
      `Wanted to keep ${input.dealTitle} moving`,
      `Following up on ${input.dealTitle}`,
      `Picking back up on ${input.dealTitle}`,
      `Keeping this one warm`,
    ],
    seed,
    "opener",
  );
  const stageLow = input.stageLabel.toLowerCase();
  const skeletons = [
    `${greet}\n\n${opener} — we left off around ${stageLow}. ${sentence(cap(step))}${sigLine}`,
    `${greet}\n\n${opener}. ${sentence(cap(step))}${sigLine}`,
    `${greet}\n\n${sentence(cap(step))}\n\nWe're around ${stageLow} now, so this feels like the right next move.${sigLine}`,
    `${greet}\n\n${opener}. We're at ${stageLow}. ${sentence(cap(step))}${sigLine}`,
  ];
  return { subject: cap(subject), body: pick(skeletons, seed, "email_warm") };
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

/**
 * Build the user prompt for a live draft. Exported so the Batches path can send
 * the byte-identical prompt the synchronous path uses (`draftMessage`).
 */
export function buildDraftUserPrompt(input: DraftInput): string {
  const pb = getPlaybook(input.industryId ?? "generic");
  const tone = getTone(input.tone);
  const scenarioCoaching =
    input.scenario === "voicemail"
      ? `\nThis is a VOICEMAIL to leave out loud: 2-3 short spoken sentences, warm and casual, one easy reason to call back, no pressure. No subject, no sign-off block — it's spoken.`
      : input.scenario === "breakup"
        ? `\nThis is a BREAKUP / last-touch message: gracious, zero guilt-trip, make it genuinely easy to walk away — and easy to come back. No pushy ask; leave the door open. (These often get the reply.)`
        : input.scenario && SCENARIO_COPY[input.scenario as ScenarioKey]
          ? `\nScenario — ${SCENARIO_COPY[input.scenario as ScenarioKey].coach}`
          : "";
  const callCoaching =
    input.channel === "call"
      ? `\nThis is a CALL talk track (5 short bullets), built to keep them on the phone, not a monologue:
- Open warm and earn 20 seconds: a real reason you're calling now, then a genuine question.
- Make most bullets QUESTIONS — open-ended, about them. People stay on the phone when they're talking, not being pitched.
- Include one bullet that handles the objection you're most likely to hear (acknowledge it, don't argue, ask a question back).
- Close by locking one concrete next step with a real date/time — never a vague "I'll follow up".`
      : "";
  const user = `Channel: ${input.channel}
Industry: ${input.industryLabel}
Tone for this message: ${tone.label} — ${tone.directive}${scenarioCoaching}${callCoaching}
Prospect: ${input.contactName}${input.company ? ` at ${input.company}` : ""}
Deal: "${input.dealTitle}" — ${input.valueLabel} ${input.value} ${input.currency}, currently at stage "${input.stageLabel}"
${input.recallReason ? `Recall reason: ${input.recallReason} (re-engagement — they've gone quiet)\n` : ""}${input.daysSinceContact !== undefined ? `Days since last contact: ${input.daysSinceContact}\n` : ""}${input.voice?.senderName || input.repName ? `You are: ${input.voice?.senderName ?? input.repName}\n` : ""}${input.voice?.signature ? `Sign off as: ${input.voice.signature}\n` : ""}${input.history && input.history.length ? `Recent history (newest first):\n- ${input.history.slice(0, 5).join("\n- ")}` : "No prior activity logged."}${input.lastInbound ? `\n\nThe last thing THEY said to you (anchor your message to this — acknowledge or build on it, never ignore it):\n"""${input.lastInbound}"""` : ""}

${playbookBlock(input)}
${input.voice?.customNextSteps?.length ? `\nThis rep's own go-to next steps (prefer one of these when it fits): ${input.voice.customNextSteps.join(" / ")}` : ""}
${input.recallReason ? `\nRe-engagement openers (for inspiration): ${(input.voice?.customReengage?.length ? input.voice.customReengage : pb.reengage).join(" / ")}` : ""}
${input.voice?.profile ? `\nWrite in THIS person's voice — match it exactly so it sounds like them, not an AI:\n"""${input.voice.profile}"""` : ""}${input.timingHint ? `\nHow they engage: ${input.timingHint} Let this quietly shape the framing if it helps — never say it out loud or sound like you're profiling them.` : ""}${input.instruction ? `\nAlso follow this instruction for this message:\n"""${input.instruction}"""` : ""}${input.variant ? `\nThis is alternative take #${input.variant + 1}. Open differently and restructure it so it reads as a genuinely distinct message from a default version — same intent, fresh wording.` : ""}

${languageDirective(input.language) ? `\n${languageDirective(input.language)}` : ""}
Write the ${input.channel} message now, as this human. Make it impossible to tell AI was involved.`;
  return user;
}

/** The drafting system prompt + schema, exported for the Batches path. */
export const DRAFT_SYSTEM = SYSTEM;
export const DRAFT_SCHEMA = SCHEMA;

export async function draftMessage(input: DraftInput): Promise<DraftResult> {
  if (!isAiConfigured()) return fallback(input);

  const user = buildDraftUserPrompt(input);

  try {
    const raw = await completeJson<{ subject?: string; body: string }>({
      system: SYSTEM,
      user,
      schema: SCHEMA,
      maxTokens: 1024,
      // Adaptive thinking at xhigh for the sharpest, most human-sounding copy.
      // (Variation comes from the per-variant prompt directive, not temperature —
      // sampling params are rejected on Opus 4.7/4.8.)
      think: true,
      effort: "xhigh",
      feature: "draft",
    });
    // Score locally and let the model fix its own tells once if needed.
    const out = await refineForHumanness({ system: SYSTEM, schema: SCHEMA, draft: raw, maxTokens: 1024, feature: "draft" });
    return {
      subject: input.channel === "email" ? out.subject : undefined,
      body: out.body,
      source: "ai",
    };
  } catch {
    return fallback(input);
  }
}

/**
 * Produce several distinct takes of the same message so a rep can pick the one
 * that sounds most like them. Each variant reshuffles the deterministic
 * composition (no key) or nudges the model toward a fresh structure (live), and
 * we de-dupe identical bodies so the rep always sees genuine alternatives.
 */
export async function draftVariations(input: DraftInput, count = 3): Promise<DraftResult[]> {
  const n = Math.max(1, Math.min(count, 5));
  const all = await Promise.all(Array.from({ length: n }, (_, i) => draftMessage({ ...input, variant: i })));
  const seen = new Set<string>();
  const unique: DraftResult[] = [];
  for (const r of all) {
    const key = r.body.trim();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(r);
    }
  }
  return unique;
}

/** Exposed for tests: the phrases we guarantee never appear in human copy. */
export { AI_TELLS };
