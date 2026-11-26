import type { ActionPurpose, WebinarRegistrant, WebinarSession } from "@/lib/webinar/types";

function first(name?: string): string {
  const n = name?.trim().split(/\s+/)[0];
  return n || "there";
}

function linkFor(reg: WebinarRegistrant, session: WebinarSession | undefined, purpose: ActionPurpose): string | undefined {
  if (purpose === "replay" || purpose === "followup") return session?.replayUrl || reg.rejoinUrl || session?.rejoinUrl;
  return reg.rejoinUrl || session?.rejoinUrl || session?.replayUrl;
}

function title(session: WebinarSession | undefined): string {
  return session?.title?.trim() || "the session";
}

/** Spoken first line. Short on purpose — the call has to start immediately. */
export function callOpener(reg: WebinarRegistrant, session: WebinarSession | undefined, purpose: ActionPurpose): string {
  const who = first(reg.name);
  if (reg.state === "pitch_drop" || purpose === "rejoin") {
    return `Hey ${who} — you just left ${title(session)}. I can send the replay, or we can do a quick call. Which do you want?`;
  }
  if (purpose === "replay") {
    return `Hey ${who}, we missed you at ${title(session)}. I can text the replay if now's a bad time.`;
  }
  return `Hey ${who}, quick follow-up from ${title(session)}. Got a second?`;
}

export function voicemailScript(reg: WebinarRegistrant, session: WebinarSession | undefined, purpose: ActionPurpose): string {
  const who = first(reg.name);
  const link = linkFor(reg, session, purpose);
  const tail = link ? "I'll text you the link as well." : "Reply to my text and I'll send the link.";
  if (purpose === "replay") return `Hi ${who}, sorry we missed you at ${title(session)}. ${tail}`;
  return `Hi ${who}, you dropped off ${title(session)} a moment ago. ${tail}`;
}

export function smsBody(reg: WebinarRegistrant, session: WebinarSession | undefined, purpose: ActionPurpose): string {
  const who = first(reg.name);
  const link = linkFor(reg, session, purpose);
  const url = link ? ` ${link}` : "";
  if (reg.state === "pitch_drop") {
    return `Hey ${who}, you slipped out right as we got to the useful part of ${title(session)}. Hop back in:${url}`.trim();
  }
  if (purpose === "reminder") {
    return `Hey ${who}, ${title(session)} is coming up. Here's your link:${url}`.trim();
  }
  if (purpose === "replay" || reg.state === "no_show") {
    return `Hey ${who}, we missed you at ${title(session)}. Replay's here whenever you want it:${url}`.trim();
  }
  if (purpose === "followup") {
    return `Hey ${who}, thanks for being at ${title(session)}. If you want to talk it through, reply here and I'll set it up.`;
  }
  return `Hey ${who}, you left ${title(session)}. I can send the replay, or we can do a quick call — reply with whichever is easier.`;
}

export function emailContent(reg: WebinarRegistrant, session: WebinarSession | undefined, purpose: ActionPurpose): { subject: string; body: string } {
  const who = first(reg.name);
  const link = linkFor(reg, session, purpose);
  const t = title(session);
  const line = link ? `Here's the link: ${link}` : "Reply to this and I'll send the link.";
  if (purpose === "reminder") {
    return { subject: `Your link for ${t}`, body: `Hey ${who},\n\n${t} is coming up.\n\n${line}` };
  }
  if (reg.state === "pitch_drop") {
    return { subject: `You left ${t} at the good part`, body: `Hey ${who},\n\nYou slipped out right as we got to the part worth staying for.\n\n${line}` };
  }
  if (purpose === "replay" || reg.state === "no_show") {
    return { subject: `Missed you at ${t}`, body: `Hey ${who},\n\nWe saved you a seat at ${t} and didn't see you. The replay is ready.\n\n${line}` };
  }
  if (purpose === "followup") {
    return { subject: `After ${t}`, body: `Hey ${who},\n\nThanks for being at ${t}. If you want to talk it through, reply with a time that works.\n\n${line}` };
  }
  return { subject: `You dropped off ${t}`, body: `Hey ${who},\n\nYou left ${t} a moment ago. I can send the replay, or we can do a quick call — reply with whichever is easier.` };
}

export function callContext(reg: WebinarRegistrant, session: WebinarSession | undefined, purpose: ActionPurpose): string {
  const link = linkFor(reg, session, purpose) ?? "none on file";
  return [
    `Webinar recovery. Session: ${title(session)}.`,
    `Person: ${reg.name ?? "unknown"}. State: ${reg.state}. Purpose: ${purpose}.`,
    "Sound like a person: short sentences, one light filler if it fits, and stop if they interrupt.",
    `Link to send them: ${link}.`,
    "They were on a live webinar or registered for one. Goal: get them back in, or book a conversation if the session is over.",
    "Do not invent prices, results, guarantees, or attendance numbers. If they want to stop, confirm and end the call.",
  ].join(" ");
}

export function optOutConfirmation(): string {
  return "You're opted out. We won't call or text you again.";
}
