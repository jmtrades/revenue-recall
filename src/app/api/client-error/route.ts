import { withGuard } from "@/lib/api/guard";
import { logError } from "@/lib/log";
import { sendAlert } from "@/lib/alert";
import { rateLimit } from "@/lib/ratelimit";
import { parseClientError } from "@/lib/client-error-intake";

export const dynamic = "force-dynamic";

/**
 * Browser-error intake. Public by design — errors on logged-out marketing
 * pages (the landing voice demo especially) matter as much as in-app ones —
 * so every defense is on:
 * - per-IP rate limit, small body cap, strict schema with hard length clamps
 *   (see lib/client-error-intake)
 * - always 204, valid or not: an error reporter that errors helps nobody, and
 *   a uniform response leaks nothing to probes
 * - alerts deduped per message so one widespread crash is one page, not a storm
 */
const done = () => new Response(null, { status: 204 });

export const POST = withGuard(async (req: Request) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`client-error:${ip}`, 8, 60_000).ok) return done();

  const text = await req.text().catch(() => "");
  if (!text || text.length > 4096) return done();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return done();
  }
  const report = parseClientError(raw);
  if (!report) return done();

  logError("client.error", { ...report, ip });
  // One alert per distinct message per 5 minutes — a crash on a hot page fires
  // once, not once per visitor.
  if (rateLimit(`alert:client:${report.message.slice(0, 80)}`, 1, 300_000).ok) {
    void sendAlert("client.error", { message: report.message, source: report.source ?? "window", url: report.url ?? null, digest: report.digest ?? null });
  }
  return done();
});
