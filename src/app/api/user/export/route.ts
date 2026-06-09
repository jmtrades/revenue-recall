import { NextResponse } from "next/server";
import { recordAudit } from "@/lib/audit";
import { getSessionUser } from "@/lib/auth";
import { resolveProvider } from "@/lib/crm/registry";
import { getActiveVoice } from "@/lib/voice";
import { getSubscription } from "@/lib/billing/store";
import { getOrgSettings } from "@/lib/org";
import { rateLimit, clientKey } from "@/lib/ratelimit";
import { logInfo, errMessage } from "@/lib/log";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GDPR/CCPA data access: download everything in your workspace as one JSON file.
 * Auth-gated by the middleware; the provider is org-scoped, so a user only ever
 * exports their own organization's data. Read-only.
 */
export async function GET(req: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "Sign in to export your data." }, { status: 401 });
  if (!rateLimit(clientKey(req, "data-export"), 5, 60_000).ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  await recordAudit("data.exported");
  const provider = (await resolveProvider());
  try {
    const [org, voice, subscription, contacts, opportunities, activities, pipelines] = await Promise.all([
      getOrgSettings(),
      getActiveVoice(),
      getSubscription(),
      provider.listContacts(),
      provider.listOpportunities(),
      provider.listRecentActivities(10000),
      provider.listPipelines(),
    ]);

    const payload = {
      exportedAt: new Date().toISOString(),
      account: { id: user.id, email: user.email, name: user.name },
      organization: { name: org.name, industry: org.industryId, language: org.language, currency: org.currency },
      subscription: { plan: subscription.plan, status: subscription.status, seats: subscription.seats },
      voice,
      pipelines,
      contacts,
      opportunities,
      activities,
      counts: { contacts: contacts.length, opportunities: opportunities.length, activities: activities.length },
    };

    logInfo("user.export", { contacts: contacts.length, opportunities: opportunities.length });
    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="revenue-recall-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: errMessage(e) || "Export failed" }, { status: 500 });
  }
}
