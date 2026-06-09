/**
 * Merge-token fill for message templates. Templates carry tokens like
 * {{first_name}}, {{my_name}}, {{booking_link}}, plus industry-specific ones
 * ({{vehicle}}, {{job_type}}, …). This resolves everything we actually know —
 * contact, sender, and the contact's free-form attributes — and deliberately
 * leaves unknown tokens visible as {{token}} so a rep sees exactly what still
 * needs a human fill instead of silently sending a blank.
 */

export interface TokenContext {
  /** The prospect's full name — {{first_name}} uses the first word. */
  contactName?: string;
  /** The prospect's company — {{company}}. */
  company?: string;
  /** The sending rep's name — {{my_name}}. */
  senderName?: string;
  /** The rep's scheduling link — {{booking_link}}. */
  bookingUrl?: string;
  /** Free-form contact attributes; any {{key}} resolves from here as a fallback
   *  (e.g. {{vehicle}}, {{job_type}}, {{interest}} for industry templates). */
  attributes?: Record<string, string | number | boolean | null | undefined>;
}

const TOKEN = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

export function fillTokens(text: string, ctx: TokenContext): string {
  return text.replace(TOKEN, (raw, key: string) => {
    const k = key.toLowerCase();
    if (k === "first_name" && ctx.contactName) return ctx.contactName.trim().split(/\s+/)[0];
    if (k === "company" && ctx.company) return ctx.company;
    if (k === "my_name" && ctx.senderName) return ctx.senderName.trim().split(/\s+/)[0];
    if (k === "booking_link" && ctx.bookingUrl) return ctx.bookingUrl;
    const attr = ctx.attributes?.[k];
    if (attr !== undefined && attr !== null && attr !== "" && typeof attr !== "boolean") return String(attr);
    return raw; // unresolved → stay visible so the rep fills it by hand
  });
}

/** True when the text still contains an unfilled {{token}} (UI warning cue). */
export function hasUnfilledTokens(text: string): boolean {
  TOKEN.lastIndex = 0;
  return TOKEN.test(text);
}
