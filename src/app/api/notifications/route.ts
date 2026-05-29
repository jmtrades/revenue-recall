import { NextResponse } from "next/server";
import { getProvider } from "@/lib/crm/registry";
import { getOrgSettings } from "@/lib/org";
import { buildRecallQueue } from "@/lib/recall/engine";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;

interface NotificationItem {
  id: string;
  kind: "recall" | "new_lead" | "stage_change";
  title: string;
  detail: string;
  href: string;
}

/**
 * In-app notification feed, assembled from the sources the org has opted into.
 * Each toggle in Settings → Notifications gates a class of feed item:
 *   recall_flag   → at-risk deals from the recall engine
 *   lead_assigned → newly created deals
 *   stage_change  → recent stage moves
 * (daily_digest / task_reminders are email-delivery prefs, not in-app feed items.)
 */
export async function GET() {
  const provider = getProvider();
  const [{ notificationPrefs: prefs }, pipelines, opps, activities] = await Promise.all([
    getOrgSettings(),
    provider.listPipelines(),
    provider.listOpportunities(),
    provider.listRecentActivities(40),
  ]);

  const oppById = new Map(opps.map((o) => [o.id, o]));
  const items: NotificationItem[] = [];

  if (prefs.recall_flag) {
    for (const r of buildRecallQueue(opps, pipelines).slice(0, 8)) {
      items.push({ id: `recall_${r.opportunityId}`, kind: "recall", title: r.title, detail: r.recommendation, href: `/deals/${r.opportunityId}` });
    }
  }

  if (prefs.lead_assigned) {
    const cutoff = Date.now() - 7 * DAY;
    const fresh = opps
      .filter((o) => new Date(o.createdAt).getTime() >= cutoff)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice(0, 5);
    for (const o of fresh) items.push({ id: `lead_${o.id}`, kind: "new_lead", title: o.title, detail: "New deal added to your pipeline", href: `/deals/${o.id}` });
  }

  if (prefs.stage_change) {
    const moves = activities.filter((a) => a.kind === "stage_change").slice(0, 5);
    for (const a of moves) {
      const opp = a.opportunityId ? oppById.get(a.opportunityId) : undefined;
      items.push({ id: `stage_${a.id}`, kind: "stage_change", title: opp?.title ?? "Deal", detail: a.summary, href: opp ? `/deals/${opp.id}` : "/pipeline" });
    }
  }

  return NextResponse.json({ count: items.length, items });
}
