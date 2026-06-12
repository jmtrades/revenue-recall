/**
 * Branded HTML wrapper for PRODUCT email — invites, digests, booking lifecycle,
 * dunning. These are transactional mail from the platform, so they should look
 * like the platform: dark card, RR mark, readable type, linked URLs.
 *
 * Deliberately NOT used for prospect outreach: a personal-looking plaintext
 * email is the product's voice (and converts better than anything that smells
 * like a campaign), so outreach stays text-only. The plaintext body remains the
 * source of truth everywhere — this wrapper renders that exact text, never a
 * separate copy that could drift.
 */
import { SITE_URL } from "@/lib/site";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Escape, then turn bare http(s) URLs into brand-colored links and newlines into <br>. */
export function bodyToHtml(body: string): string {
  const escaped = escapeHtml(body);
  // URLs were escaped above, so they contain no raw <>&"' — safe to wrap in an
  // anchor. Trailing sentence punctuation stays outside the link.
  const linked = escaped.replace(/https?:\/\/[^\s<]+[^\s<.,)!?;:]/g, (url) => `<a href="${url}" style="color:#34d399;text-decoration:underline;">${url}</a>`);
  return linked.replace(/\r?\n/g, "<br>");
}

/** Full HTML document for a product email. `body` is the same plaintext we send
 *  as the text part. An optional `cta` renders a prominent, email-safe button
 *  for the primary action (the inline URL stays in the text part for plaintext
 *  clients, so the button is an enhancement, never the only path). */
export function brandedEmailHtml({ subject, body, cta }: { subject: string; body: string; cta?: { label: string; url: string } }): string {
  const title = escapeHtml(subject);
  const content = bodyToHtml(body);
  const site = SITE_URL.replace(/^https?:\/\//, "");
  // A button is a bordered, padded table cell with an anchor — the only
  // button pattern email clients render reliably. Only http(s) urls are linked.
  const button =
    cta && /^https?:\/\//.test(cta.url)
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 4px;"><tr>
    <td style="background-color:#059669;border-radius:10px;">
      <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:11px 22px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(cta.label)}</a>
    </td></tr></table>`
      : "";
  // Table layout + inline styles: the only thing email clients render reliably.
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><meta name="color-scheme" content="dark"><title>${title}</title></head>
<body style="margin:0;padding:0;background-color:#0a0b0a;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0b0a;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
<tr><td style="padding:0 4px 16px;">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr>
    <td style="background-color:#059669;border-radius:9px;width:32px;height:32px;text-align:center;vertical-align:middle;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:bold;color:#ffffff;">RR</td>
    <td style="padding-left:10px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:600;color:#dfe3df;">Revenue Recall</td>
  </tr></table>
</td></tr>
<tr><td style="background-color:#111513;border:1px solid #262a27;border-radius:14px;padding:28px;">
  <p style="margin:0 0 14px;font-family:Arial,Helvetica,sans-serif;font-size:17px;font-weight:600;color:#f2f4f2;">${title}</p>
  <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.65;color:#c8cdc8;">${content}</p>
  ${button}
</td></tr>
<tr><td style="padding:16px 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.6;color:#6f766f;">
  Revenue Recall — autonomous outbound · <a href="${SITE_URL}" style="color:#6f766f;text-decoration:underline;">${site}</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}
