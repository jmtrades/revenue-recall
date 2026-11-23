import { createHash } from "node:crypto";
import type { CallClass } from "@/lib/webinar/types";

/** Bucket a gateway/CRM outcome string into the lifecycle's call classes. */
export function classifyCallOutcome(outcome?: string, durationSec?: number): CallClass {
  const o = (outcome ?? "").toLowerCase();
  if (/opt[\s_-]?out|do not call|stop calling|not interested/.test(o) && /opt|stop|do not/.test(o)) return "opt_out";
  if (/wrong[\s_-]?number|not in service|disconnected number|invalid number/.test(o)) return "wrong_number";
  if (/voicemail|\bvm\b|machine|answering/.test(o)) return "voicemail";
  if (/\bbusy\b/.test(o)) return "busy";
  if (/fail|error|provider|unable to dial/.test(o)) return "failed";
  if (/\bbook/.test(o)) return "booked";
  if (/hang[\s_-]?up|hangup/.test(o)) return "hangup";
  if (/no[\s_-]?answer|missed|unanswered|no[\s_-]?pickup|no one answered/.test(o)) return "no_answer";
  if (/connect|completed|answered|conversation|spoke|in progress/.test(o)) {
    if (durationSec !== undefined && durationSec < 8) return "hangup";
    return "connected";
  }
  return "no_answer";
}

export function hashKey(parts: string[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex").slice(0, 24);
}

/** Someone saying they already booked, in a reply. */
export function saysBooked(text: string): boolean {
  return /\b(i(?:'ve| have)? booked|just booked|booked (a|the|my) (call|time|slot|seat)|see you (then|on the call)|put it in my calendar)\b/i.test(text);
}
