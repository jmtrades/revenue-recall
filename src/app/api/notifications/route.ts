import { NextResponse } from "next/server";
import { getProvider } from "@/lib/crm/registry";
import { getOrgSettings } from "@/lib/org";
import { buildRecallQueue } from "@/lib/recall/engine";
import { withGuard } from "@/lib/api/guard";

export const dynamic = "force-dynamic";

const DAY = 86_400_000;
// Inbound activity kinds that count as a prospect "reply".
const REPLY_KINDS = new Set(["email", "sms", "call", "note"]);

interface NotificationItem {
  id: string;
  kind: "reply" | "recall" | "new_lead" | "stage_change";
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
export const GET = withGuard(async () => {
  const provider = getProvider();
  const [{ notificationPrefs: prefs }, pipelines, opps, activities, contacts] = await Promise.all([
    getOrgSettings(),
    provider.listPipelines(),
    provider.listOpportunities(),
    provider.listRecentActivities(40),
    provider.listContacts(),
  ]);

  const oppById = new Map(opps.map((o) => [o.id, o]));
  const items: NotificationItem[] = [];

  // A lead replying is the most actionable signal — surface it first.
  if (prefs.reply) {
    const nameById = new Map(contacts.map((c) => [c.id, c.name]));
    const replies = activities.filter((a) => a.direction === "inbound" && REPLY_KINDS.has(a.kind)).slice(0, 6);
    for (const a of replies) {
      const who = (a.contactId && nameById.get(a.contactId)) || "A lead";
      const opp = a.opportunityId ? oppById.get(a.opportunityId) : undefined;
      const snippet = (a.summary ?? "").replace(/\s+/g, " ").trim().slice(0, 90);
      items.push({ id: `reply_${a.id}`, kind: "reply", title: `${who} replied`, detail: snippet || "New inbound message", href: opp ? `/deals/${opp.id}` : "/inbox" });
    }
  }

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
});
