import { getProvider } from "@/lib/crm/registry";
import { getOrgSettings } from "@/lib/org";
import { sendEmail } from "@/lib/comms";
import { computeMetrics } from "@/lib/analytics";
import { buildRecallQueue, summarizeRecall } from "@/lib/recall/engine";
import { getTasks, safePipeline } from "@/lib/queries";
import { money } from "@/lib/format";
import { isSupabaseConfigured, getSupabase } from "@/lib/supabase/client";
import { resolveActiveOrgId } from "@/lib/supabase/active-org";
import { getActiveOrgId } from "@/lib/supabase/tenant";
import { hourInZone, dayInZone } from "@/lib/tz";

/**
 * Scheduled email notifications. Driven by the cron tick, gated by the org's
 * notification preferences, and de-duplicated to once per calendar day (UTC) so
 * a frequent cron can't send the same digest twice. Recipients are the org's
 * users; with no email provider configured every send is a logged no-op, so the
 * flow is exercisable in the demo and goes live the moment a provider is set.
 */

export type DigestKind = "daily_digest" | "task_reminders";

export interface DigestResult {
  sent: DigestKind[];
  recipients: number;
}

// ---- once-per-day state (Supabase table, else in-memory for the demo) ----
const memSent = new Map<string, string>(); // kind -> YYYY-MM-DD

async function orgId(): Promise<string | null> {
  return (await resolveActiveOrgId()) ?? (getSupabase() ? await getActiveOrgId(getSupabase()!) : null);
}

async function alreadySent(kind: DigestKind, day: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return memSent.get(kind) === day;
  const id = await orgId();
  if (!id) return false;
  const { data } = await getSupabase()!
    .from("digest_runs")
    .select("sent_on")
    .eq("org_id", id)
    .eq("kind", kind)
    .maybeSingle();
  return (data?.sent_on as string | undefined) === day;
}

async function markSent(kind: DigestKind, day: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    memSent.set(kind, day);
    return;
  }
  const id = await orgId();
  if (!id) return;
  await getSupabase()!.from("digest_runs").upsert({ org_id: id, kind, sent_on: day }, { onConflict: "org_id,kind" });
}

async function recipientEmails(): Promise<string[]> {
  const users = await getProvider().listUsers();
  return users.map((u) => u.email).filter((e): e is string => Boolean(e));
}

async function broadcast(to: string[], subject: string, body: string): Promise<number> {
  let ok = 0;
  for (const addr of to) {
    const r = await sendEmail(addr, subject, body).catch(() => null);
    if (r && r.status !== "failed") ok++;
  }
  return ok;
}

async function buildDailyDigest(orgName: string): Promise<{ subject: string; body: string }> {
  const provider = getProvider();
  const [pipelines, opps] = await Promise.all([provider.listPipelines(), provider.listOpportunities()]);
  const metrics = computeMetrics(opps, safePipeline(pipelines));
  const recall = buildRecallQueue(opps, pipelines);
  const summary = summarizeRecall(recall, metrics.currency);
  const cur = metrics.currency;

  const lines = [
    `Good morning — here's where ${orgName} stands today.`,
    "",
    "Pipeline",
    `  Open: ${money(metrics.openValue, cur)} across ${metrics.openCount} deals`,
    `  Weighted forecast: ${money(metrics.weightedForecast, cur)}`,
    `  Won this period: ${money(metrics.wonValue, cur)} (${metrics.wonCount})`,
    "",
    "Revenue Recall",
    `  ${money(summary.totalRecoverable, cur)} recoverable across ${summary.itemCount} at-risk deals`,
  ];
  const top = recall.slice(0, 3);
  if (top.length) {
    lines.push("", "Top 3 to work today:");
    top.forEach((r, i) => lines.push(`  ${i + 1}. ${r.title} — ${r.recommendation}`));
  }
  return { subject: `Your pipeline today — ${orgName}`, body: lines.join("\n") };
}

async function buildTaskReminders(orgName: string): Promise<{ subject: string; body: string; count: number } | null> {
  const tasks = await getTasks();
  const due = tasks.filter((t) => t.dueInDays === 0);
  if (!due.length) return null;
  const lines = [
    `${due.length} ${due.length === 1 ? "task needs" : "tasks need"} you today at ${orgName}.`,
    "",
    ...due.map((t) => `  • [${t.channel}] ${t.title} — ${t.note}`),
  ];
  return { subject: `${due.length} ${due.length === 1 ? "task" : "tasks"} due today`, body: lines.join("\n"), count: due.length };
}

/** Send any digest/reminder emails the org has opted into and hasn't had today. */
export async function runDigests(now: Date = new Date()): Promise<DigestResult> {
  const result: DigestResult = { sent: [], recipients: 0 };
  const { name: orgName, notificationPrefs: prefs, timezone } = await getOrgSettings();

  // Fire in/after the morning send-hour, deduped per LOCAL day. With the org's
  // timezone set we use its local morning (DIGEST_SEND_HOUR_LOCAL, default 8) and
  // local calendar day — so a global customer base gets "Good morning" in the
  // morning, and an org ahead of UTC never gets two digests across UTC midnight.
  // No timezone → the fixed UTC hour (DIGEST_SEND_HOUR_UTC, default 13). Robust to
  // a missed tick; the per-day dedup keeps it to once a day.
  const tz = timezone || undefined;
  const sendHour = Number(tz ? (process.env.DIGEST_SEND_HOUR_LOCAL ?? 8) : (process.env.DIGEST_SEND_HOUR_UTC ?? 13));
  if (Number.isFinite(sendHour) && hourInZone(now, tz) < sendHour) return result;
  const day = dayInZone(now, tz);

  const to = await recipientEmails();
  if (!to.length) return result;

  if (prefs.daily_digest && !(await alreadySent("daily_digest", day))) {
    const { subject, body } = await buildDailyDigest(orgName);
    result.recipients += await broadcast(to, subject, body);
    await markSent("daily_digest", day);
    result.sent.push("daily_digest");
  }

  if (prefs.task_reminders && !(await alreadySent("task_reminders", day))) {
    const reminders = await buildTaskReminders(orgName);
    if (reminders) {
      result.recipients += await broadcast(to, reminders.subject, reminders.body);
      await markSent("task_reminders", day);
      result.sent.push("task_reminders");
    }
  }

  return result;
}
