import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import { publicSiteUrl } from "@/lib/site";
import { sendEmail } from "@/lib/comms";
import { seenInboundEvent } from "@/lib/inbound-dedup";
import { logInfo } from "@/lib/log";
import { runWithOrg } from "@/lib/supabase/org-context";
import { getRecallOutcomes } from "@/lib/queries";
import { money } from "@/lib/format";

/**
 * User-lifecycle emails — the standard SaaS conversion/retention loop that was
 * entirely absent: a welcome on first workspace provision, a heads-up when the
 * trial is about to convert, and a dunning note when a payment fails. All are
 * internal product mail (sendEmail's `internal` flag — no commercial-compliance
 * footer), all best-effort, and the Stripe-driven ones dedupe on the event id
 * so webhook retries never double-send.
 */

export type LifecycleResult = { sent: boolean; reason?: "duplicate" | "no_recipient" | "send_failed" };

function appLink(path: string): string {
  const base = publicSiteUrl();
  return base ? `${base.replace(/\/$/, "")}${path}` : path;
}

/** The org's owner emails (falls back to admins), via the service client —
 *  webhook contexts have no session. */
export async function ownerEmailsForOrg(orgId: string): Promise<string[]> {
  if (!isSupabaseConfigured() || !orgId) return [];
  const client = getSupabase()!;
  const { data } = await client.from("members").select("email,role").eq("org_id", orgId).in("role", ["owner", "admin"]);
  const rows = (data as { email?: string; role?: string }[] | null) ?? [];
  const owners = rows.filter((r) => r.role === "owner" && r.email).map((r) => r.email!);
  if (owners.length) return owners;
  return rows.filter((r) => r.email).map((r) => r.email!);
}

async function deliver(to: string[], subject: string, body: string, cta?: { label: string; url: string }): Promise<boolean> {
  let ok = false;
  for (const addr of to) {
    const r = await sendEmail(addr, subject, body, { internal: true, cta }).catch(() => null);
    if (r && r.status !== "failed") ok = true;
  }
  return ok;
}

/** Dedupe a Stripe-triggered email on the event id (webhook retries are safe). */
async function alreadySent(kind: string, eventId?: string): Promise<boolean> {
  if (!eventId) return false;
  return seenInboundEvent("billing-mail", `${kind}:${eventId}`);
}

/** Dunning: a renewal payment failed — tell the customer before access lapses. */
export async function sendPaymentFailedEmail(orgId: string, eventId?: string): Promise<LifecycleResult> {
  if (await alreadySent("dunning", eventId)) return { sent: false, reason: "duplicate" };
  const to = await ownerEmailsForOrg(orgId);
  if (to.length === 0) return { sent: false, reason: "no_recipient" };
  const body = [
    "We couldn't process your latest Revenue Recall payment — usually an expired or replaced card.",
    "",
    `Update your payment method here and you're set: ${appLink("/settings?tab=billing")}`,
    "Stripe will retry automatically over the next few days; nothing is lost in the meantime.",
    "",
    "Need a hand? Reply to this email.",
  ].join("\n");
  const ok = await deliver(to, "Action needed: your Revenue Recall payment didn't go through", body, { label: "Update billing", url: appLink("/settings?tab=billing") });
  if (ok) logInfo("lifecycle.dunning_sent", { orgId });
  return ok ? { sent: true } : { sent: false, reason: "send_failed" };
}

/** The cancellation note's body — pure so the won-back framing is testable.
 *  When the AI rep actually won deals back, the email leads with THEIR number
 *  (the single most persuasive win-back argument we have); at zero it stays
 *  graceful and asks for the real reason instead of bragging about nothing. */
export function winbackBody(outcomes: { wonBack: number; recoveredValue: number; currency: string } | null): string {
  const lines = [
    "Your Revenue Recall subscription has ended — the AI rep is off. Your pipeline, contacts, and history are all safe on the free plan.",
    "",
  ];
  if (outcomes && outcomes.wonBack > 0) {
    lines.push(
      `For the record: while it ran, it won back ${money(outcomes.recoveredValue, outcomes.currency)} across ${outcomes.wonBack} ${outcomes.wonBack === 1 ? "deal" : "deals"} that had gone cold.`,
      `If it ever makes sense again, one click turns it back on — it picks up right where it left off: ${appLink("/settings?tab=billing")}`,
    );
  } else {
    lines.push(`If it ever makes sense again, one click turns it back on: ${appLink("/settings?tab=billing")}`);
  }
  lines.push("", "And honestly — if something didn't work the way you needed, reply and tell me. I read every one of these.");
  return lines.join("\n");
}

/** Win-back: the subscription was canceled — close gracefully, cite what the
 *  AI rep actually recovered (their own number), and leave the door open. */
export async function sendCancellationEmail(orgId: string, eventId?: string): Promise<LifecycleResult> {
  if (await alreadySent("winback", eventId)) return { sent: false, reason: "duplicate" };
  const to = await ownerEmailsForOrg(orgId);
  if (to.length === 0) return { sent: false, reason: "no_recipient" };
  // The org's own won-back numbers, resolved in this webhook context (no
  // session) via the same org-scoping the cron uses. Best-effort: a stats
  // hiccup must never block the goodbye note.
  const outcomes = await runWithOrg(orgId, () => getRecallOutcomes()).catch(() => null);
  const ok = await deliver(to, "Your AI rep is off — here's where things stand", winbackBody(outcomes), { label: "Turn it back on", url: appLink("/settings?tab=billing") });
  if (ok) logInfo("lifecycle.winback_sent", { orgId });
  return ok ? { sent: true } : { sent: false, reason: "send_failed" };
}

/** Welcome — fired once, right after a new user's workspace is provisioned. */
export async function sendWelcomeEmail(to: string, name?: string): Promise<LifecycleResult> {
  if (!to) return { sent: false, reason: "no_recipient" };
  const first = (name ?? "").trim().split(/\s+/)[0];
  const body = [
    `${first ? `${first} — welcome` : "Welcome"} to Revenue Recall. Your workspace is live.`,
    "",
    "The fastest way to feel it work:",
    `  1. Import your leads (CSV or connect your CRM): ${appLink("/settings?tab=import")}`,
    `  2. Open your recall queue — the deals slipping away, ranked: ${appLink("/recall")}`,
    "  3. Send one follow-up. That's the whole habit.",
    "",
    "Questions at any point — just reply to this email.",
  ].join("\n");
  const ok = await deliver([to], "Welcome to Revenue Recall — your workspace is live", body, { label: "Open your recall queue", url: appLink("/recall") });
  return ok ? { sent: true } : { sent: false, reason: "send_failed" };
}
