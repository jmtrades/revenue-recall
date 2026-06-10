import { SITE_URL } from "@/lib/site";

/**
 * RFC 9116 responsible-disclosure metadata, served at /.well-known/security.txt.
 * Points security researchers at the monitored mailbox and the public policy so
 * a vulnerability reaches us through a known, documented channel.
 */
const SECURITY_EMAIL = process.env.NEXT_PUBLIC_SECURITY_EMAIL || "security@recall-touch.com";

export const dynamic = "force-static";

export function GET() {
  // `Expires` is required by RFC 9116. One year out, recomputed on every deploy
  // (force-static evaluates this at build time) so it never silently goes stale.
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const body =
    [
      `Contact: mailto:${SECURITY_EMAIL}`,
      `Expires: ${expires}`,
      `Policy: ${SITE_URL}/security`,
      `Canonical: ${SITE_URL}/.well-known/security.txt`,
      `Preferred-Languages: en`,
    ].join("\n") + "\n";

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
